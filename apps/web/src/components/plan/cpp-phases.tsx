'use client';

import { PHASES, checkId } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';
import type { PlanViewState } from './types';

type Props = {
  state: PlanViewState;
  onToggleCheck: (id: string, val: boolean) => void;
};

export function CppPhases({ state, onToggleCheck }: Props) {
  // IDs come from checkId.phase — never a positional `p${i}`.
  const done = PHASES.filter((phase) => state.checks[checkId.phase(phase)]).length;

  return (
    <section className="mb-6 overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3.5 sm:gap-4 sm:px-5">
        <h2 className="min-w-0 text-[14px] font-semibold text-[var(--pt-text)]">
          C++ Semantic Cache
        </h2>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--pt-text-3)]">
          {done}/{PHASES.length} complete
        </span>
      </div>

      {/* progress bar */}
      <div className="h-[3px] bg-[var(--pt-border)]">
        <div
          className="h-full bg-[var(--pt-green)] transition-all duration-700"
          style={{ width: `${(done / PHASES.length) * 100}%` }}
        />
      </div>

      {/* phase grid */}
      <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {PHASES.map((phase) => {
          const id = checkId.phase(phase);
          const checked = !!state.checks[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggleCheck(id, !checked)}
              aria-pressed={checked}
              className={cn(
                'rounded-md border p-3 text-left transition-all',
                checked
                  ? // `.filter-chip[data-active]` recipe: tint fill + a 50% accent border.
                    'border-[color-mix(in_srgb,var(--pt-green)_50%,transparent)] bg-[var(--pt-green-bg)]'
                  : // `.filter-chip:hover` recipe.
                    'border-[var(--pt-border)] bg-transparent hover:border-[var(--pt-text-3)]',
              )}
            >
              <div className="flex items-start gap-2.5">
                {/* checkbox dot */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                    checked
                      ? 'border-[var(--pt-green)] bg-[var(--pt-green)] text-[var(--pt-bg)]'
                      : 'border-[var(--pt-border-2)] bg-transparent',
                  )}
                >
                  {checked && (
                    <svg width="8" height="7" viewBox="0 0 8 7" fill="none">
                      <path
                        d="M1 3.5l2 2L7 1"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[var(--pt-text)]">
                    {phase.name}
                  </div>
                  <div className="mb-1.5 mt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] tabular-nums text-[var(--pt-green)]">
                    {phase.dates}
                  </div>
                  <div className="text-[11.5px] leading-[1.45] text-[var(--pt-text-2)]">
                    {phase.desc}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* triage note */}
      <div className="mx-4 mb-4 rounded-md border-l-2 border-l-[var(--pt-rose)] bg-[var(--pt-rose-bg)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--pt-text-2)]">
        <span className="font-semibold text-[var(--pt-rose)]">Triage if behind (cut top-down):</span>{' '}
        NSW stretch → mmap (plain binary snapshots are fine) → shrink benchmark scope.{' '}
        <span className="font-semibold text-[var(--pt-text)]">Never cut phases 2–4</span>{' '}
        (semantic layer · SIMD · eviction) — that trio is the resume story. Concurrency = one
        std::shared_mutex, nothing more.
      </div>
    </section>
  );
}
