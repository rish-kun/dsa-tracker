'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Chevron } from './problem-group';

/* ────────────────────────────────────────────────────────────────────────────
 * Four uniform disclosure rows, each carrying a summary dense enough that you
 * usually don't have to open it. The summary line is what the whole design
 * rests on: once a region is shut, it is the only thing between the user and a
 * mystery box.
 * ──────────────────────────────────────────────────────────────────────────── */

export type ShelfKey = 'cpp' | 'schedule' | 'resume' | 'rules';

/** Meter fills, written out literally so Tailwind's scanner sees them. */
const BAR = {
  blue: 'bg-[var(--pt-blue)]',
  green: 'bg-[var(--pt-green)]',
  amber: 'bg-[var(--pt-amber)]',
} as const;

export type ShelfRowSpec = {
  key: ShelfKey;
  title: string;
  /** One line, shown inline on desktop and on a second line at <sm. */
  summary: ReactNode;
  /** Mono `done/total`, omitted for the reference row. */
  count?: string;
  meter?: { fraction: number; tone: keyof typeof BAR };
  body: ReactNode;
};

type Props = {
  rows: ShelfRowSpec[];
  open: Set<ShelfKey>;
  onToggle: (key: ShelfKey) => void;
  onCollapseAll: () => void;
};

export function Shelf({ rows, open, onToggle, onCollapseAll }: Props) {
  const anyOpen = rows.some((r) => open.has(r.key));

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
      <div className="divide-y divide-[var(--pt-border)]">
        {rows.map((row) => {
          const isOpen = open.has(row.key);
          return (
            <div key={row.key}>
              <button
                type="button"
                onClick={() => onToggle(row.key)}
                aria-expanded={isOpen}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5',
                  'hover:bg-[var(--pt-surface-raised)] max-sm:min-h-[48px]',
                )}
              >
                <Chevron open={isOpen} size={12} />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="shrink-0 text-[13px] font-semibold text-[var(--pt-text)]">
                      {row.title}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--pt-text-3)]">
                      {row.summary}
                    </span>
                  </span>
                </span>

                {row.count && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
                    {row.count}
                  </span>
                )}

                {row.meter && (
                  <span className="hidden h-[4px] w-11 shrink-0 overflow-hidden rounded-full bg-[var(--pt-border)] sm:block">
                    <span
                      className={cn('block h-full rounded-full', BAR[row.meter.tone])}
                      style={{
                        width: `${Math.round(Math.min(1, Math.max(0, row.meter.fraction)) * 100)}%`,
                      }}
                    />
                  </span>
                )}
              </button>

              {/* Bodies unmount when shut. That is what keeps the closed page at
                  ~1.4 viewports; the cost is that a browser find-in-page can't
                  reach a collapsed region. */}
              {isOpen && (
                <div className="border-t border-[var(--pt-border)] bg-[var(--pt-surface)]">
                  {row.body}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The paired affordance that stops the shelf silently regressing into the
          long page it replaced. */}
      {anyOpen && (
        <button
          type="button"
          onClick={onCollapseAll}
          className="micro-label w-full border-t border-[var(--pt-border)] py-2.5 text-center transition-colors hover:bg-[var(--pt-surface-raised)] hover:text-[var(--pt-text)]"
        >
          Collapse all
        </button>
      )}
    </div>
  );
}
