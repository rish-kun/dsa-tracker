'use client';

import {
  GOOGLE_REVISION_ALL,
  GOOGLE_REVISION_CONCEPT_GROUPS,
  GOOGLE_REVISION_CONCEPTS,
  checkId,
  googleRevisionTier,
  problemUrl,
  type GoogleRevisionProblem,
} from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';
import {
  CATEGORY_META,
  DIFFICULTY_CLASS,
  DIFFICULTY_LETTER,
  ExternalLinkIcon,
} from './problem-group';
import type { PlanViewState } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * The standalone Google DSA revision panel.
 *
 * The checkable Core 50 (45 core + 5 extras) in priority order, plus a compact
 * concept-recall reference. It shares plan_checks with the rest of /plan via
 * checkId.googleRevision, auto-ticks from solved canonical keys, and reuses the
 * same ProblemRow-style affordances (auto pill, difficulty letter, LC link).
 * ──────────────────────────────────────────────────────────────────────────── */

type Props = {
  state: PlanViewState;
  onToggleCheck: (id: string, val: boolean) => void;
};

/** Core-50 problems ticked, counted the one legal way. */
export function googleRevisionDone(state: PlanViewState): number {
  return GOOGLE_REVISION_ALL.filter((p) => state.checks[checkId.googleRevision(p)]).length;
}

/** The revision tint — green, same family as the manual "revision" category. */
const META = CATEGORY_META.revision;

const TIER_META = {
  must: {
    label: 'Must',
    className: 'bg-[var(--pt-rose-bg)] text-[var(--pt-rose)]',
  },
  should: {
    label: 'Should',
    className: 'bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
  },
  algorithm: {
    label: 'Algorithm',
    className: 'bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
  },
  recognition: {
    label: 'Recognise',
    className: 'bg-[var(--pt-surface-raised)] text-[var(--pt-text-3)]',
  },
} as const;

function RevisionRow({
  problem,
  state,
  onToggleCheck,
}: {
  problem: GoogleRevisionProblem;
  state: PlanViewState;
  onToggleCheck: (id: string, val: boolean) => void;
}) {
  const id = checkId.googleRevision(problem);
  const checked = !!state.checks[id];
  const autoTicked = checked && !!state.autoSolved[id];
  const url = problemUrl(problem);
  const tier = TIER_META[googleRevisionTier(problem.priority)];

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2 py-[7px] transition-colors hover:bg-[var(--pt-surface-raised)] max-sm:min-h-[44px]">
      <label
        title={
          autoTicked ? 'Ticked automatically from a detected solve — click to override' : undefined
        }
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5"
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
            checked && !autoTicked && META.box,
            autoTicked && META.autoBox,
          )}
        >
          {checked && (
            <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
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

        {/* priority */}
        <span className="flex w-[52px] shrink-0 items-center justify-end gap-1">
          <span className={cn('rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em]', tier.className)}>
            {tier.label}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
            {problem.priority}
          </span>
        </span>

        {/* difficulty letter */}
        <span className={cn(DIFFICULTY_LETTER, DIFFICULTY_CLASS[problem.difficulty])}>
          {problem.difficulty}
        </span>

        {/* name + cue */}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block break-words text-[13px] leading-snug transition-colors',
              checked ? 'text-[var(--pt-text-3)] line-through' : 'text-[var(--pt-text)]',
            )}
          >
            {problem.name}
          </span>
          {problem.cue && (
            <span className="block truncate text-[11px] leading-snug text-[var(--pt-text-3)]">
              {problem.cue}
            </span>
          )}
        </span>
      </label>

      {/* auto affordance */}
      {autoTicked && (
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0 rounded-md border px-1 py-[2px] font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.1em]',
            META.autoPill,
          )}
        >
          auto
        </span>
      )}

      {/* LeetCode link */}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Open ${problem.name} on LeetCode (new tab)`}
          title={`Open ${problem.name} on LeetCode (new tab)`}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md',
            'h-6 w-6 max-sm:h-9 max-sm:w-9',
            'text-[var(--pt-text-3)] opacity-55 transition-[opacity,color] duration-150',
            'group-hover:opacity-100 group-focus-within:opacity-100',
            'hover:text-[var(--pt-blue)] focus-visible:text-[var(--pt-blue)]',
            'focus-visible:opacity-100 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-[var(--pt-blue-ring)]',
            'max-sm:opacity-100',
          )}
        >
          <ExternalLinkIcon />
        </a>
      )}
    </div>
  );
}

/**
 * The Core 50 grouped by retrieval concept plus the compact concept reference, without
 * the section chrome (header bar and 3px progress bar) — those are the caller's
 * job, matching how CoreSetBody and CppPhasesBody are wired into the shells.
 */
export function GoogleRevisionBody({ state, onToggleCheck }: Props) {
  return (
    <div className="p-4">
      {GOOGLE_REVISION_CONCEPT_GROUPS.map((group, index) => {
        const { items } = group;
        const done = items.filter((p) => state.checks[checkId.googleRevision(p)]).length;
        return (
          <details key={group.name} open={index < 5} className="group/concept border-b border-[var(--pt-border)] last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center gap-3 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="text-[var(--pt-text-3)] transition-transform group-open/concept:rotate-90">›</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pt-green)]">
                  {group.name}
                </span>
                <span className="block truncate text-[11.5px] text-[var(--pt-text-3)]">{group.tell}</span>
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
                {done}/{items.length}
              </span>
            </summary>
            <div className="mb-2 rounded-md border border-[var(--pt-border)] px-1.5 py-1">
              {items.map((problem) => (
                <RevisionRow
                  key={checkId.googleRevision(problem)}
                  problem={problem}
                  state={state}
                  onToggleCheck={onToggleCheck}
                />
              ))}
            </div>
          </details>
        );
      })}

      {/* broad algorithm reference — recall only, not checkable */}
      <div className="mt-5 border-t border-[var(--pt-border)] pt-4">
        <p className="micro-label mb-3 text-[var(--pt-text-3)]">
          Algorithm recall — recognise the pattern, not a checkbox
        </p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {GOOGLE_REVISION_CONCEPTS.map(({ name, tell }) => (
            <li key={name} className="text-[12px] leading-relaxed text-[var(--pt-text-2)]">
              <strong className="text-[var(--pt-text)]">{name}</strong>
              {' — '}
              {tell}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
