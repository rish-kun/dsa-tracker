import { PLAN_TZ, localDateKey } from '@dsa-tracker/plan-data';
import { eq, gte, sql } from 'drizzle-orm';
import { db, planChecks, planCounters, planDays, solvedProblems, solveEvents } from '@/db';
import { publicErrorMessage } from '@/lib/api-error';

/** The plan_counters table holds exactly one row, keyed by this id. */
const COUNTERS_ID = 'singleton';

/** NeetCode 150 — both manual counters are clamped to this ceiling. */
const MAX_DSA = 150;

/** Problems/day required to clear the DSA floor. */
const DSA_FLOOR = 4;

/** How far back calcStreak walks. Ported from _source-dsa-track/lib/store.ts. */
const STREAK_WINDOW_DAYS = 60;

export type PlanDayState = {
  log: string | null;
  floorDsa: boolean;
  floorCpp: boolean;
  floorLog: boolean;
  trip: boolean;
};

export type PlanCounters = {
  dsa: number;
  dsaExtra: number;
  dsaHist: number[];
  dsaExtraHist: number[];
};

export type PlanState = {
  checks: Record<string, boolean>;
  days: Record<string, PlanDayState>;
  counters: PlanCounters;
};

export type LiveSolveStats = {
  solvedPerDay: Record<string, number>;
};

/**
 * Fresh empty state. A factory rather than a shared const so a caller that
 * mutates the fallback cannot poison the next render.
 */
function emptyPlanState(): PlanState {
  return {
    checks: {},
    days: {},
    counters: { dsa: 0, dsaExtra: 0, dsaHist: [], dsaExtraHist: [] },
  };
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number') : [];
}

function assertDateKey(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`invalid plan date key: ${date}`);
  }
}

// ---------------------------------------------------------------------------
// Reads — never throw. The /plan page must render against an unreachable or
// empty database (builds run without DATABASE_URL), same contract as
// getDashboardStats in lib/dashboard-stats.ts.
// ---------------------------------------------------------------------------

/** Shape of the single row returned by the getPlanState query. */
type PlanStateRow = {
  checks: Record<string, boolean>;
  days: Record<string, PlanDayState> | null;
  counters: {
    dsa: number;
    dsaExtra: number;
    dsaHist: unknown;
    dsaExtraHist: unknown;
  } | null;
};

/**
 * Whole persisted plan state in one pass. A missing counters singleton yields
 * zeroed defaults — reads never insert.
 *
 * All three tables are read in a single statement of scalar subqueries. That
 * is the right direction on the max: 1 client: it is one round trip, not three
 * concurrent ones, so transaction-mode Supavisor still never sees a fan-out.
 * `json_object_agg` builds the two keyed maps server-side, which is exactly the
 * `for` loops this used to run over the row lists.
 */
export async function getPlanState(): Promise<PlanState> {
  try {
    const rows = await db.execute<PlanStateRow>(sql`
      select
        coalesce(
          (select json_object_agg(c.check_id, c.done) from ${planChecks} c),
          '{}'::json
        ) as checks,
        (select json_object_agg(
           d."date",
           json_build_object(
             'log', d.log,
             'floorDsa', d.floor_dsa,
             'floorCpp', d.floor_cpp,
             'floorLog', d.floor_log,
             'trip', d.trip
           )
         ) from ${planDays} d) as days,
        (select json_build_object(
           'dsa', p.dsa,
           'dsaExtra', p.dsa_extra,
           'dsaHist', p.dsa_hist,
           'dsaExtraHist', p.dsa_extra_hist
         ) from ${planCounters} p where p.id = ${COUNTERS_ID}) as counters
    `);

    const row = rows[0];
    const counters = row?.counters;

    return {
      checks: row?.checks ?? {},
      days: row?.days ?? {},
      counters: counters
        ? {
            dsa: counters.dsa,
            dsaExtra: counters.dsaExtra,
            dsaHist: toNumberArray(counters.dsaHist),
            dsaExtraHist: toNumberArray(counters.dsaExtraHist),
          }
        : emptyPlanState().counters,
    };
  } catch (err) {
    console.error(`getPlanState failed, rendering empty state: ${publicErrorMessage(err)}`);
    return emptyPlanState();
  }
}

/**
 * Canonical keys of every solved problem, for deriving plan checkboxes from
 * real solves. Selects only the key column — getAllSolved() would additionally
 * fetch every row's metadata and chunk-join solve_events, which this never needs.
 */
export async function getSolvedKeySet(): Promise<Set<string>> {
  try {
    const rows = await db
      .select({ canonicalKey: solvedProblems.canonicalKey })
      .from(solvedProblems);
    return new Set(rows.map((row) => row.canonicalKey));
  } catch (err) {
    console.error(`getSolvedKeySet failed, returning empty set: ${publicErrorMessage(err)}`);
    return new Set();
  }
}

type LiveSolveStatsRow = {
  solvedPerDay: Record<string, number>;
};

/**
 * Distinct, genuinely live solves per plan-local day for the activity metric
 * and daily DSA floor.
 * Backfills/imports deliberately do not count: their event timestamps describe
 * the import, not the day the problem was solved.
 */
export async function getLiveSolveStats(): Promise<LiveSolveStats> {
  try {
    const rows = await db.execute<LiveSolveStatsRow>(sql`
      select
        coalesce(
          (select json_object_agg(per_day.day, per_day.n)
           from (
             select
               to_char(day_events.created_at at time zone ${PLAN_TZ}, 'YYYY-MM-DD') as day,
               count(distinct day_events.canonical_key)::int as n
             from ${solveEvents} day_events
             where day_events.detected <> 'backfill'
             group by 1
           ) per_day),
          '{}'::json
        ) as "solvedPerDay"
    `);

    return rows[0] ?? { solvedPerDay: {} };
  } catch (err) {
    console.error(`getLiveSolveStats failed, returning empty stats: ${publicErrorMessage(err)}`);
    return { solvedPerDay: {} };
  }
}

/**
 * Consecutive-day streak, ported from calcStreak in _source-dsa-track/lib/store.ts:
 * walk back from today up to 60 days; a day counts when it is a trip day or all
 * three floors are met; today alone is forgiven if it is not yet complete.
 *
 * One windowed query plus an in-memory walk — never 60 round trips.
 */
export async function getPlanStreak(solvedPerDay: Record<string, number> = {}): Promise<number> {
  try {
    const cursor = new Date();
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - (STREAK_WINDOW_DAYS - 1));

    // plan_days.date is a 'YYYY-MM-DD' text key, so lexical >= is a date range.
    const rows = await db
      .select({
        date: planDays.date,
        floorDsa: planDays.floorDsa,
        floorCpp: planDays.floorCpp,
        floorLog: planDays.floorLog,
        trip: planDays.trip,
      })
      .from(planDays)
      .where(gte(planDays.date, localDateKey(windowStart)));

    const byDate = new Map(rows.map((row) => [row.date, row]));

    let streak = 0;
    let isToday = true;
    for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
      const row = byDate.get(localDateKey(cursor));
      const floorDsa = Boolean(row?.floorDsa || (solvedPerDay[localDateKey(cursor)] ?? 0) >= DSA_FLOOR);
      const ok = Boolean(row && (row.trip || (floorDsa && row.floorCpp && row.floorLog)));
      if (ok) {
        streak++;
      } else if (!isToday) {
        break;
      }
      // An incomplete today does not break the streak; any earlier gap does.
      isToday = false;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  } catch (err) {
    console.error(`getPlanStreak failed, returning 0: ${publicErrorMessage(err)}`);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Writes — each a single-row upsert. These deliberately do NOT catch: a failed
// mutation must surface to the Server Action instead of silently no-opping.
// ---------------------------------------------------------------------------

export async function setCheck(checkId: string, done: boolean): Promise<void> {
  if (!checkId) throw new Error('setCheck requires a check id');
  const updatedAt = new Date();
  await db
    .insert(planChecks)
    .values({ checkId, done, updatedAt })
    .onConflictDoUpdate({ target: planChecks.checkId, set: { done, updatedAt } });
}

type FloorPatch = { floorDsa: boolean } | { floorCpp: boolean } | { floorLog: boolean };

function floorPatch(which: 'dsa' | 'cpp' | 'log', value: boolean): FloorPatch {
  switch (which) {
    case 'dsa':
      return { floorDsa: value };
    case 'cpp':
      return { floorCpp: value };
    case 'log':
      return { floorLog: value };
  }
}

export async function setFloor(
  date: string,
  which: 'dsa' | 'cpp' | 'log',
  value: boolean,
): Promise<void> {
  assertDateKey(date);
  const patch = floorPatch(which, value);
  await db
    .insert(planDays)
    .values({ date, ...patch })
    .onConflictDoUpdate({ target: planDays.date, set: patch });
}

export async function setTrip(date: string, value: boolean): Promise<void> {
  assertDateKey(date);
  await db
    .insert(planDays)
    .values({ date, trip: value })
    .onConflictDoUpdate({ target: planDays.date, set: { trip: value } });
}

/**
 * Persist the day's log. Saving a log also claims the "log" floor, matching the
 * source store. Clearing a log never un-claims a floor that is already set.
 */
export async function saveLog(date: string, text: string): Promise<void> {
  assertDateKey(date);
  const log = text.trim();
  const claimsFloor = log.length > 0;
  await db
    .insert(planDays)
    .values({ date, log: log || null, floorLog: claimsFloor })
    .onConflictDoUpdate({
      target: planDays.date,
      set: { log: log || null, ...(claimsFloor ? { floorLog: true } : {}) },
    });
}

/** Whole positive increments only; anything else is ignored, as in the source store. */
function normalizeIncrement(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const inc = Math.floor(n);
  return inc > 0 ? inc : null;
}

/**
 * Clamp the counter to MAX_DSA and push the raw increment onto its history, in
 * one atomic upsert — a read-modify-write from the app would race concurrent
 * clicks and cost an extra round trip on the max: 1 client.
 */
async function bumpCounter(which: 'dsa' | 'extra', inc: number): Promise<void> {
  const valueCol = which === 'dsa' ? planCounters.dsa : planCounters.dsaExtra;
  const histCol = which === 'dsa' ? planCounters.dsaHist : planCounters.dsaExtraHist;
  const bumped = sql`least(${sql.raw(String(MAX_DSA))}, ${valueCol} + ${inc})`;
  const pushed = sql`${histCol} || ${JSON.stringify(inc)}::jsonb`;

  await db
    .insert(planCounters)
    .values(
      which === 'dsa'
        ? { id: COUNTERS_ID, dsa: Math.min(MAX_DSA, inc), dsaHist: [inc] }
        : { id: COUNTERS_ID, dsaExtra: Math.min(MAX_DSA, inc), dsaExtraHist: [inc] },
    )
    .onConflictDoUpdate({
      target: planCounters.id,
      set:
        which === 'dsa'
          ? { dsa: bumped, dsaHist: pushed }
          : { dsaExtra: bumped, dsaExtraHist: pushed },
    });
}

/**
 * Pop the last history entry and subtract it. `jsonb - (-1)` drops the final
 * array element; the counter floors at 0 because the add path clamps at
 * MAX_DSA while history keeps the un-clamped increment.
 */
async function popCounter(which: 'dsa' | 'extra'): Promise<void> {
  const valueCol = which === 'dsa' ? planCounters.dsa : planCounters.dsaExtra;
  const histCol = which === 'dsa' ? planCounters.dsaHist : planCounters.dsaExtraHist;
  const restored = sql`greatest(0, ${valueCol} - coalesce((${histCol} -> -1)::int, 0))`;
  const popped = sql`case when jsonb_array_length(${histCol}) > 0
    then ${histCol} - (-1) else ${histCol} end`;

  await db
    .update(planCounters)
    .set(which === 'dsa' ? { dsa: restored, dsaHist: popped } : { dsaExtra: restored, dsaExtraHist: popped })
    .where(eq(planCounters.id, COUNTERS_ID));
}

/** Count of DSA problems already credited to `date` (checked plan problems). */
async function dsaSolvedOn(date: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(planChecks)
    .where(sql`${planChecks.done} and ${planChecks.checkId} like ${`prob:${date}:%`}`);
  return row?.count ?? 0;
}

export async function addDsa(n: number): Promise<void> {
  const inc = normalizeIncrement(n);
  if (inc === null) return;
  await bumpCounter('dsa', inc);
  if (inc >= DSA_FLOOR) await setFloor(localDateKey(), 'dsa', true);
}

export async function undoDsa(): Promise<void> {
  await popCounter('dsa');
}

export async function addDsaExtra(n: number): Promise<void> {
  const inc = normalizeIncrement(n);
  if (inc === null) return;
  await bumpCounter('extra', inc);

  // The source store's comment said extras "count toward the daily floor if
  // total solved >= 4" but its code tested the single increment (n >= 4).
  // Implementing the comment's intent: the floor is claimed when the day's
  // total — problems already checked off for today plus these extras —
  // reaches DSA_FLOOR.
  const today = localDateKey();
  const total = (await dsaSolvedOn(today)) + inc;
  if (total >= DSA_FLOOR) await setFloor(today, 'dsa', true);
}

export async function undoDsaExtra(): Promise<void> {
  await popCounter('extra');
}
