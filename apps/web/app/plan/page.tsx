import {
  DAYS,
  NEETCODE_150_KEYS,
  PHASES,
  checkId,
  localDateKey,
} from '@dsa-tracker/plan-data';
import type { Metadata } from 'next';
import { PlanClient } from '@/components/plan/plan-client';
import type { PlanViewState } from '@/components/plan/types';
import type { PlanDayState } from '@/lib/plan-state';
import { getLiveSolveStats, getPlanState, getPlanStreak, getSolvedKeySet } from '@/lib/plan-state';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Plan — DSA Tracker',
  description: 'Day-by-day prep plan: DSA counters, C++ phases, daily floor, and resume checklist.',
};

/** OA season opens on this date; the rail counts down to it. */
const OA_DATE_KEY = '2026-08-01';

/** Exact membership boundary for the NeetCode 150 progress meter. */
const NEETCODE_150_KEY_SET = new Set<string>(NEETCODE_150_KEYS);

/**
 * Whole days between two 'YYYY-MM-DD' keys, floored at 0.
 * Both keys are read at UTC midnight so DST never shifts the difference —
 * these are calendar dates, not instants.
 */
function daysUntil(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * checkId -> true for every plan problem whose canonicalKey appears in the
 * solved set. The 5 Striver entries carry no canonicalKey and can only ever be
 * ticked by hand.
 */
function deriveAutoSolved(solvedKeys: Set<string>): Record<string, boolean> {
  const autoSolved: Record<string, boolean> = {};
  if (solvedKeys.size === 0) return autoSolved;

  for (const day of DAYS) {
    for (const problem of day.problems ?? []) {
      if (problem.canonicalKey && solvedKeys.has(problem.canonicalKey)) {
        autoSolved[checkId.problem(day.date, problem)] = true;
      }
    }
  }
  return autoSolved;
}

/**
 * Resolve every known check id: an explicit manual row always wins, including
 * an explicit `false` that unticks something the extension detected. `??` (not
 * `||`) is what makes that false survive.
 */
function resolveChecks(
  manual: Record<string, boolean>,
  autoSolved: Record<string, boolean>,
): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  for (const id of new Set([...Object.keys(manual), ...Object.keys(autoSolved)])) {
    checks[id] = manual[id] ?? autoSolved[id] ?? false;
  }
  return checks;
}

const EMPTY_DAY: PlanDayState = {
  log: null,
  note: null,
  floorDsa: false,
  floorCpp: false,
  floorLog: false,
  trip: false,
};

function resolveDays(
  manualDays: Record<string, PlanDayState>,
  solvedPerDay: Record<string, number>,
): { days: Record<string, PlanDayState>; floorDsaAuto: Record<string, boolean> } {
  const days = { ...manualDays };
  const floorDsaAuto: Record<string, boolean> = {};

  for (const [date, count] of Object.entries(solvedPerDay)) {
    if (count < 4) continue;
    floorDsaAuto[date] = true;
    const manual = manualDays[date] ?? EMPTY_DAY;
    days[date] = { ...manual, floorDsa: true };
  }

  return { days, floorDsaAuto };
}

type SearchParams = Promise<{ d?: string }>;

export default async function PlanPage({ searchParams }: { searchParams: SearchParams }) {
  // Reading searchParams keeps the route dynamic — it already is via
  // `force-dynamic`, so nothing about the DB reads below changes.
  const sp = await searchParams;

  // Sequential, never Promise.all: the postgres.js client is deliberately
  // max: 1 and a concurrent fan-out stalls the Supabase transaction pooler.
  // Every read degrades to empty state, so this renders without a database.
  const planState = await getPlanState();
  const solvedKeys = await getSolvedKeySet();
  const liveStats = await getLiveSolveStats();
  const streak = await getPlanStreak(liveStats.solvedPerDay);

  const todayKey = localDateKey();
  const manual = planState.checks;
  const autoSolved = deriveAutoSolved(solvedKeys);
  const resolvedDays = resolveDays(planState.days, liveStats.solvedPerDay);
  const neetcode150Solved = [...solvedKeys].filter((key) => NEETCODE_150_KEY_SET.has(key)).length;

  const state: PlanViewState = {
    checks: resolveChecks(manual, autoSolved),
    manual,
    autoSolved,
    days: resolvedDays.days,
    floorDsaAuto: resolvedDays.floorDsaAuto,
    counters: planState.counters,
    neetcode150Solved,
    solvedPerDay: liveStats.solvedPerDay,
    streak,
    todayKey,
  };

  const daysLeft = daysUntil(todayKey, OA_DATE_KEY);
  // Denominator is PHASE_COUNT, never a literal; the numerator is counted the
  // one legal way — checkId.phase against the resolved checks.
  const cppDone = PHASES.filter((phase) => state.checks[checkId.phase(phase)]).length;

  return (
    // No page header: the title, the date range and the company list were three
    // lines of fixed text above every visit, and the cockpit's rail already
    // carries the only header content that changes (pace, days left, today's
    // solves). The plan starts at the work.
    <main className="page">
      <PlanClient
        state={state}
        daysLeft={daysLeft}
        cppDone={cppDone}
        initialSelected={sp.d}
      />
    </main>
  );
}
