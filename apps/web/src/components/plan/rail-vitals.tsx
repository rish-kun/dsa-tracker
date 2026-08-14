'use client';

import { PHASE_COUNT } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';
import { DSA_TARGET, ExtraCounter, TOTAL_TARGET } from './day-parts';
import type { PlanViewState } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * The rail's vitals block: four meters, a streak badge, and the extra counter.
 *
 * Every metric is the same shape — label, bar, value — so they read as one
 * scale rather than one hero and three footnotes. The streak is the exception
 * and is deliberately not a meter: it has no meaningful denominator, and a bar
 * that is always nearly empty (a 6-day streak against what, 34?) reads as
 * failure. It gets a flame badge instead.
 *
 * The extra counter lives HERE and not in the day pane on purpose. It writes
 * `plan_counters` — a singleton row, not day-scoped — so sitting it beside
 * day-scoped fields in a pane that can display any day would read as though it
 * were writing to that day.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fills written out literally — Tailwind scans source text, not runtime values. */
const BAR = {
  blue: 'bg-[var(--pt-blue)]',
  violet: 'bg-[var(--pt-violet)]',
  green: 'bg-[var(--pt-green)]',
} as const;

function FlameIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M8 1.5s.6 2.1-.9 3.6C5.3 6.9 4 8.1 4 10a4 4 0 0 0 8 0c0-1.6-.7-2.7-1.6-3.7-.5.6-1 .8-1.3.6.6-1.9-.4-4.2-1.1-5.4z"
        fill={lit ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MeterRow({
  label,
  value,
  fraction,
  tone,
}: {
  label: string;
  value: string;
  fraction: number;
  tone: keyof typeof BAR;
}) {
  return (
    <div className="grid grid-cols-[54px_minmax(0,1fr)_50px] items-center gap-2">
      <span className="micro-label truncate">{label}</span>
      {/* --pt-border is the progress track everywhere in this app; only the fill
          carries hue. */}
      <span className="block h-[8px] overflow-hidden rounded-[4px] bg-[var(--pt-border)]">
        <span
          className={cn('block h-full rounded-[4px] transition-all duration-700', BAR[tone])}
          style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
        />
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums text-[var(--pt-text-2)]">
        {value}
      </span>
    </div>
  );
}

type Props = {
  state: PlanViewState;
  cppDone: number;
  daysLeft: number;
  extraInput: string;
  setExtraInput: (v: string) => void;
  onAddDsaExtra: (n: number) => void;
  onUndoDsaExtra: () => void;
  /** Horizontal 2-up arrangement for the sub-lg stacked layout. */
  wide?: boolean;
};

export function RailVitals({
  state,
  cppDone,
  daysLeft,
  extraInput,
  setExtraInput,
  onAddDsaExtra,
  onUndoDsaExtra,
  wide = false,
}: Props) {
  const { neetcode150Solved, counters, streak, todayKey } = state;
  const totalDone = neetcode150Solved + counters.dsaExtra;
  const totalLeft = Math.max(0, TOTAL_TARGET - totalDone);
  const perDay = daysLeft > 0 ? totalLeft / daysLeft : 0;
  const solvedToday = state.solvedPerDay[todayKey] ?? 0;

  return (
    <div className="rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] p-3.5 shadow-[var(--pt-shadow-panel)]">
      <div className={cn(wide && 'grid gap-4 sm:grid-cols-2')}>
        <div className="space-y-2">
          <MeterRow
            label="NC150"
            value={`${neetcode150Solved}/${DSA_TARGET}`}
            fraction={neetcode150Solved / DSA_TARGET}
            tone="blue"
          />
          <MeterRow
            label="Extra"
            value={`${counters.dsaExtra}/${DSA_TARGET}`}
            fraction={counters.dsaExtra / DSA_TARGET}
            tone="violet"
          />
          <MeterRow
            label="Prep"
            value={`${cppDone}/${PHASE_COUNT}`}
            fraction={cppDone / PHASE_COUNT}
            tone="green"
          />
          <MeterRow
            label="Total"
            value={`${totalDone}/${TOTAL_TARGET}`}
            fraction={totalDone / TOTAL_TARGET}
            tone="blue"
          />
        </div>

        <div
          className={cn(
            'mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--pt-border)] pt-3',
            wide && 'sm:mt-0 sm:flex-col sm:items-start sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0',
          )}
        >
          {/* Streak: a flame, not a bar — see the note at the top of this file. */}
          <span
            title={
              streak > 0
                ? `${streak} day streak — floor met or trip day`
                : 'No streak yet — never miss twice'
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[12px] font-bold tabular-nums',
              streak > 0
                ? 'bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]'
                : 'text-[var(--pt-text-3)]',
            )}
          >
            <FlameIcon lit={streak > 0} />
            {streak}d
          </span>

          <span className="font-mono text-[12px] tabular-nums text-[var(--pt-text-2)]">
            <span
              className={cn(
                'font-bold',
                solvedToday >= 4 ? 'text-[var(--pt-green)]' : 'text-[var(--pt-blue)]',
              )}
            >
              {solvedToday}
            </span>{' '}
            <span className="text-[var(--pt-text-3)]">today</span>
          </span>

          <span className="micro-label">
            {totalLeft === 0 ? 'target met' : `${perDay.toFixed(1)} q/day · ${daysLeft}d left`}
          </span>
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--pt-border)] pt-3">
        <ExtraCounter
          state={state}
          value={extraInput}
          onChange={setExtraInput}
          onAdd={onAddDsaExtra}
          onUndo={onUndoDsaExtra}
          compact
          // The vertical rail is 272px; only the wide (sub-lg) form has room to
          // keep the label inline with the controls.
          stacked={!wide}
        />
      </div>
    </div>
  );
}
