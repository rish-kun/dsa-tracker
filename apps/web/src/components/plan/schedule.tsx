'use client';

import { DAYS, WEEKS, checkId, type DsaCategory } from '@dsa-tracker/plan-data';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TaskRow } from './task-row';
import type { PlanViewState } from './types';

/** Render order of the three nested problem groups. */
const CATEGORY_ORDER: DsaCategory[] = ['new', 'revision', 'stretch'];

/** Groups expanded on first paint. */
const DEFAULT_OPEN_CATEGORIES: DsaCategory[] = ['new', 'revision'];

/**
 * Accordion key for one day's category group. Purely UI state — unrelated to
 * check ids, which only ever come from `checkId`.
 */
const catAccordionKey = (date: string, cat: DsaCategory) => `${date}:${cat}`;

const CATEGORY_META: Record<
  DsaCategory,
  {
    label: string;
    desc: string;
    /** Header badge tint. */
    badge: string;
    /** Checkbox when manually ticked — solid fill. */
    box: string;
    /** Checkbox when derived from a detected solve — outline, not fill. */
    autoBox: string;
    /** "auto" affordance pill. */
    autoPill: string;
  }
> = {
  new: {
    label: 'New',
    desc: 'counts toward 300',
    badge: 'bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
    box: 'border-[var(--pt-blue)] bg-[var(--pt-blue)] text-[var(--pt-bg)]',
    autoBox: 'border-[var(--pt-blue)] bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
    autoPill:
      'border-[color-mix(in_srgb,var(--pt-blue)_45%,transparent)] bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
  },
  revision: {
    label: 'Revision',
    desc: 'NC150 breadth refresh',
    badge: 'bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
    box: 'border-[var(--pt-green)] bg-[var(--pt-green)] text-[var(--pt-bg)]',
    autoBox: 'border-[var(--pt-green)] bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
    autoPill:
      'border-[color-mix(in_srgb,var(--pt-green)_45%,transparent)] bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
  },
  stretch: {
    label: 'Stretch',
    desc: 'Hards — skip on heavy C++ days',
    badge: 'bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
    box: 'border-[var(--pt-amber)] bg-[var(--pt-amber)] text-[var(--pt-bg)]',
    autoBox: 'border-[var(--pt-amber)] bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
    autoPill:
      'border-[color-mix(in_srgb,var(--pt-amber)_45%,transparent)] bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
  },
};

/**
 * E/M/H letters: same `--pt-diff-*` tokens the dashboard's `.chip-easy|medium|hard`
 * use, at the same 600 weight (see DIFFICULTY_LETTER below). The compact form is
 * the only difference — a bare letter instead of a pill.
 */
const DIFFICULTY_CLASS: Record<'E' | 'M' | 'H', string> = {
  E: 'text-[var(--pt-diff-easy)]',
  M: 'text-[var(--pt-diff-medium)]',
  H: 'text-[var(--pt-diff-hard)]',
};

/** Metrics half of the difficulty letter — 600, matching `.chip`. */
const DIFFICULTY_LETTER = 'w-4 shrink-0 text-center font-mono text-[11px] font-semibold';

/** The one uppercase kicker recipe — defined in globals.css, shared with `.problems-table th`. */
const MICRO = 'micro-label';

function Chevron({ open, size }: { open: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cn(
        'shrink-0 text-[var(--pt-text-3)] transition-transform duration-200',
        open && 'rotate-90',
      )}
    >
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  state: PlanViewState;
  todayKey: string;
  onToggleCheck: (id: string, val: boolean) => void;
};

export function Schedule({ state, todayKey, onToggleCheck }: Props) {
  const [openDays, setOpenDays] = useState<Set<number>>(() => {
    const s = new Set<number>();
    const idx = DAYS.findIndex((d) => d.date === todayKey);
    if (idx >= 0) s.add(idx);
    return s;
  });

  // "new" and "revision" start expanded on every day; "stretch" starts collapsed.
  // Seeded per-day so toggling one day's group cannot collapse the same
  // category on every other day.
  const [openCats, setOpenCats] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const day of DAYS) {
      for (const cat of DEFAULT_OPEN_CATEGORIES) s.add(catAccordionKey(day.date, cat));
    }
    return s;
  });

  const toggleDay = (i: number) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const toggleCat = (key: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="mb-6 overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3.5 sm:px-5">
        <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">Day-by-day schedule</h2>
        <span className="text-right text-[12px] text-[var(--pt-text-3)]">tap a day to expand</span>
      </div>

      <div className="space-y-5 p-4">
        {WEEKS.map(({ label: weekLabel, indices }) => (
          <div key={weekLabel}>
            {/* week separator */}
            <div className="mb-2.5 flex items-center gap-3">
              {/* No `whitespace-nowrap`: the longest week label ("Final sprint ·
                  C++ ship (3h PM) + new DSA 5/day (AM 2h)") is ~400px of 11px
                  uppercase and was being clipped by the section's
                  overflow-hidden at phone widths. It fits on one line from
                  ~640px up, so desktop is unchanged. */}
              <span className={MICRO}>{weekLabel}</span>
              <div className="h-px flex-1 bg-[var(--pt-border)]" />
            </div>

            <div className="space-y-1.5">
              {indices.map((i) => {
                const day = DAYS[i];
                const isToday = day.date === todayKey;
                const isPast = day.date < todayKey;
                const isOpen = openDays.has(i);

                // Resolve every problem's id once, keeping its position in the
                // day's list. The source called day.problems.indexOf(problem)
                // inside the render loop — O(n²), and it collapsed onto the
                // first match whenever two entries were reference-equal.
                const problems = (day.problems ?? []).map((problem, idx) => ({
                  problem,
                  idx,
                  id: checkId.problem(day.date, problem),
                }));

                // Count all checkable items: tasks + problems.
                const totalItems = day.tasks.length + problems.length;
                const doneTasks = day.tasks.filter(
                  (_, j) => state.checks[checkId.task(day.date, j)],
                ).length;
                const doneProblems = problems.filter(({ id }) => state.checks[id]).length;
                const doneTotal = doneTasks + doneProblems;
                const allDone = totalItems > 0 && doneTotal === totalItems;

                return (
                  <div
                    key={day.date}
                    className={cn(
                      'overflow-hidden rounded-md border transition-all',
                      isToday ? 'border-[var(--pt-blue)]' : 'border-[var(--pt-border)]',
                      isPast && !isToday && 'opacity-55',
                    )}
                  >
                    {/* day header row */}
                    <button
                      type="button"
                      onClick={() => toggleDay(i)}
                      aria-expanded={isOpen}
                      className={cn(
                        'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                        'max-sm:min-h-[44px]',
                        isToday ? 'bg-[var(--pt-blue-bg)]' : 'bg-[var(--pt-surface-raised)]',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full transition-all',
                          isToday
                            ? 'bg-[var(--pt-blue)]'
                            : allDone
                              ? 'bg-[var(--pt-green)]'
                              : 'bg-[var(--pt-border-2)]',
                        )}
                      />

                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-[var(--pt-text)]">
                        {isToday && (
                          <span className="rounded px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--pt-bg)] bg-[var(--pt-blue)]">
                            Today
                          </span>
                        )}
                        {day.label}
                      </span>

                      <div className="flex shrink-0 items-center gap-3">
                        {day.milestone && (
                          <span className="hidden rounded px-2 py-[2px] text-[11px] font-medium bg-[var(--pt-violet-bg)] text-[var(--pt-violet)] sm:inline">
                            {day.milestone}
                          </span>
                        )}
                        <span className="font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
                          {doneTotal}/{totalItems}
                        </span>
                        <Chevron open={isOpen} size={12} />
                      </div>
                    </button>

                    {/* expanded content */}
                    {isOpen && (
                      <div className="border-t border-[var(--pt-border)] bg-[var(--pt-surface)]">
                        {/* milestone badge (mobile) */}
                        {day.milestone && (
                          <div className="px-4 pt-2 sm:hidden">
                            <span className="rounded px-2 py-[2px] text-[11px] font-medium bg-[var(--pt-violet-bg)] text-[var(--pt-violet)]">
                              {day.milestone}
                            </span>
                          </div>
                        )}

                        {/* non-DSA tasks — ids from checkId.task, identical to
                            the ones TodayHero writes for the same day. */}
                        {day.tasks.length > 0 && (
                          <div className="px-3 pb-1 pt-2">
                            {day.tasks.map((task, j) => {
                              const id = checkId.task(day.date, j);
                              return (
                                <TaskRow
                                  key={id}
                                  id={id}
                                  label={task[1]}
                                  tag={task[0]}
                                  checked={!!state.checks[id]}
                                  auto={!!state.autoSolved[id]}
                                  onChange={onToggleCheck}
                                />
                              );
                            })}
                          </div>
                        )}

                        {/* DSA problems by category */}
                        {problems.length > 0 && (
                          <div className="space-y-2 px-3 pb-3">
                            {CATEGORY_ORDER.map((cat) => {
                              const catProblems = problems.filter(
                                ({ problem }) => problem.category === cat,
                              );
                              if (catProblems.length === 0) return null;

                              const catKey = catAccordionKey(day.date, cat);
                              const isCatOpen = openCats.has(catKey);
                              const meta = CATEGORY_META[cat];
                              const doneCat = catProblems.filter(
                                ({ id }) => state.checks[id],
                              ).length;

                              return (
                                <div
                                  key={cat}
                                  className="overflow-hidden rounded-md border border-[var(--pt-border)]"
                                >
                                  {/* category header */}
                                  <button
                                    type="button"
                                    onClick={() => toggleCat(catKey)}
                                    aria-expanded={isCatOpen}
                                    className="flex w-full items-center gap-2.5 bg-[var(--pt-surface-raised)] px-3 py-2 text-left max-sm:min-h-[44px]"
                                  >
                                    <span
                                      className={cn(
                                        'rounded-md px-2 py-[2px] font-mono text-[11px] font-bold uppercase tracking-[0.06em]',
                                        meta.badge,
                                      )}
                                    >
                                      {meta.label}
                                    </span>
                                    {/* `truncate` keeps this hint on one line:
                                        at 360px the badge + counter + chevron
                                        leave it ~90px, and wrapping "Hards —
                                        skip on heavy C++ days" turned every
                                        category header into three lines. It
                                        never truncates from `sm` up. */}
                                    <span className="flex-1 truncate text-[12px] text-[var(--pt-text-2)]">
                                      {meta.desc}
                                    </span>
                                    <span className="font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
                                      {doneCat}/{catProblems.length}
                                    </span>
                                    <Chevron open={isCatOpen} size={11} />
                                  </button>

                                  {/* problems list */}
                                  {isCatOpen && (
                                    <div className="border-t border-[var(--pt-border)] px-2 py-1">
                                      {catProblems.map(({ problem, idx, id }) => {
                                        const checked = !!state.checks[id];
                                        const autoTicked = checked && !!state.autoSolved[id];
                                        return (
                                          // The <label> is the only interactive
                                          // surface; the box is decorative so a
                                          // click cannot toggle twice.
                                          <label
                                            key={`${idx}:${id}`}
                                            title={
                                              autoTicked
                                                ? 'Ticked automatically from a detected solve — click to override'
                                                : undefined
                                            }
                                            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-[7px] transition-colors hover:bg-[var(--pt-surface-raised)] max-sm:min-h-[44px]"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={(e) => onToggleCheck(id, e.target.checked)}
                                              aria-label={
                                                autoTicked
                                                  ? `${problem.name} — ticked automatically from a detected solve`
                                                  : problem.name
                                              }
                                              className="peer sr-only"
                                            />

                                            {/* checkbox */}
                                            <span
                                              aria-hidden="true"
                                              className={cn(
                                                'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-all',
                                                'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--pt-blue-ring)]',
                                                !checked && 'border-[var(--pt-border-2)] bg-transparent',
                                                checked && !autoTicked && meta.box,
                                                autoTicked && meta.autoBox,
                                              )}
                                            >
                                              {checked && (
                                                <svg
                                                  width="9"
                                                  height="7"
                                                  viewBox="0 0 10 8"
                                                  fill="none"
                                                >
                                                  <path
                                                    d="M1 4l2.5 2.5L9 1"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                  />
                                                </svg>
                                              )}
                                            </span>

                                            {/* difficulty letter */}
                                            <span
                                              className={cn(
                                                DIFFICULTY_LETTER,
                                                DIFFICULTY_CLASS[problem.difficulty],
                                              )}
                                            >
                                              {problem.difficulty}
                                            </span>

                                            {/* problem name */}
                                            <span
                                              className={cn(
                                                // break-words so a single long
                                                // token can never widen the row
                                                // past its column.
                                                'min-w-0 flex-1 break-words text-[13px] leading-snug transition-colors',
                                                checked
                                                  ? 'text-[var(--pt-text-3)] line-through'
                                                  : 'text-[var(--pt-text)]',
                                              )}
                                            >
                                              {problem.name}
                                            </span>

                                            {/* auto affordance */}
                                            {autoTicked && (
                                              <span
                                                aria-hidden="true"
                                                className={cn(
                                                  'shrink-0 rounded-md border px-1 py-[2px] font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.1em]',
                                                  meta.autoPill,
                                                )}
                                              >
                                                auto
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
