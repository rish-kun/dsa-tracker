'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────────────
 * The tab rail. Styling is `.filter-chip` + `data-active` verbatim — the same
 * recipe the floor pills and the C++ phase cards already use — so the selected
 * state comes free as `--pt-blue-ink` on `--pt-blue-bg`, and the tabs read as
 * native rather than as an invented widget.
 *
 * Deliberately NOT the NavBar's active look: two grey-lift nav rows stacked
 * 80px apart reads as a bug.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PLAN_TAB_IDS = ['today', 'cpp', 'schedule', 'method'] as const;
export type PlanTabId = (typeof PLAN_TAB_IDS)[number];

export function isPlanTab(v: string | undefined): v is PlanTabId {
  return !!v && (PLAN_TAB_IDS as readonly string[]).includes(v);
}

const LABELS: Record<PlanTabId, string> = {
  today: 'Today',
  cpp: 'C++',
  schedule: 'Schedule',
  method: 'Method',
};

type Props = {
  tab: PlanTabId;
  onChange: (tab: PlanTabId) => void;
  /** Per-tab headline number, so hiding a pane costs the detail, never the signal. */
  badges: Partial<Record<PlanTabId, string>>;
};

export function PlanTabs({ tab, onChange, badges }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the selection on screen when arrow keys walk past the visible edge at
  // narrow widths. `inline: 'nearest'` so a visible tab never causes a jump.
  useEffect(() => {
    const i = PLAN_TAB_IDS.indexOf(tab);
    refs.current[i]?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = PLAN_TAB_IDS.indexOf(tab);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % PLAN_TAB_IDS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + PLAN_TAB_IDS.length) % PLAN_TAB_IDS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = PLAN_TAB_IDS.length - 1;
    else return;

    e.preventDefault();
    // Automatic activation: panes are already-loaded client state, not fetches.
    onChange(PLAN_TAB_IDS[next]);
    refs.current[next]?.focus();
  };

  return (
    <div
      className={cn(
        // z-[9] sits under the NavBar's z-10 so the rail slides beneath it.
        // top-[75px]/[71px] is the NavBar's measured height — a magic number
        // coupled to its `py-[18px]` + link metrics in src/components/NavBar.tsx.
        'sticky top-[75px] z-[9] mb-4 sm:top-[71px]',
        // Full-bleed: cancel .page's horizontal padding so the last chip visibly
        // clips at the viewport edge, which is the scroll affordance.
        '-mx-[clamp(16px,4vw,32px)] px-[clamp(16px,4vw,32px)]',
        'border-b border-[var(--pt-border)] bg-[var(--pt-bg)]',
      )}
    >
      <div
        role="tablist"
        aria-label="Plan sections"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className={cn(
          'flex flex-nowrap gap-1.5 overflow-x-auto py-2.5',
          // Without contain, an iOS swipe past the end triggers back-navigation —
          // same reason `.table-scroll` has it.
          '[overscroll-behavior-x:contain] [scroll-snap-type:x_proximity]',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {PLAN_TAB_IDS.map((id, i) => {
          const active = id === tab;
          const badge = badges[id];
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`plan-tab-${id}`}
              aria-controls={`plan-pane-${id}`}
              aria-selected={active}
              // Roving tabindex: exactly one tab in the page tab order.
              tabIndex={active ? 0 : -1}
              data-active={active || undefined}
              onClick={() => onChange(id)}
              className={cn(
                'filter-chip',
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap [scroll-snap-align:start]',
                'px-3.5 py-[7px] text-[13px] font-medium',
                'max-sm:min-h-[38px] max-sm:px-2.5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pt-blue-ring)]',
              )}
            >
              {LABELS[id]}
              {badge && (
                <span
                  className={cn(
                    'font-mono text-[10px] font-semibold tabular-nums max-sm:text-[9px]',
                    // --pt-blue-ink is the only correct ink on --pt-blue-bg;
                    // --pt-blue here would be blue-on-blue.
                    active ? 'text-[var(--pt-blue-ink)] opacity-75' : 'text-[var(--pt-text-3)]',
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
