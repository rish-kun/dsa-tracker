import { DAYS, PHASES, checkId, localDateKey } from '@dsa-tracker/plan-data';
import type { Metadata } from 'next';
import { PlanClient } from '@/components/plan/plan-client';
import type { PlanViewState } from '@/components/plan/types';
import { getPlanState, getPlanStreak, getSolvedKeySet } from '@/lib/plan-state';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Plan — DSA Tracker',
  description: 'Day-by-day prep plan: DSA counters, C++ phases, daily floor, and resume checklist.',
};

/** Companies this plan is aimed at — first one is the anchor. */
const TARGETS = ['DE Shaw', 'Stripe', 'Uber', 'Google', 'Oracle', 'LinkedIn', 'Atlassian'];

/** OA season opens on this date; the header counts down to it. */
const OA_DATE_KEY = '2026-08-01';

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

export default async function PlanPage() {
  // Sequential, never Promise.all: the postgres.js client is deliberately
  // max: 1 and a concurrent fan-out stalls the Supabase transaction pooler.
  // Every read degrades to empty state, so this renders without a database.
  const planState = await getPlanState();
  const solvedKeys = await getSolvedKeySet();
  const streak = await getPlanStreak();

  const todayKey = localDateKey();
  const manual = planState.checks;
  const autoSolved = deriveAutoSolved(solvedKeys);

  const state: PlanViewState = {
    checks: resolveChecks(manual, autoSolved),
    manual,
    autoSolved,
    days: planState.days,
    counters: planState.counters,
    streak,
    todayKey,
  };

  const daysLeft = daysUntil(todayKey, OA_DATE_KEY);
  // Denominator lives in StatRings (PHASE_COUNT); the numerator is counted the
  // one legal way — checkId.phase against the resolved checks.
  const cppDone = PHASES.filter((phase) => state.checks[checkId.phase(phase)]).length;

  return (
    <main className="page">
      <div className="page-header">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="page-title">Internship Prep</h1>
            <p className="page-subtitle">
              Jul 7 – Aug 1 · OA season · progress auto-saves to your database
            </p>
          </div>

          <div className="shrink-0 text-right">
            <span className="font-mono text-[26px] font-bold tabular-nums text-[var(--pt-text)]">
              {daysLeft}
            </span>
            <span className="ml-1.5 text-[11px] text-[var(--pt-text-3)]">
              {daysLeft === 1 ? 'day left' : 'days left'}
            </span>
          </div>
        </div>

        <p className="flex flex-wrap items-center text-[12px] text-[var(--pt-text-3)]">
          {TARGETS.map((target, i) => (
            <span key={target} className="flex items-center">
              {i > 0 && (
                <span aria-hidden="true" className="mx-1.5 text-[var(--pt-border-2)]">
                  ·
                </span>
              )}
              <span className={i === 0 ? 'text-[var(--pt-text-2)]' : undefined}>{target}</span>
            </span>
          ))}
        </p>
      </div>

      <PlanClient state={state} daysLeft={daysLeft} cppDone={cppDone} />
    </main>
  );
}
