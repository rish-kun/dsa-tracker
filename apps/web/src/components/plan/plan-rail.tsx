'use client';

import { DAYS, PHASE_COUNT, RESUME_ITEMS, WEEKS } from '@dsa-tracker/plan-data';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { DaySummary } from './day-summary';
import type { PlanSelection } from './selection';

/* ────────────────────────────────────────────────────────────────────────────
 * The day rail. This is the piece that makes the cockpit work: the 26-day
 * schedule stops being a section you scroll past and becomes the navigator you
 * steer with, so "look ahead at Jul 24" is one click instead of 3000px.
 * ──────────────────────────────────────────────────────────────────────────── */

export type RefEntry = {
  kind: 'cpp' | 'method' | 'resume' | 'schedule';
  label: string;
  meta?: string;
};

export function refEntries(cppDone: number, resDone: number): RefEntry[] {
  return [
    { kind: 'cpp', label: 'C++ Semantic Cache', meta: `${cppDone}/${PHASE_COUNT}` },
    { kind: 'schedule', label: 'Full schedule', meta: `${DAYS.length} days` },
    { kind: 'method', label: 'DSA method' },
    { kind: 'resume', label: 'Resume checklist', meta: `${resDone}/${RESUME_ITEMS.length}` },
  ];
}

/** Selected-row look — `.filter-chip[data-active]`: -ink on -bg, never -blue on -bg. */
const SELECTED = 'bg-[var(--pt-blue-bg)] text-[var(--pt-blue-ink)]';

type Props = {
  summaries: DaySummary[];
  selection: PlanSelection;
  onSelect: (sel: PlanSelection) => void;
  cppDone: number;
  resDone: number;
};

export function PlanRail({ summaries, selection, onSelect, cppDone, resDone }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);

  const selectedDate = selection.kind === 'day' ? selection.date : null;
  const refs = refEntries(cppDone, resDone);

  // Centre today on mount and on day rollover. scrollTop directly, NOT
  // scrollIntoView — that walks ancestors and would scroll the whole page.
  const todayKeyDep = summaries.find((s) => s.isToday)?.date;
  useEffect(() => {
    const c = listRef.current;
    const el = todayRef.current;
    if (!c || !el) return;
    c.scrollTop = Math.max(0, el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2);
  }, [todayKeyDep]);

  // Flat entry list for arrow navigation: 26 days, then the reference rows.
  const flat: PlanSelection[] = [
    ...summaries.map((s) => ({ kind: 'day' as const, date: s.date })),
    ...refs.map((r) => ({ kind: r.kind })),
  ];
  const currentIndex = flat.findIndex((e) =>
    e.kind === 'day' && selection.kind === 'day'
      ? e.date === selection.date
      : e.kind === selection.kind,
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (currentIndex === -1) return;
    let next = currentIndex;
    if (e.key === 'ArrowDown') next = Math.min(flat.length - 1, currentIndex + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, currentIndex - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = flat.length - 1;
    else if (e.key === 'PageDown') next = Math.min(summaries.length - 1, currentIndex + 7);
    else if (e.key === 'PageUp') next = Math.max(0, currentIndex - 7);
    else return;

    e.preventDefault();
    onSelect(flat[next]);
  };

  return (
    <div
      className={cn(
        'flex flex-col rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]',
        // 72px NavBar + 16px breathing room; 20px below.
        'lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-108px)]',
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
                    onClick={() => onSelect({ kind: 'day', date: s.date })}
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

                  {/* Milestones are the landmarks that make "look ahead"
                      legible, so each one sits directly under the day that
                      earns it — not pooled at the end of its week. */}
                  {s.milestone && (
                    <div
                      aria-hidden="true"
                      className="truncate pb-0.5 pl-[64px] pr-2 text-[10px] text-[var(--pt-violet)]"
                      title={s.milestone}
                    >
                      {s.milestone}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Pinned outside the scroller — appended to a 1100px list, these would
          never be found. */}
      <div className="shrink-0 border-t border-[var(--pt-border)] p-1.5">
        <p className="micro-label px-1.5 py-1">Project &amp; reference</p>
        {refs.map((r) => {
          const selected = selection.kind === r.kind;
          return (
            <button
              key={r.kind}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="plan-pane"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect({ kind: r.kind })}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
                selected
                  ? SELECTED
                  : 'text-[var(--pt-text-2)] hover:bg-[var(--pt-surface-raised)] hover:text-[var(--pt-text)]',
                'max-sm:min-h-[40px]',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              {r.meta && (
                <span
                  className={cn(
                    'shrink-0 font-mono text-[10px] tabular-nums',
                    selected ? 'opacity-75' : 'text-[var(--pt-text-3)]',
                  )}
                >
                  {r.meta}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
