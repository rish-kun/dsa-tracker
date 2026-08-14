'use client';

import { CORE_SET, DAYS, PHASE_COUNT, RESUME_ITEMS, WEEKS } from '@dsa-tracker/plan-data';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { DaySummary } from './day-summary';
import { stepDate, stepWeek } from './selection';

/* ────────────────────────────────────────────────────────────────────────────
 * The day rail. This is the piece that makes the cockpit work: the 34-day
 * schedule stops being a section you scroll past and becomes the navigator you
 * steer with, so "look ahead at Aug 19" is one click instead of 3000px.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The reference sections now live expanded in the main column, below the day
 * panel. These rail rows are jump links to them, not a second place they can be
 * rendered — the rail stays the navigator, the column stays the content.
 */
export type RefEntry = {
  /** DOM id of the section in the main column. */
  id: string;
  label: string;
  meta?: string;
};

export function refEntries(cppDone: number, resDone: number, coreDone: number): RefEntry[] {
  return [
    { id: 'plan-cpp', label: 'Google prep phases', meta: `${cppDone}/${PHASE_COUNT}` },
    { id: 'plan-schedule', label: 'Full schedule', meta: `${DAYS.length} days` },
    { id: 'plan-method', label: 'DSA method' },
    { id: 'plan-resume', label: 'Interview-day checklist', meta: `${resDone}/${RESUME_ITEMS.length}` },
    { id: 'plan-core', label: 'Core set — 20', meta: `${coreDone}/${CORE_SET.length}` },
    { id: 'plan-patterns', label: 'Pattern inventory' },
    { id: 'plan-gotchas', label: 'C++ gotchas' },
    { id: 'plan-protocol', label: 'Execution protocol' },
    { id: 'plan-behavioral', label: 'Behavioral & AI' },
  ];
}

/** Selected-row look — `.filter-chip[data-active]`: -ink on -bg, never -blue on -bg. */
const SELECTED = 'bg-[var(--pt-blue-bg)] text-[var(--pt-blue-ink)]';

type Props = {
  summaries: DaySummary[];
  selectedDate: string;
  onSelect: (date: string) => void;
  cppDone: number;
  resDone: number;
  coreDone: number;
};

export function PlanRail({ summaries, selectedDate, onSelect, cppDone, resDone, coreDone }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  const refs = refEntries(cppDone, resDone, coreDone);

  // Centre today on mount and on day rollover. scrollTop directly, NOT
  // scrollIntoView — that walks ancestors and would scroll the whole page.
  const todayKeyDep = summaries.find((s) => s.isToday)?.date;
  useEffect(() => {
    const c = listRef.current;
    const el = todayRef.current;
    if (!c || !el) return;
    c.scrollTop = Math.max(0, el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2);
  }, [todayKeyDep]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next: string;
    if (e.key === 'ArrowDown') next = stepDate(selectedDate, 1);
    else if (e.key === 'ArrowUp') next = stepDate(selectedDate, -1);
    else if (e.key === 'PageDown') next = stepWeek(selectedDate, 1);
    else if (e.key === 'PageUp') next = stepWeek(selectedDate, -1);
    else if (e.key === 'Home') next = summaries[0]?.date ?? selectedDate;
    else if (e.key === 'End') next = summaries[summaries.length - 1]?.date ?? selectedDate;
    else return;

    e.preventDefault();
    onSelect(next);
  };

  return (
    <div
      className={cn(
        'flex flex-col rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]',
        // Height comes from the sticky column wrapper in layout-cockpit, which
        // budgets the viewport across vitals + this list + the pinned links.
        // Owning `max-h` here instead would push the links off-screen until the
        // page happened to be scrolled far enough to engage sticky.
        'min-h-0 lg:flex-1',
      )}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-orientation="vertical"
        aria-label="Plan days"
        onKeyDown={onKeyDown}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto py-1.5',
          // Without contain, momentum scrolling past the end chains to the page.
          '[overscroll-behavior:contain]',
          // offsetTop must be measured against this element.
          'relative',
        )}
      >
        {WEEKS.map((week) => {
          const rows = week.indices.map((i) => summaries[i]).filter(Boolean);
          if (rows.length === 0) return null;

          return (
            <div key={week.label}>
              <div
                aria-hidden="true"
                className="micro-label sticky top-0 z-[1] truncate bg-[var(--pt-surface)] px-2.5 py-1.5"
                title={week.label}
              >
                {week.label.split(' · ')[0]}
              </div>

              {rows.map((s) => {
                const selected = s.date === selectedDate;
                return (
                  <div key={s.date}>
                  <button
                    ref={s.isToday ? todayRef : undefined}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="plan-pane"
                    tabIndex={selected ? 0 : -1}
                    data-today={s.isToday || undefined}
                    onClick={() => onSelect(s.date)}
                    title={s.label}
                    className={cn(
                      'grid w-full grid-cols-[6px_46px_minmax(0,1fr)_32px] items-center gap-2 py-1 pr-2 text-left transition-colors',
                      selected
                        ? cn(SELECTED, 'border-l-2 border-l-[var(--pt-blue)] pl-2')
                        : 'pl-2.5 hover:bg-[var(--pt-surface-raised)]',
                      s.isPast && !s.isToday && !selected && 'opacity-55',
                      'max-sm:min-h-[40px]',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        s.isToday
                          ? 'bg-[var(--pt-blue)]'
                          : s.trip
                            ? 'bg-[var(--pt-rose)]'
                            : s.allDone
                              ? 'bg-[var(--pt-green)]'
                              : 'bg-[var(--pt-border-2)]',
                      )}
                    />
                    <span className="font-mono text-[11px] tabular-nums">{s.shortLabel}</span>
                    <span className="block h-[3px] overflow-hidden rounded-[2px] bg-[var(--pt-border)]">
                      <span
                        className={cn(
                          'block h-full rounded-[2px]',
                          s.allDone ? 'bg-[var(--pt-green)]' : 'bg-[var(--pt-blue)]',
                        )}
                        style={{ width: `${s.total > 0 ? (s.done / s.total) * 100 : 0}%` }}
                      />
                    </span>
                    <span
                      className={cn(
                        'text-right font-mono text-[10px] tabular-nums',
                        selected ? 'opacity-75' : 'text-[var(--pt-text-3)]',
                      )}
                    >
                      {s.done}/{s.total}
                    </span>
                  </button>

                  {/* Only the user's own note, never the hardcoded milestone.
                      The plan ships a milestone on roughly a third of the days
                      ("Mock #1 done", "Mock #3 done · dress rehearsal clean",
                      "Ready · templates cold-recalled"), which
                      turned the rail into a wall of violet text nobody was
                      reading. A note is there because someone chose to put it
                      there, which is what makes it worth the row. */}
                  {s.note && (
                    <div
                      aria-hidden="true"
                      className="truncate pb-0.5 pl-[64px] pr-2 text-[10px] text-[var(--pt-violet)]"
                      title={s.note}
                    >
                      {s.note}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Pinned outside the scroller — appended to an 1100px list, these would
          never be found. Jump links into the main column, not pane switches. */}
      <div className="shrink-0 border-t border-[var(--pt-border)] p-1.5">
        <p className="micro-label px-1.5 py-1">Project &amp; reference</p>
        {refs.map((r) => (
          <a
            key={r.id}
            href={`#${r.id}`}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] no-underline transition-colors',
              'text-[var(--pt-text-2)] hover:bg-[var(--pt-surface-raised)] hover:text-[var(--pt-text)]',
              'max-sm:min-h-[40px]',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.meta && (
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--pt-text-3)]">
                {r.meta}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
