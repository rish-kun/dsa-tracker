'use client';

import { PHASE_COUNT } from '@dsa-tracker/plan-data';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FLOOR_PILLS, floorDoneCount, floorMet } from './day-parts';
import { Chevron } from './problem-group';
import { DSA_TARGET, StatRings, TOTAL_TARGET } from './stat-rings';
import type { PlanViewState } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * The one element that never leaves in the tabbed layout. "Am I behind" is a
 * glance, not a page — so it stays visible while the four panes come and go.
 *
 * The four ring cards are not deleted: they live one click away behind the
 * `Rings` disclosure, rendered verbatim.
 * ──────────────────────────────────────────────────────────────────────────── */

const TONES = {
  blue: { ink: 'text-[var(--pt-blue)]', bar: 'bg-[var(--pt-blue)]' },
  green: { ink: 'text-[var(--pt-green)]', bar: 'bg-[var(--pt-green)]' },
  rose: { ink: 'text-[var(--pt-rose)]', bar: 'bg-[var(--pt-rose)]' },
  neutral: { ink: 'text-[var(--pt-text)]', bar: 'bg-[var(--pt-border-2)]' },
} as const;

type Tone = keyof typeof TONES;

function Cell({
  label,
  shortLabel,
  children,
  sub,
  className,
}: {
  label: string;
  shortLabel?: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 border-[var(--pt-border)] px-3 py-2.5 sm:px-3.5 sm:py-3',
        // <sm: 3 across, so no left border on column 1 and a hairline above row 2.
        '[&:not(:nth-child(3n+1))]:border-l [&:nth-child(n+4)]:border-t',
        // sm+: one row of 6, hairlines between every pair.
        'sm:border-t-0 sm:border-l sm:first:border-l-0',
        className,
      )}
    >
      <p className="micro-label truncate text-[10px] sm:text-[11px]">
        <span className="sm:hidden">{shortLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </p>
      <div className="mt-1 leading-none">{children}</div>
      {sub && <p className="mt-1 hidden text-[11px] text-[var(--pt-text-3)] sm:block">{sub}</p>}
    </div>
  );
}

function Value({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'font-mono text-[18px] font-bold tabular-nums sm:text-[22px]',
        TONES[tone].ink,
      )}
    >
      {children}
    </span>
  );
}

function Bar({ tone, fraction }: { tone: Tone; fraction: number }) {
  return (
    <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-[var(--pt-border)]">
      <span
        className={cn('block h-full rounded-full transition-all duration-700', TONES[tone].bar)}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
      />
    </span>
  );
}

type Props = {
  state: PlanViewState;
  cppDone: number;
  daysLeft: number;
};

export function PlanStatusBar({ state, cppDone, daysLeft }: Props) {
  const [ringsOpen, setRingsOpen] = useState(false);

  const { todayKey, neetcode150Solved, counters, streak } = state;
  const solvedToday = state.solvedPerDay[todayKey] ?? 0;
  const floorDone = floorDoneCount(state, todayKey);
  const totalDone = neetcode150Solved + counters.dsaExtra;
  const totalLeft = Math.max(0, TOTAL_TARGET - totalDone);
  const perDay = daysLeft > 0 ? totalLeft / daysLeft : 0;

  return (
    <div className="mb-3">
      <div className="overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
        <div className="grid grid-cols-3 sm:grid-cols-6">
          <Cell label="Solved today" shortLabel="Today" sub="4 needed">
            <Value tone={solvedToday >= 4 ? 'green' : 'blue'}>{solvedToday}</Value>
          </Cell>

          <Cell
            label="Daily floor"
            shortLabel="Floor"
            sub={
              <span className="rounded-md bg-[var(--pt-amber-bg)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--pt-amber)]">
                {streak}d streak
              </span>
            }
          >
            <span className="flex items-center gap-1.5">
              {/* Each dot reports its OWN floor, not the first N — filling by
                  count would show C++ as met whenever DSA and the log were. */}
              {FLOOR_PILLS.map((p) => (
                <span
                  key={p.key}
                  aria-hidden="true"
                  className={cn(
                    'h-2 w-2 rounded-full',
                    floorMet(state, todayKey, p.key) ? p.dot : 'bg-[var(--pt-border-2)]',
                  )}
                />
              ))}
              <span className="ml-0.5 font-mono text-[15px] font-bold tabular-nums text-[var(--pt-text)] sm:text-[18px]">
                {floorDone}/{FLOOR_PILLS.length}
              </span>
            </span>
          </Cell>

          <Cell label="Days left" shortLabel="Left" sub="to Aug 1">
            <Value tone="neutral">{daysLeft}</Value>
          </Cell>

          <Cell
            label="NeetCode 150"
            shortLabel="NC150"
            sub={`${Math.max(0, DSA_TARGET - neetcode150Solved)} left`}
          >
            <span className="font-mono text-[18px] font-bold tabular-nums text-[var(--pt-blue)] sm:text-[22px]">
              {neetcode150Solved}
              <span className="text-[11px] font-normal text-[var(--pt-text-3)]">/{DSA_TARGET}</span>
            </span>
            <Bar tone="blue" fraction={neetcode150Solved / DSA_TARGET} />
          </Cell>

          <Cell
            label="C++ phases"
            shortLabel="C++"
            sub={`${Math.max(0, PHASE_COUNT - cppDone)} remaining`}
          >
            <span className="font-mono text-[18px] font-bold tabular-nums text-[var(--pt-green)] sm:text-[22px]">
              {cppDone}
              <span className="text-[11px] font-normal text-[var(--pt-text-3)]">/{PHASE_COUNT}</span>
            </span>
            <Bar tone="green" fraction={cppDone / PHASE_COUNT} />
          </Cell>

          <Cell label="Pace" sub="to hit 300">
            {totalLeft === 0 ? (
              <Value tone="green">done</Value>
            ) : (
              <span>
                <Value tone="rose">{perDay.toFixed(1)}</Value>
                <span className="ml-1 text-[11px] font-normal text-[var(--pt-text-3)]">q/day</span>
              </span>
            )}
          </Cell>
        </div>
      </div>

      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          onClick={() => setRingsOpen((o) => !o)}
          aria-expanded={ringsOpen}
          aria-controls="plan-rings"
          className="micro-label flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:text-[var(--pt-text)] max-sm:min-h-[38px]"
        >
          <Chevron open={ringsOpen} size={11} />
          Rings
        </button>
      </div>

      {ringsOpen && (
        <div id="plan-rings">
          <StatRings
            dsaCount={state.neetcode150Solved}
            dsaExtra={state.counters.dsaExtra}
            cppDone={cppDone}
            streak={state.streak}
            daysLeft={daysLeft}
          />
        </div>
      )}
    </div>
  );
}
