/**
 * One-off migration: the old prep-tracker's single `tracker_state` jsonb blob
 * (Neon Postgres) -> `plan_checks` / `plan_days` / `plan_counters` in this app's
 * Supabase database.
 *
 * The hard part is the check-ID rewrite. The old app built IDs by ARRAY POSITION
 * (`d3_t1`, `d3_p7`, `p2`, `r0`); this app uses stable slugs built exclusively by
 * `checkId` from @dsa-tracker/plan-data. `packages/plan-data` ports the source
 * arrays UNCHANGED, so the old indices still resolve — but only while that holds,
 * which is exactly what the bounds checks below verify.
 *
 * The old app also wrote tasks under TWO schemes that both rendered the same
 * checkbox (`d{i}_t{j}` in components/schedule.tsx, `d{i}_{j}` in
 * components/today-hero.tsx) and read them with `a || b`. They can therefore hold
 * CONTRADICTORY values. That is the bug this migration collapses: both fold onto
 * one new ID, resolved with OR, and every disagreement is reported.
 *
 *   # offline, zero database access (validate the rewrite first)
 *   pnpm plan:migrate -- --from-file ./legacy-state.json
 *
 *   # dry run against the live legacy Neon DB (reads only)
 *   pnpm plan:migrate
 *
 *   # actually write to DSA_TRACKER_DATABASE_URL
 *   pnpm plan:migrate -- --commit
 *
 * DRY RUN IS THE DEFAULT. Nothing is written without an explicit --commit.
 *
 * Source connection: NEON_LEGACY_DATABASE_URL, and *only* that name. There is a
 * deliberate no-fallback rule here — per CLAUDE.md the user's shell exports a
 * generic DATABASE_URL pointing at an unrelated Neon database, and it would win.
 * Target connection: the app's own client (`@/db` -> DSA_TRACKER_DATABASE_URL).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { sql } from 'drizzle-orm';
import { DAYS, PHASES, RESUME_ITEMS, checkId } from '@dsa-tracker/plan-data';
import { db, planChecks, planCounters, planDays } from '@/db';

// ---------------------------------------------------------------------------
// Source shape — authoritative copy of _source-dsa-track/lib/store.ts
// ---------------------------------------------------------------------------

type LegacyFloor = { dsa?: boolean; cpp?: boolean; log?: boolean };

type TrackerState = {
  checks: Record<string, boolean>;
  dsa: number;
  dsaHist: number[];
  dsaExtra: number;
  dsaExtraHist: number[];
  logs: Record<string, string>;
  floors: Record<string, LegacyFloor>;
  trips: string[];
};

/** DEFAULT_STATE from the source store — note the non-zero `dsa` seed. */
const LEGACY_DEFAULT_DSA = 83;
const LEGACY_DEFAULT_DSA_EXTRA = 0;

/** The old tracker_state row and the new plan_counters row are both singletons. */
const SINGLETON_ID = 'singleton';

/** Imported lazily so --from-file runs with the package absent from node_modules. */
const NEON_MODULE = '@neondatabase/serverless';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Multi-row upserts are chunked to keep each statement a sane size. */
const UPSERT_CHUNK = 200;

// ---------------------------------------------------------------------------
// Rewrite model
// ---------------------------------------------------------------------------

type Category = 'task' | 'problem' | 'phase' | 'resume';

/** Which old ID scheme produced a mapping — the two task schemes collide. */
type Scheme = 'task:d_t' | 'task:d_' | 'problem' | 'phase' | 'resume';

type Contribution = { oldKey: string; value: boolean; scheme: Scheme };

type Resolved = {
  newId: string;
  category: Category;
  done: boolean;
  contributions: Contribution[];
};

type Unmapped = { oldKey: string; value: boolean; reason: string };

type DayRow = {
  date: string;
  log: string | null;
  floorDsa: boolean;
  floorCpp: boolean;
  floorLog: boolean;
  trip: boolean;
};

type CountersRow = {
  id: string;
  dsa: number;
  dsaExtra: number;
  dsaHist: number[];
  dsaExtraHist: number[];
};

type Rewrite = {
  sourceKeyCount: number;
  resolved: Resolved[];
  unmapped: Unmapped[];
  dayRows: DayRow[];
  invalidDates: Array<{ key: string; origin: string }>;
  counters: CountersRow;
  defaultedFields: string[];
};

// Old ID grammars. `d{i}_{j}` cannot swallow `d{i}_t{j}` / `d{i}_p{j}` because
// `t2` / `p2` are not digit runs.
const RE_TASK_MODERN = /^d(\d+)_t(\d+)$/;
const RE_TASK_LEGACY = /^d(\d+)_(\d+)$/;
const RE_PROBLEM = /^d(\d+)_p(\d+)$/;
const RE_PHASE = /^p(\d+)$/;
const RE_RESUME = /^r(\d+)$/;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown, fallback: number, name: string, defaulted: string[]): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  defaulted.push(`${name} (absent/invalid -> ${fallback})`);
  return fallback;
}

function toNumberArray(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

/**
 * Mirror the source store's `normalize()`. Notably `dsa` defaults to 83, not 0 —
 * a blob written before the first counter click still means "83".
 */
function normalizeState(raw: unknown): { state: TrackerState; defaulted: string[] } {
  if (!isPlainObject(raw)) {
    throw new Error('source state is not a JSON object');
  }
  const defaulted: string[] = [];

  const checks: Record<string, boolean> = {};
  if (isPlainObject(raw.checks)) {
    for (const [k, v] of Object.entries(raw.checks)) checks[k] = Boolean(v);
  } else {
    defaulted.push('checks (absent -> {})');
  }

  const logs: Record<string, string> = {};
  if (isPlainObject(raw.logs)) {
    for (const [k, v] of Object.entries(raw.logs)) {
      if (typeof v === 'string') logs[k] = v;
    }
  } else {
    defaulted.push('logs (absent -> {})');
  }

  const floors: Record<string, LegacyFloor> = {};
  if (isPlainObject(raw.floors)) {
    for (const [k, v] of Object.entries(raw.floors)) {
      if (!isPlainObject(v)) continue;
      floors[k] = { dsa: Boolean(v.dsa), cpp: Boolean(v.cpp), log: Boolean(v.log) };
    }
  } else {
    defaulted.push('floors (absent -> {})');
  }

  const trips = Array.isArray(raw.trips)
    ? raw.trips.filter((t): t is string => typeof t === 'string')
    : [];
  if (!Array.isArray(raw.trips)) defaulted.push('trips (absent -> [])');

  return {
    state: {
      checks,
      dsa: toNumber(raw.dsa, LEGACY_DEFAULT_DSA, 'dsa', defaulted),
      dsaHist: toNumberArray(raw.dsaHist),
      dsaExtra: toNumber(raw.dsaExtra, LEGACY_DEFAULT_DSA_EXTRA, 'dsaExtra', defaulted),
      dsaExtraHist: toNumberArray(raw.dsaExtraHist),
      logs,
      floors,
      trips,
    },
    defaulted,
  };
}

// ---------------------------------------------------------------------------
// The rewrite
// ---------------------------------------------------------------------------

/**
 * Map one old key to its new ID, or explain why it cannot be mapped.
 *
 * Every failure path here means the same thing: the arrays in
 * `packages/plan-data` no longer line up with the ones the old app indexed
 * against. That is silent data loss, so it is surfaced rather than skipped.
 */
function mapKey(oldKey: string): { newId: string; category: Category; scheme: Scheme } | string {
  let m: RegExpExecArray | null;

  if ((m = RE_TASK_MODERN.exec(oldKey))) {
    const i = Number(m[1]);
    const j = Number(m[2]);
    const day = DAYS[i];
    if (!day) return `day index ${i} out of range (DAYS.length=${DAYS.length})`;
    if (j >= day.tasks.length) {
      return `task index ${j} out of range for DAYS[${i}] "${day.date}" (tasks=${day.tasks.length})`;
    }
    return { newId: checkId.task(day.date, j), category: 'task', scheme: 'task:d_t' };
  }

  if ((m = RE_PROBLEM.exec(oldKey))) {
    const i = Number(m[1]);
    const k = Number(m[2]);
    const day = DAYS[i];
    if (!day) return `day index ${i} out of range (DAYS.length=${DAYS.length})`;
    const problems = day.problems ?? [];
    if (k >= problems.length) {
      return `problem index ${k} out of range for DAYS[${i}] "${day.date}" (problems=${problems.length})`;
    }
    return {
      newId: checkId.problem(day.date, problems[k]),
      category: 'problem',
      scheme: 'problem',
    };
  }

  // Checked after the two prefixed forms: `d1_2` only, never `d1_t2` / `d1_p2`.
  if ((m = RE_TASK_LEGACY.exec(oldKey))) {
    const i = Number(m[1]);
    const j = Number(m[2]);
    const day = DAYS[i];
    if (!day) return `day index ${i} out of range (DAYS.length=${DAYS.length})`;
    if (j >= day.tasks.length) {
      return `task index ${j} out of range for DAYS[${i}] "${day.date}" (tasks=${day.tasks.length})`;
    }
    return { newId: checkId.task(day.date, j), category: 'task', scheme: 'task:d_' };
  }

  if ((m = RE_PHASE.exec(oldKey))) {
    const i = Number(m[1]);
    const phase = PHASES[i];
    if (!phase) return `phase index ${i} out of range (PHASES.length=${PHASES.length})`;
    return { newId: checkId.phase(phase), category: 'phase', scheme: 'phase' };
  }

  if ((m = RE_RESUME.exec(oldKey))) {
    const i = Number(m[1]);
    const item = RESUME_ITEMS[i];
    if (item === undefined) {
      return `resume index ${i} out of range (RESUME_ITEMS.length=${RESUME_ITEMS.length})`;
    }
    return { newId: checkId.resume(item), category: 'resume', scheme: 'resume' };
  }

  return 'unrecognised key shape';
}

function buildDayRows(state: TrackerState): {
  rows: DayRow[];
  invalid: Array<{ key: string; origin: string }>;
} {
  const invalid: Array<{ key: string; origin: string }> = [];
  const tripSet = new Set<string>();

  const consider = (key: string, origin: string): boolean => {
    if (!DATE_KEY.test(key)) {
      invalid.push({ key, origin });
      return false;
    }
    return true;
  };

  const dates = new Set<string>();
  for (const k of Object.keys(state.logs)) if (consider(k, 'logs')) dates.add(k);
  for (const k of Object.keys(state.floors)) if (consider(k, 'floors')) dates.add(k);
  for (const k of state.trips) {
    if (consider(k, 'trips')) {
      dates.add(k);
      tripSet.add(k);
    }
  }

  const rows = [...dates].sort().map((date) => {
    const floor = state.floors[date] ?? {};
    const log = (state.logs[date] ?? '').trim();
    return {
      date,
      log: log.length > 0 ? log : null,
      floorDsa: Boolean(floor.dsa),
      floorCpp: Boolean(floor.cpp),
      floorLog: Boolean(floor.log),
      trip: tripSet.has(date),
    };
  });

  return { rows, invalid };
}

function rewrite(state: TrackerState, defaulted: string[]): Rewrite {
  const byNewId = new Map<string, Resolved>();
  const unmapped: Unmapped[] = [];

  for (const oldKey of Object.keys(state.checks).sort()) {
    const value = Boolean(state.checks[oldKey]);
    const mapped = mapKey(oldKey);

    if (typeof mapped === 'string') {
      unmapped.push({ oldKey, value, reason: mapped });
      continue;
    }

    const existing = byNewId.get(mapped.newId);
    if (existing) {
      // Collision. OR wins: a `true` from either scheme means the user ticked it.
      existing.done = existing.done || value;
      existing.contributions.push({ oldKey, value, scheme: mapped.scheme });
    } else {
      byNewId.set(mapped.newId, {
        newId: mapped.newId,
        category: mapped.category,
        done: value,
        contributions: [{ oldKey, value, scheme: mapped.scheme }],
      });
    }
  }

  const { rows: dayRows, invalid: invalidDates } = buildDayRows(state);

  return {
    sourceKeyCount: Object.keys(state.checks).length,
    resolved: [...byNewId.values()].sort((a, b) => a.newId.localeCompare(b.newId)),
    unmapped,
    dayRows,
    invalidDates,
    counters: {
      id: SINGLETON_ID,
      dsa: state.dsa,
      dsaExtra: state.dsaExtra,
      dsaHist: state.dsaHist,
      dsaExtraHist: state.dsaExtraHist,
    },
    defaultedFields: defaulted,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function collisions(r: Rewrite): Resolved[] {
  return r.resolved.filter((x) => x.contributions.length > 1);
}

function disagreements(r: Rewrite): Resolved[] {
  return collisions(r).filter((x) => {
    const first = x.contributions[0].value;
    return x.contributions.some((c) => c.value !== first);
  });
}

function report(r: Rewrite, opts: { showMapping: boolean }): void {
  const line = (s = '') => console.log(s);
  const rule = (title: string) => {
    line();
    line(`── ${title} ${'─'.repeat(Math.max(0, 68 - title.length))}`);
  };

  const byCategory = (c: Category) => r.resolved.filter((x) => x.category === c);
  const bySchemeCount = (s: Scheme) =>
    r.resolved.reduce((n, x) => n + x.contributions.filter((c) => c.scheme === s).length, 0);

  rule('RECONCILIATION');
  line(`source check keys      : ${r.sourceKeyCount}`);
  line(`rewritten (unique ids) : ${r.resolved.length}`);
  line(`unmapped               : ${r.unmapped.length}`);
  if (r.defaultedFields.length > 0) {
    line(`defaulted fields       : ${r.defaultedFields.join(', ')}`);
  }

  rule('BY CATEGORY');
  for (const c of ['task', 'problem', 'phase', 'resume'] as Category[]) {
    line(`  ${c.padEnd(8)} ${String(byCategory(c).length).padStart(4)} new id(s)`);
  }
  line();
  line('  source-key contributions by old scheme:');
  line(`    d{i}_t{j}  (schedule.tsx)  : ${bySchemeCount('task:d_t')}`);
  line(`    d{i}_{j}   (today-hero.tsx): ${bySchemeCount('task:d_')}`);
  line(`    d{i}_p{k}                  : ${bySchemeCount('problem')}`);
  line(`    p{i}                       : ${bySchemeCount('phase')}`);
  line(`    r{i}                       : ${bySchemeCount('resume')}`);

  const cols = collisions(r);
  const bad = disagreements(r);
  rule('COLLISIONS (two old keys -> one new id)');
  line(`collided ids   : ${cols.length}`);
  line(`  of which DISAGREED: ${bad.length}  (resolved with OR — true wins)`);
  if (bad.length > 0) {
    line();
    line('  disagreeing pairs — eyeball these:');
    for (const c of bad) {
      const parts = c.contributions.map((x) => `${x.oldKey}=${x.value}`).join('  vs  ');
      line(`    ${c.newId}`);
      line(`        ${parts}   ->  done=${c.done}`);
    }
  }
  if (cols.length > bad.length) {
    line();
    line(`  ${cols.length - bad.length} collision(s) agreed; no action needed.`);
  }

  rule('UNMAPPED (pass/fail signal — must be 0)');
  if (r.unmapped.length === 0) {
    line('none — every source key resolved to a stable id.');
  } else {
    line(`${r.unmapped.length} key(s) could NOT be rewritten. These would be SILENT DATA LOSS:`);
    for (const u of r.unmapped) {
      line(`  ${u.oldKey.padEnd(16)} = ${String(u.value).padEnd(5)}  ${u.reason}`);
    }
  }

  if (r.invalidDates.length > 0) {
    rule('INVALID DATE KEYS');
    line(`${r.invalidDates.length} key(s) are not YYYY-MM-DD and were dropped:`);
    for (const d of r.invalidDates) line(`  ${d.origin}: ${JSON.stringify(d.key)}`);
  }

  rule('ROWS THAT WOULD BE WRITTEN');
  line(`plan_checks    : ${r.resolved.length} row(s)   (${
    r.resolved.filter((x) => x.done).length
  } done=true, ${r.resolved.filter((x) => !x.done).length} done=false)`);
  line(`plan_days      : ${r.dayRows.length} row(s)`);
  line(`plan_counters  : 1 row ('${r.counters.id}')`);

  if (r.dayRows.length > 0) {
    line();
    line('  date        dsa  cpp  log  trip  log text');
    for (const d of r.dayRows) {
      const flag = (b: boolean) => (b ? ' Y ' : ' . ');
      const text = d.log === null ? '—' : JSON.stringify(d.log.slice(0, 44));
      line(
        `  ${d.date} ${flag(d.floorDsa)}  ${flag(d.floorCpp)}  ${flag(d.floorLog)}  ${flag(
          d.trip,
        )}  ${text}`,
      );
    }
  }

  line();
  line('  plan_counters:');
  line(`    dsa           = ${r.counters.dsa}`);
  line(`    dsaExtra      = ${r.counters.dsaExtra}`);
  line(`    dsaHist       = [${r.counters.dsaHist.join(', ')}]  (${r.counters.dsaHist.length})`);
  line(
    `    dsaExtraHist  = [${r.counters.dsaExtraHist.join(', ')}]  (${r.counters.dsaExtraHist.length})`,
  );

  if (opts.showMapping) {
    rule('FULL MAPPING');
    for (const x of r.resolved) {
      const from = x.contributions.map((c) => c.oldKey).join(' + ');
      line(`  ${from.padEnd(20)} -> ${x.newId.padEnd(52)} done=${x.done}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------

function loadFromFile(path: string): unknown {
  const abs = resolvePath(process.cwd(), path);
  const raw = readFileSync(abs, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  // Accept either the bare TrackerState or a `{ state: ... }` / row wrapper, so a
  // blob copied straight out of a psql/Neon console result still works.
  if (isPlainObject(parsed) && 'state' in parsed && isPlainObject(parsed.state)) {
    return parsed.state;
  }
  if (Array.isArray(parsed) && parsed.length > 0 && isPlainObject(parsed[0])) {
    const first = parsed[0] as Record<string, unknown>;
    if (isPlainObject(first.state)) return first.state;
  }
  return parsed;
}

type NeonQuery = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

function legacyUrl(): string {
  // Deliberately no DATABASE_URL fallback: see the file header.
  const url = process.env.NEON_LEGACY_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'NEON_LEGACY_DATABASE_URL is not set.\n' +
        '  This script never falls back to DATABASE_URL — a generic value exported by\n' +
        '  your shell points at an unrelated Neon database and would silently win.\n' +
        '  Set NEON_LEGACY_DATABASE_URL in apps/web/.env, or use --from-file for an\n' +
        '  offline run (see docs/plan-migration.md).',
    );
  }
  if (/^NEON_LEGACY_DATABASE_URL\s*=/i.test(url)) {
    throw new Error(
      'NEON_LEGACY_DATABASE_URL must contain only the connection URI; drop the "NAME=" prefix.',
    );
  }
  if (!/^postgres(?:ql)?:\/\//i.test(url)) {
    throw new Error('NEON_LEGACY_DATABASE_URL must begin with postgres:// or postgresql://.');
  }
  const target = process.env.DSA_TRACKER_DATABASE_URL?.trim();
  if (target && target === url) {
    throw new Error(
      'NEON_LEGACY_DATABASE_URL is identical to DSA_TRACKER_DATABASE_URL. Refusing to ' +
        'migrate a database onto itself.',
    );
  }
  return url;
}

async function loadFromNeon(): Promise<unknown> {
  const url = legacyUrl();
  // Non-literal specifier: keeps `tsc` green (and --from-file runnable) when
  // @neondatabase/serverless has not been installed yet.
  const specifier: string = NEON_MODULE;
  let neon: (u: string) => NeonQuery;
  try {
    ({ neon } = (await import(specifier)) as { neon: (u: string) => NeonQuery });
  } catch {
    throw new Error(
      `Cannot load ${NEON_MODULE}. It is declared in apps/web devDependencies — run ` +
        '`pnpm install` at the repo root, or use --from-file to run fully offline.',
    );
  }

  const q = neon(url);
  const rows = (await q`SELECT state FROM tracker_state WHERE id = ${SINGLETON_ID}`) as Array<{
    state?: unknown;
  }>;
  if (rows.length === 0) {
    throw new Error(`tracker_state has no row with id = '${SINGLETON_ID}' — nothing to migrate.`);
  }
  const state = rows[0]?.state;
  // neon() may hand back jsonb already parsed, or as text depending on driver config.
  return typeof state === 'string' ? (JSON.parse(state) as unknown) : state;
}

// ---------------------------------------------------------------------------
// Writes — every statement upserts, so a re-run is idempotent.
// ---------------------------------------------------------------------------

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function commit(userId: string, r: Rewrite): Promise<void> {
  const updatedAt = new Date();

  if (r.resolved.length > 0) {
    for (const batch of chunk(r.resolved, UPSERT_CHUNK)) {
      await db
        .insert(planChecks)
        .values(batch.map((x) => ({ userId, checkId: x.newId, done: x.done, updatedAt })))
        .onConflictDoUpdate({
          target: [planChecks.userId, planChecks.checkId],
          set: { done: sql`excluded.done`, updatedAt: sql`excluded.updated_at` },
        });
    }
    console.log(`plan_checks   : upserted ${r.resolved.length} row(s)`);
  }

  if (r.dayRows.length > 0) {
    for (const batch of chunk(r.dayRows, UPSERT_CHUNK)) {
      await db
        .insert(planDays)
        .values(batch.map((row) => ({ userId, ...row })))
        .onConflictDoUpdate({
          target: [planDays.userId, planDays.date],
          set: {
            log: sql`excluded.log`,
            floorDsa: sql`excluded.floor_dsa`,
            floorCpp: sql`excluded.floor_cpp`,
            floorLog: sql`excluded.floor_log`,
            trip: sql`excluded.trip`,
          },
        });
    }
    console.log(`plan_days     : upserted ${r.dayRows.length} row(s)`);
  }

  await db
    .insert(planCounters)
    .values({ userId, ...r.counters })
    .onConflictDoUpdate({
      target: [planCounters.userId, planCounters.id],
      set: {
        dsa: r.counters.dsa,
        dsaExtra: r.counters.dsaExtra,
        dsaHist: r.counters.dsaHist,
        dsaExtraHist: r.counters.dsaExtraHist,
      },
    });
  console.log(`plan_counters : upserted 1 row ('${r.counters.id}')`);
}

/**
 * Release the postgres.js pool so the process exits on its own. Only ever called
 * after a commit — touching `db` at all instantiates the client, which a dry run
 * must never do.
 */
async function closeTargetClient(): Promise<void> {
  const client = (db as unknown as { $client?: { end?: () => Promise<unknown> } }).$client;
  await client?.end?.();
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function flagValue(argv: string[], name: string): string | undefined {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  if (i >= 0) {
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) return next;
    throw new Error(`${name} requires a value`);
  }
  return undefined;
}

const USAGE = `migrate-neon-plan — old tracker_state jsonb -> plan_checks / plan_days / plan_counters

  --from-file <path>   read the blob from a JSON file (NO database access at all)
  --commit             actually write to DSA_TRACKER_DATABASE_URL (default: dry run)
  --user-id <id>       Clerk user ID to own the imported plan (required with --commit)
  --allow-unmapped     permit --commit even with unmapped keys (accepts data loss)
  --show-mapping       print the full old-id -> new-id mapping
  -h, --help           this message

Source (without --from-file) is NEON_LEGACY_DATABASE_URL. DATABASE_URL is never used.`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(USAGE);
    return;
  }

  const fromFile = flagValue(argv, '--from-file');
  const doCommit = argv.includes('--commit');
  const userId = flagValue(argv, '--user-id');
  const allowUnmapped = argv.includes('--allow-unmapped');
  const showMapping = argv.includes('--show-mapping');

  const mode = fromFile ? `file (${fromFile})` : 'neon (NEON_LEGACY_DATABASE_URL)';
  console.log(`source : ${mode}`);
  console.log(`mode   : ${doCommit ? 'COMMIT — writes will be applied' : 'DRY RUN — no writes'}`);
  console.log(
    `plan   : DAYS=${DAYS.length}  PHASES=${PHASES.length}  RESUME_ITEMS=${RESUME_ITEMS.length}`,
  );

  const raw = fromFile ? loadFromFile(fromFile) : await loadFromNeon();
  const { state, defaulted } = normalizeState(raw);
  const result = rewrite(state, defaulted);

  report(result, { showMapping });

  const failed = result.unmapped.length > 0 || result.invalidDates.length > 0;

  console.log();
  if (!doCommit) {
    if (failed) {
      console.log(
        'RESULT: FAIL — unresolved keys above. Fix the mapping (or the plan-data arrays) ' +
          'before committing.',
      );
      console.log('Nothing was written. This was a dry run.');
      process.exitCode = 1;
      return;
    }
    console.log('RESULT: PASS — 0 unmapped keys. Re-run with --commit to apply.');
    console.log('Nothing was written. This was a dry run.');
    return;
  }

  if (failed && !allowUnmapped) {
    console.error(
      'ABORT: refusing to --commit with unmapped keys. Re-run with --allow-unmapped to ' +
        'accept the loss, or fix the mapping first.',
    );
    process.exitCode = 1;
    return;
  }

  if (!userId) {
    console.error('ABORT: --user-id <Clerk user ID> is required with --commit.');
    process.exitCode = 1;
    return;
  }

  if (fromFile) {
    console.log('Committing from file source into DSA_TRACKER_DATABASE_URL...');
  }
  await commit(userId, result);
  await closeTargetClient();
  console.log('Done. Re-running is safe — every statement is an upsert.');
}

main().catch((err: unknown) => {
  console.error('\nmigrate-neon-plan failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
