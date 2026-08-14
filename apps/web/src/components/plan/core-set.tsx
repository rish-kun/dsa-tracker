import { CORE_SET, checkId } from '@dsa-tracker/plan-data';
import { CATEGORY_META, ProblemRow } from './problem-group';
import type { PlanViewState } from './types';

type Props = {
  state: PlanViewState;
  onToggleCheck: (id: string, val: boolean) => void;
};

/** Core-set problems ticked, counted the one legal way. */
export function coreDone(state: PlanViewState): number {
  // IDs come from checkId.core — never a template literal.
  return CORE_SET.filter((problem) => state.checks[checkId.core(problem)]).length;
}

/**
 * The 20-problem fallback list without the section chrome (header bar and
 * progress bar). Array order IS the priority order — no grouping, no accordion.
 */
export function CoreSetBody({ state, onToggleCheck }: Props) {
  return (
    <div className="p-4">
      <p className="micro-label mb-3 text-[var(--pt-text-3)]">
        The fallback 20 — if a day collapses, do these in order
      </p>

      {CORE_SET.map((problem) => {
        const id = checkId.core(problem);
        const checked = !!state.checks[id];
        return (
          <ProblemRow
            key={id}
            problem={problem}
            id={id}
            meta={CATEGORY_META.revision}
            checked={checked}
            autoTicked={checked && !!state.autoSolved[id]}
            onToggleCheck={onToggleCheck}
          />
        );
      })}
    </div>
  );
}
