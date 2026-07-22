'use client';

import { DAYS, WEEKS, checkId, type DsaCategory } from '@dsa-tracker/plan-data';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CATEGORY_ORDER,
  Chevron,
  DEFAULT_OPEN_CATEGORIES,
  ProblemCategoryGroup,
  problemEntries,
} from './problem-group';
import { TaskRow } from './task-row';
import type { PlanViewState } from './types';

/**
 * Accordion key for one day's category group. Purely UI state — unrelated to
 * check ids, which only ever come from `checkId`. It has to include the date:
 * every day renders into the same set, so a bare category would make opening
 * one day's "New" open all 26.
 */
const catAccordionKey = (date: string, cat: DsaCategory) => `${date}:${cat}`;

/** The one uppercase kicker recipe — defined in globals.css, shared with `.problems-table th`. */
const MICRO = 'micro-label';

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
                // day's list — never look the index back up during render.
                const problems = problemEntries(day.date, day.problems);

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

                        {/* DSA problems by category — same component TodayHero
                            renders, with the accordion keyed per day. */}
                        {problems.length > 0 && (
                          <div className="space-y-2 px-3 pb-3">
                            {CATEGORY_ORDER.map((cat) => {
                              const catKey = catAccordionKey(day.date, cat);
                              return (
                                <ProblemCategoryGroup
                                  key={cat}
                                  category={cat}
                                  entries={problems}
                                  state={state}
                                  open={openCats.has(catKey)}
                                  onToggleOpen={() => toggleCat(catKey)}
                                  onToggleCheck={onToggleCheck}
                                />
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
