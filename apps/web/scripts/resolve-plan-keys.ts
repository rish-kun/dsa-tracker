/**
 * One-off codegen: populate `canonicalKey` on every DsaProblem in
 * packages/plan-data/src/index.ts so /plan can auto-tick from detected solves.
 *
 * Resolves LC numbers against LeetCode's PUBLIC catalog endpoint.
 * Deliberately does NOT touch the database — no db import, no DATABASE_URL.
 *
 *   pnpm plan:keys -- --dry-run
 *   pnpm plan:keys
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLAN_DATA = resolve(__dirname, '../../../packages/plan-data/src/index.ts');

const EXPECTED_TOTAL = 72;
const EXPECTED_RESOLVED = 67;
const EXPECTED_SKIPPED = 5;

/** ID space canaries — if these shift, the catalog is not what we think it is. */
const ASSERTIONS: Array<[number, string]> = [
  [409, 'lc:longest-palindrome'],
  [226, 'lc:invert-binary-tree'],
  [102, 'lc:binary-tree-level-order-traversal'],
];

/** Same shape apps/web/src/lib/catalog.ts consumes. */
interface LcStatStatusPair {
  stat: {
    frontend_question_id: number;
    question__title_slug: string;
    question__title: string;
  };
  difficulty: { level: number };
  paid_only: boolean;
}

/**
 * A single-line problem literal, e.g.
 *   `      { name:"LC 724 Find Pivot Index",            difficulty:"E", category:"new" },`
 * `head` keeps the original alignment padding so the rewrite is byte-stable.
 */
const PROBLEM_LINE =
  /^(?<head>\s*\{\s*name:\s*"(?<name>[^"]*)".*?)(?<close>\s*\},?\s*)$/;

const LC_NUMBER = /^LC (\d+)\b/;

function slugToKey(slug: string): string {
  return `lc:${slug}`;
}

async function fetchCatalog(): Promise<Map<number, LcStatStatusPair['stat']>> {
  const res = await fetch('https://leetcode.com/api/problems/all/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal DSA tracker)' },
  });
  if (!res.ok) throw new Error(`LeetCode catalog fetch failed: ${res.status}`);
  const data = (await res.json()) as { stat_status_pairs: LcStatStatusPair[] };

  const byNumber = new Map<number, LcStatStatusPair['stat']>();
  for (const pair of data.stat_status_pairs) {
    if (!pair.stat.question__title_slug) continue;
    const id = Number(pair.stat.frontend_question_id);
    if (!Number.isFinite(id)) continue;
    byNumber.set(id, pair.stat);
  }
  return byNumber;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const source = readFileSync(PLAN_DATA, 'utf8');
  const lines = source.split('\n');

  const catalog = await fetchCatalog();
  console.log(`Catalog: ${catalog.size} problems by frontend_question_id\n`);

  // --- ID-space canaries -----------------------------------------------
  const canaryFailures: string[] = [];
  for (const [num, expected] of ASSERTIONS) {
    const stat = catalog.get(num);
    const actual = stat ? slugToKey(stat.question__title_slug) : '<missing>';
    const ok = actual === expected;
    console.log(`  assert LC ${num} -> ${actual} ${ok ? 'OK' : `FAIL (expected ${expected})`}`);
    if (!ok) canaryFailures.push(`LC ${num}: expected ${expected}, got ${actual}`);
  }
  console.log('');
  if (canaryFailures.length > 0) {
    console.error('ABORT: LeetCode ID space shifted — sanity assertions failed:');
    for (const f of canaryFailures) console.error(`  ${f}`);
    process.exit(1);
  }

  // --- Rewrite pass ----------------------------------------------------
  const resolved: Array<{ line: number; name: string; key: string }> = [];
  const skipped: string[] = [];
  const missing: Array<{ name: string; number: number }> = [];
  const edits: Array<{ line: number; before: string; after: string }> = [];

  const out = lines.map((line, i) => {
    const m = PROBLEM_LINE.exec(line);
    // Only DsaProblem literals: they always carry difficulty + category.
    if (!m?.groups || !line.includes('difficulty:') || !line.includes('category:')) {
      return line;
    }

    const name = m.groups.name;
    const numMatch = LC_NUMBER.exec(name);
    if (!numMatch) {
      skipped.push(name);
      return line;
    }

    const number = Number(numMatch[1]);
    const stat = catalog.get(number);
    if (!stat?.question__title_slug) {
      missing.push({ name, number });
      return line;
    }

    const key = slugToKey(stat.question__title_slug);
    resolved.push({ line: i + 1, name, key });

    // Idempotent: drop any pre-existing canonicalKey before re-adding.
    const head = m.groups.head.replace(/,\s*canonicalKey:\s*"[^"]*"/, '').trimEnd();
    const next = `${head}, canonicalKey:"${key}"${m.groups.close}`;
    if (next !== line) edits.push({ line: i + 1, before: line, after: next });
    return next;
  });

  const total = resolved.length + skipped.length + missing.length;

  // --- Fail loudly -----------------------------------------------------
  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(`${missing.length} LC number(s) absent from the catalog:`);
    for (const m of missing) problems.push(`    LC ${m.number} — ${m.name}`);
  }
  if (total !== EXPECTED_TOTAL) {
    problems.push(`expected ${EXPECTED_TOTAL} problem entries, matched ${total}`);
  }
  if (resolved.length !== EXPECTED_RESOLVED) {
    problems.push(`expected ${EXPECTED_RESOLVED} resolved, got ${resolved.length}`);
  }
  if (skipped.length !== EXPECTED_SKIPPED) {
    problems.push(`expected ${EXPECTED_SKIPPED} skipped (Striver), got ${skipped.length}`);
  }
  for (const r of resolved) {
    if (!r.key || r.key === 'lc:' || r.key.includes('undefined')) {
      problems.push(`bad key for "${r.name}": ${r.key}`);
    }
  }

  if (problems.length > 0) {
    console.error('ABORT: refusing to write packages/plan-data/src/index.ts');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  // --- Report ----------------------------------------------------------
  console.log('Mapping:');
  for (const r of resolved) {
    console.log(`  ${String(r.line).padStart(3)}  ${r.name.padEnd(56)} -> ${r.key}`);
  }
  console.log('');

  if (dryRun) {
    console.log(`Diff preview (${edits.length} line(s) would change):`);
    for (const e of edits) {
      console.log(`  @@ line ${e.line}`);
      console.log(`  - ${e.before}`);
      console.log(`  + ${e.after}`);
    }
    console.log('');
  }

  console.log(`resolved: ${resolved.length}  skipped: ${skipped.length}  total: ${total}`);
  console.log('skipped (no LC number — left without canonicalKey):');
  for (const s of skipped) console.log(`  - ${s}`);

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  writeFileSync(PLAN_DATA, out.join('\n'), 'utf8');
  console.log(`\nWrote ${PLAN_DATA} (${edits.length} line(s) changed).`);
}

main().catch((err) => {
  console.error('resolve-plan-keys failed:', err);
  process.exit(1);
});
