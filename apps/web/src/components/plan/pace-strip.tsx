'use client';

import { PHASE_COUNT } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';
import { DSA_TARGET, TOTAL_TARGET } from './stat-rings';
import type { PlanViewState } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Six numbers in one strip, replacing the four ring cards.
 *
 * The bet: the rings are the prettiest thing on the page and cost 150px of
 * desktop / 404px of mobile to say what fits in 76px / 196px. Everything here
 * is the same data, at a fidelity matched to how often it is read — which is
 * "glanced at once per visit".
 *
 * Hairlines are `gap-px` over a --pt-border background rather than per-cell
 * borders: correct dividers at every breakpoint with no nth-child maths, and
 * they re-flow for free when the grid rewraps.
 * ──────────────────────────────────────────────────────────────────────────── */

const CELL = 'bg-[var(--pt-surface)] px-3.5 py-2.5';

/**
 * Ink + meter fill per accent family. Both halves are written out as literal
 * class strings — Tailwind scans source text, so deriving `bg-…` from `text-…`
 * at runtime would compile to a class that exists in the DOM and nowhere in the
 * stylesheet.
 */
const TONES = {
  blue: { ink: 'text-[var(--pt-blue)]', bar: 'bg-[var(--pt-blue)]' },
  violet: { ink: 'text-[var(--pt-violet)]', bar: 'bg-[var(--pt-violet)]' },
  green: { ink: 'text-[var(--pt-green)]', bar: 'bg-[var(--pt-green)]' },
  amber: { ink: 'text-[var(--pt-amber)]', bar: 'bg-[var(--pt-amber)]' },
  rose: { ink: 'text-[var(--pt-rose)]', bar: 'bg-[var(--pt-rose)]' },
  neutral: { ink: 'text-[var(--pt-text)]', bar: 'bg-[var(--pt-border-2)]' },
} as const;

type Tone = keyof typeof TONES;

type CellProps = {
  label: string;
  value: string;
  /** Rendered small and dim after the value — '/150', 'q/day', 'days'. */
  suffix?: string;
  tone: Tone;
  fraction: number;
};

function Cell({ label, value, suffix, tone, fraction }: CellProps) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  const t = TONES[tone];

  return (
    <div className={CELL}>
      <p className="micro-label truncate">{label}</p>
      <p className="mt-1 leading-none">
        <span className={cn('font-mono text-[19px] font-bold tabular-nums', t.ink)}>{value}</span>
        {suffix && (
          <span className="ml-1 text-[11px] font-normal text-[var(--pt-text-3)]">{suffix}</span>
        )}
      </p>
      {/* Same track colour as every other progress affordance in the app; only
          the fill carries hue. */}
      <span className="mt-2 block h-[5px] overflow-hidden rounded-[4px] bg-[var(--pt-border)]">
        <span
          className={cn('block h-full rounded-[4px] transition-[width] duration-700', t.bar)}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

type Props = {
  state: PlanViewState;
  cppDone: number;
  daysLeft: number;
  /** Total days the plan spans — the denominator for the elapsed meter. */
  planDays: number;
};

export function PaceStrip({ state, cppDone, daysLeft, planDays }: Props) {
  const { neetcode150Solved, counters, streak, todayKey } = state;

  const totalDone = neetcode150Solved + counters.dsaExtra;
  const totalLeft = Math.max(0, TOTAL_TARGET - totalDone);
  // Questions per day needed to hit 300 by Aug 1 — same formula the rings used.
  const perDay = daysLeft > 0 ? totalLeft / daysLeft : 0;
  const solvedToday = state.solvedPerDay[todayKey] ?? 0;
  const onPace = totalLeft === 0 || solvedToday >= perDay;

  return (
    <div className="mb-5 overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-border)] shadow-[var(--pt-shadow-panel)]">
      <div className="grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6">
        <Cell
          label="NeetCode 150"
          value={String(neetcode150Solved)}
          suffix={`/${DSA_TARGET}`}
          tone="blue"
          fraction={neetcode150Solved / DSA_TARGET}
        />
        <Cell
          label="Extra"
          value={String(counters.dsaExtra)}
          suffix={`/${DSA_TARGET}`}
          tone="violet"
          fraction={counters.dsaExtra / DSA_TARGET}
        />
        <Cell
          label="C++ phases"
          value={String(cppDone)}
          suffix={`/${PHASE_COUNT}`}
          tone="green"
          fraction={cppDone / PHASE_COUNT}
        />
        <Cell
          label="Streak"
          value={String(streak)}
          suffix={streak === 1 ? 'day' : 'days'}
          tone="amber"
          fraction={Math.min(1, streak / 7)}
        />
        <Cell
          label="Pace today"
          value={String(solvedToday)}
          suffix={totalLeft === 0 ? 'done' : `/${perDay.toFixed(1)} needed`}
          tone={onPace ? 'green' : 'rose'}
          fraction={perDay > 0 ? solvedToday / perDay : 1}
        />
        <Cell
          label="Days left"
          value={String(daysLeft)}
          suffix={daysLeft === 1 ? 'day' : 'days'}
          // Elapsed, not earned — this meter fills as time runs out.
          tone="neutral"
          fraction={planDays > 0 ? 1 - daysLeft / planDays : 1}
        />
      </div>
    </div>
  );
}
