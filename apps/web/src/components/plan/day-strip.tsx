'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { DaySummary } from './day-summary';

/**
 * The sub-`lg` form of the rail: a horizontal, snapping day strip.
 *
 * It is honestly a compromise — it carries a date and a done/total and cannot
 * show milestones or week context, so "look ahead" on a phone degrades to
 * stepping forward a day at a time. It sits sticky under the NavBar so it stays
 * reachable while the pane below it scrolls.
 */
type Props = {
  summaries: DaySummary[];
  selectedDate: string;
  onSelect: (date: string) => void;
};

export function DayStrip({ summaries, selectedDate, onSelect }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Centre the selection horizontally. scrollLeft directly for the same reason
  // the rail sets scrollTop — scrollIntoView would move the page too.
  useEffect(() => {
    const c = scroller.current;
    const el = selectedRef.current;
    if (!c || !el) return;
    const target = el.offsetLeft - c.clientWidth / 2 + el.clientWidth / 2;
    c.scrollLeft = Math.max(0, target);
  }, [selectedDate]);

  return (
    <div
      className={cn(
        // Under the NavBar's z-10, opaque so day rows can't ghost through.
        'sticky top-[76px] z-[9] -mx-[clamp(16px,4vw,32px)] bg-[var(--pt-bg)]',
        'border-y border-[var(--pt-border)] lg:hidden',
      )}
    >
      <div
        ref={scroller}
        role="tablist"
        aria-orientation="horizontal"
        aria-label="Plan days"
        className={cn(
          'relative flex gap-1 overflow-x-auto px-4 py-2',
          '[overscroll-behavior-x:contain] [scroll-snap-type:x_proximity] scroll-px-4',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {summaries.map((s) => {
          const selected = s.date === selectedDate;
          return (
            <button
              key={s.date}
              ref={selected ? selectedRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="plan-pane"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(s.date)}
              title={s.label}
              className={cn(
                'flex w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-md border-b-2 px-1 py-1.5 transition-colors sm:w-[58px]',
                '[scroll-snap-align:center] max-sm:min-h-[44px]',
                selected
                  ? 'border-b-[var(--pt-blue)] bg-[var(--pt-blue-bg)] text-[var(--pt-blue-ink)]'
                  : 'border-b-transparent text-[var(--pt-text-2)] hover:bg-[var(--pt-surface-raised)]',
                s.isPast && !s.isToday && !selected && 'opacity-55',
              )}
            >
              <span className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
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
              </span>
              <span
                className={cn(
                  'font-mono text-[10px] tabular-nums',
                  selected ? 'opacity-75' : 'text-[var(--pt-text-3)]',
                )}
              >
                {s.done}/{s.total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
