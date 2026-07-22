'use client';

import { RESUME_ITEMS, checkId } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';
import { TaskRow } from './task-row';
import type { PlanViewState } from './types';

type Props = {
  state: PlanViewState;
  onToggleCheck: (id: string, val: boolean) => void;
};

/** Resume items ticked, counted the one legal way. */
export function resumeDone(state: PlanViewState): number {
  // IDs come from checkId.resume — never a positional `r${i}`.
  return RESUME_ITEMS.filter((item) => state.checks[checkId.resume(item)]).length;
}

export function ResumeChecklist({ state, onToggleCheck }: Props) {
  const done = resumeDone(state);
  const pct = Math.round((done / RESUME_ITEMS.length) * 100);
  const complete = done === RESUME_ITEMS.length;

  return (
    <section className="mb-6 overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3.5 sm:gap-4 sm:px-5">
        <h2 className="min-w-0 text-[14px] font-semibold text-[var(--pt-text)]">Resume checklist</h2>
        <span
          className={cn(
            'shrink-0 font-mono text-[12px] tabular-nums',
            complete ? 'text-[var(--pt-green)]' : 'text-[var(--pt-text-3)]',
          )}
        >
          {done}/{RESUME_ITEMS.length} — {pct}%
        </span>
      </div>

      {/* progress bar */}
      <div className="h-[3px] bg-[var(--pt-border)]">
        <div
          className="h-full bg-[var(--pt-amber)] transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ResumeChecklistBody state={state} onToggleCheck={onToggleCheck} />
    </section>
  );
}

/** The six rows without the section chrome (header bar and 3px progress bar). */
export function ResumeChecklistBody({ state, onToggleCheck }: Props) {
  return (
    <div className="p-4">
      {RESUME_ITEMS.map((item) => {
        const id = checkId.resume(item);
        return (
          <TaskRow
            key={id}
            id={id}
            label={item}
            tag="res"
            checked={!!state.checks[id]}
            onChange={onToggleCheck}
          />
        );
      })}
    </div>
  );
}
