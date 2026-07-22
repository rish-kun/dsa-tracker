'use client';

import { PHASE_COUNT } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';
import { ExtraCounter } from './day-parts';
import { DSA_TARGET, Ring, TOTAL_TARGET } from './stat-rings';
import type { PlanViewState } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * The rail's vitals block: one ring, three meters, and the extra counter.
 *
 * The extra counter lives HERE and not in the day pane on purpose. It writes
 * `plan_counters` — a singleton row, not day-scoped — so sitting it beside
 * day-scoped fields in a pane that can display any day would read as though it
 * were writing to that day. This single placement removes the worst confusion
 * risk in the cockpit layout.
 * ──────────────────────────────────────────────────────────────────────────── */

const BAR = {
  violet: 'bg-[var(--pt-violet)]',
  green: 'bg-[var(--pt-green)]',
  amber: 'bg-[var(--pt-amber)]',
} as const;

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
    <div className="grid grid-cols-[58px_minmax(0,1fr)_46px] items-center gap-2">
      <span className="micro-label truncate">{label}</span>
      <span className="block h-[10px] overflow-hidden rounded-[4px] bg-[var(--pt-border)]">
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
  const { neetcode150Solved, counters, streak } = state;
  const left = Math.max(0, DSA_TARGET - neetcode150Solved);
  const totalDone = neetcode150Solved + counters.dsaExtra;
  const totalLeft = Math.max(0, TOTAL_TARGET - totalDone);
  const perDay = daysLeft > 0 ? totalLeft / daysLeft : 0;

  return (
    <div className="rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] p-3.5 shadow-[var(--pt-shadow-panel)]">
      <div className={cn(wide && 'grid gap-4 sm:grid-cols-2')}>
        <div className="flex items-center gap-3">
          <Ring
            fraction={neetcode150Solved / DSA_TARGET}
            tone="blue"
            value={String(neetcode150Solved)}
            total={String(DSA_TARGET)}
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold leading-tight text-[var(--pt-text)]">
              NeetCode 150
            </div>
            <div className="mt-1 text-[11px] text-[var(--pt-text-3)]">
              {left > 0 ? (
                <>
                  <span className="font-mono font-bold tabular-nums text-[var(--pt-blue)]">
                    {left}
                  </span>{' '}
                  left · auto
                </>
              ) : (
                <span className="text-[var(--pt-green)]">Complete</span>
              )}
            </div>
            <div className="micro-label mt-0.5">
              {totalLeft === 0 ? 'done' : `${perDay.toFixed(1)} q/day · ${daysLeft}d left`}
            </div>
          </div>
        </div>

        <div
          className={cn(
            'space-y-2 border-t border-[var(--pt-border)] pt-3',
            wide && 'sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0',
          )}
        >
          <MeterRow
            label="Extra"
            value={`${counters.dsaExtra}/${DSA_TARGET}`}
            fraction={counters.dsaExtra / DSA_TARGET}
            tone="violet"
          />
          <MeterRow
            label="C++"
            value={`${cppDone}/${PHASE_COUNT}`}
            fraction={cppDone / PHASE_COUNT}
            tone="green"
          />
          <MeterRow
            label="Streak"
            value={`${streak}d`}
            fraction={Math.min(1, streak / 7)}
            tone="amber"
          />
          {streak === 0 && (
            <p className="micro-label text-[var(--pt-amber)]">never miss twice</p>
          )}
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
          // The vertical rail is 272px; only the wide (sub-lg) form has room
          // to keep the label inline with the controls.
          stacked={!wide}
        />
      </div>
    </div>
  );
}
