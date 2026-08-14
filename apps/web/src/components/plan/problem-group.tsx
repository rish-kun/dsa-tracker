'use client';

import { checkId, problemUrl, type DsaCategory, type DsaProblem } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';
import type { PlanViewState } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * The single implementation of the "DSA problems, grouped by category" UI.
 *
 * `TodayHero` (one day) and `Schedule` (all 34 days) both render it and must
 * stay visually indistinguishable — they used to hold byte-identical copies of
 * everything below, which survived exactly as long as nobody edited either
 * file. Anything shared by both lives here now; anything only one of them has
 * (Schedule's TODAY badge, milestone chip, past-day dimming) stays there.
 *
 * What this module deliberately does NOT own is the accordion *state*. The two
 * callers key it differently — Schedule by `${date}:${cat}` because 34 days
 * render at once and opening one day's "New" must not open every day's,
 * TodayHero by the bare category because only one day exists — so `open` and
 * `onToggleOpen` are props.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Render order of the three nested problem groups. */
export const CATEGORY_ORDER: DsaCategory[] = ['new', 'revision', 'stretch'];

/** Groups expanded on first paint. */
export const DEFAULT_OPEN_CATEGORIES: DsaCategory[] = ['new', 'revision'];

export type CategoryMeta = {
  label: string;
  desc: string;
  /** Header badge tint. */
  badge: string;
  /** Checkbox when manually ticked — solid fill. */
  box: string;
  /** Checkbox when derived from a detected solve — outline, not fill. */
  autoBox: string;
  /** "auto" affordance pill. */
  autoPill: string;
};

export const CATEGORY_META: Record<DsaCategory, CategoryMeta> = {
  new: {
    label: 'New',
    desc: 'counts toward 300',
    badge: 'bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
    box: 'border-[var(--pt-blue)] bg-[var(--pt-blue)] text-[var(--pt-bg)]',
    autoBox: 'border-[var(--pt-blue)] bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
    autoPill:
      'border-[color-mix(in_srgb,var(--pt-blue)_45%,transparent)] bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
  },
  revision: {
    label: 'Revision',
    desc: 'NC150 breadth refresh',
    badge: 'bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
    box: 'border-[var(--pt-green)] bg-[var(--pt-green)] text-[var(--pt-bg)]',
    autoBox: 'border-[var(--pt-green)] bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
    autoPill:
      'border-[color-mix(in_srgb,var(--pt-green)_45%,transparent)] bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
  },
  stretch: {
    label: 'Stretch',
    desc: 'Hards — skip on heavy OA days',
    badge: 'bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
    box: 'border-[var(--pt-amber)] bg-[var(--pt-amber)] text-[var(--pt-bg)]',
    autoBox: 'border-[var(--pt-amber)] bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
    autoPill:
      'border-[color-mix(in_srgb,var(--pt-amber)_45%,transparent)] bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
  },
};

/**
 * E/M/H letters: same `--pt-diff-*` tokens the dashboard's `.chip-easy|medium|hard`
 * use, at the same 600 weight (see DIFFICULTY_LETTER below). The compact form is
 * the only difference — a bare letter instead of a pill.
 */
export const DIFFICULTY_CLASS: Record<'E' | 'M' | 'H', string> = {
  E: 'text-[var(--pt-diff-easy)]',
  M: 'text-[var(--pt-diff-medium)]',
  H: 'text-[var(--pt-diff-hard)]',
};

/** Metrics half of the difficulty letter — 600, matching `.chip`. */
export const DIFFICULTY_LETTER = 'w-4 shrink-0 text-center font-mono text-[11px] font-semibold';

export function Chevron({ open, size }: { open: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cn(
        'shrink-0 text-[var(--pt-text-3)] transition-transform duration-200',
        open && 'rotate-90',
      )}
    >
      <path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Trailing "opens on LeetCode" glyph. Purely decorative — the accessible name
 * lives on the wrapping <a>, so this must stay aria-hidden.
 */
export function ExternalLinkIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M9.5 7.25v2A1.25 1.25 0 0 1 8.25 10.5h-5.5A1.25 1.25 0 0 1 1.5 9.25v-5.5A1.25 1.25 0 0 1 2.75 2.5h2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.25 1.5h3.25v3.25M10.5 1.5L5.75 6.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One problem plus its resolved check id and its position in the day's list.
 * `idx` is carried because two entries in a day can be reference-equal, so it
 * is what keys them apart in the render.
 */
export type ProblemEntry = {
  problem: DsaProblem;
  idx: number;
  id: string;
};

/**
 * Resolve a day's problems to `{ problem, idx, id }` once, up front.
 *
 * Callers must use this rather than looking a problem's index back up inside
 * the render (`problems.indexOf(problem)` was O(n²) *and* collapsed onto the
 * first match for reference-equal entries). Ids come from `checkId.problem` and
 * nothing else — never a template literal — which is what makes a tick in
 * TodayHero and the same tick in Schedule the same row.
 */
export function problemEntries(date: string, problems: DsaProblem[] | undefined): ProblemEntry[] {
  return (problems ?? []).map((problem, idx) => ({
    problem,
    idx,
    id: checkId.problem(date, problem),
  }));
}

type ProblemRowProps = {
  problem: DsaProblem;
  /** From `checkId.problem` — see `problemEntries`. */
  id: string;
  /** Tint set for the category this row sits under. */
  meta: CategoryMeta;
  checked: boolean;
  /** Ticked, and the tick came from a detected solve rather than a click. */
  autoTicked: boolean;
  onToggleCheck: (id: string, val: boolean) => void;
};

/** One problem: checkbox, difficulty letter, name, `auto` pill, LeetCode link. */
export function ProblemRow({
  problem,
  id,
  meta,
  checked,
  autoTicked,
  onToggleCheck,
}: ProblemRowProps) {
  // null for the 5 `(Striver)` entries — they have no LeetCode equivalent, so
  // they render as plain text with no link and no dead affordance.
  const url = problemUrl(problem);

  return (
    // Row wrapper, NOT a <label>: the link has to sit outside the label or the
    // click target is ambiguous (a click on the anchor would also toggle the
    // input the label owns). The label still wraps the whole
    // checkbox/difficulty/name cluster and remains the sole toggle surface.
    <div className="group flex items-center gap-2.5 rounded-md px-2 py-[7px] transition-colors hover:bg-[var(--pt-surface-raised)] max-sm:min-h-[44px]">
      <label
        title={
          autoTicked
            ? 'Ticked automatically from a detected solve — click to override'
            : undefined
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
            checked && !autoTicked && meta.box,
            autoTicked && meta.autoBox,
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

        {/* difficulty letter */}
        <span className={cn(DIFFICULTY_LETTER, DIFFICULTY_CLASS[problem.difficulty])}>
          {problem.difficulty}
        </span>

        {/* problem name — break-words so a single long token can never widen
            the row past its column. */}
        <span
          className={cn(
            'min-w-0 flex-1 break-words text-[13px] leading-snug transition-colors',
            checked ? 'text-[var(--pt-text-3)] line-through' : 'text-[var(--pt-text)]',
          )}
        >
          {problem.name}
        </span>
      </label>

      {/* auto affordance */}
      {autoTicked && (
        <span
          aria-hidden="true"
          className={cn(
            'shrink-0 rounded-md border px-1 py-[2px] font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.1em]',
            meta.autoPill,
          )}
        >
          auto
        </span>
      )}

      {/* LeetCode link — outside the <label> so it cannot toggle the check,
          with stopPropagation as a belt-and-braces guard. Quiet at rest,
          revealed on row hover / keyboard focus, matching `.review-links`. */}
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

type ProblemCategoryGroupProps = {
  category: DsaCategory;
  /** The whole day's entries — the group selects its own category out of them. */
  entries: ProblemEntry[];
  state: PlanViewState;
  /** Accordion state is owned by the caller: the two views key it differently. */
  open: boolean;
  onToggleOpen: () => void;
  onToggleCheck: (id: string, val: boolean) => void;
};

/**
 * One category: header button (badge + hint + done/total + chevron) and, when
 * expanded, its problem rows. Renders nothing when the day has no problem in
 * this category.
 */
export function ProblemCategoryGroup({
  category,
  entries,
  state,
  open,
  onToggleOpen,
  onToggleCheck,
}: ProblemCategoryGroupProps) {
  const catProblems = entries.filter(({ problem }) => problem.category === category);
  if (catProblems.length === 0) return null;

  const meta = CATEGORY_META[category];
  const doneCat = catProblems.filter(({ id }) => state.checks[id]).length;

  return (
    <div className="overflow-hidden rounded-md border border-[var(--pt-border)]">
      {/* category header */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 bg-[var(--pt-surface-raised)] px-3 py-2 text-left max-sm:min-h-[44px]"
      >
        <span
          className={cn(
            'rounded-md px-2 py-[2px] font-mono text-[11px] font-bold uppercase tracking-[0.06em]',
            meta.badge,
          )}
        >
          {meta.label}
        </span>
        {/* `truncate` keeps this hint on one line: at 360px the badge + counter
            + chevron leave it ~90px, and wrapping "Hards — skip on heavy OA
            days" turned every category header into three lines. It never
            truncates from `sm` up. */}
        <span className="flex-1 truncate text-[12px] text-[var(--pt-text-2)]">{meta.desc}</span>
        <span className="font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
          {doneCat}/{catProblems.length}
        </span>
        <Chevron open={open} size={11} />
      </button>

      {/* problems list */}
      {open && (
        <div className="border-t border-[var(--pt-border)] px-2 py-1">
          {catProblems.map(({ problem, idx, id }) => {
            const checked = !!state.checks[id];
            return (
              <ProblemRow
                key={`${idx}:${id}`}
                problem={problem}
                id={id}
                meta={meta}
                checked={checked}
                autoTicked={checked && !!state.autoSolved[id]}
                onToggleCheck={onToggleCheck}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
