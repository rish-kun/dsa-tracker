'use client';

import { DAYS, checkId, type DayEntry, type DsaCategory } from '@dsa-tracker/plan-data';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { shortDate } from './day-summary';
import {
  CATEGORY_ORDER,
  Chevron,
  DEFAULT_OPEN_CATEGORIES,
  ProblemCategoryGroup,
  problemEntries,
} from './problem-group';
import { TaskRow } from './task-row';
import type { PlanViewState } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * The daily panel, broken into composable pieces.
 *
 * The three candidate layouts arrange the same controls differently — one
 * column, a two-column pane, a detail pane driven by a day rail — so what is
 * shared here is each control, not a fixed composition. Every piece is
 * date-parameterised: `dateKey` is the day being edited, `todayKey` is only
 * used to label and to gate future days.
 *
 * The extra-problem counter is deliberately NOT date-parameterised — it writes
 * `plan_counters`, a singleton row, and is exported separately so a layout has
 * to place it consciously rather than have it ride along next to day-scoped
 * fields.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Manual extra-problem ladder ceiling. */
export const DSA_TARGET = 150;

/** NeetCode 150, then 150 more — the target the pace metric divides. */
export const TOTAL_TARGET = DSA_TARGET * 2;

/** Longest note that fits a rail row. Mirrors NOTE_MAX_LEN in lib/plan-state.ts. */
export const NOTE_MAX_LEN = 120;

/** Trip days budgeted for the whole plan. */
export const TRIP_BUDGET = 3;

/** The one uppercase kicker recipe — defined in globals.css. */
export const MICRO = 'micro-label';

export type FloorKey = 'dsa' | 'cpp' | 'log';

/** FloorKey -> the PlanDayState field holding it. Keeps the reads type-safe. */
const FLOOR_FIELD = {
  dsa: 'floorDsa',
  cpp: 'floorCpp',
  log: 'floorLog',
} as const satisfies Record<FloorKey, 'floorDsa' | 'floorCpp' | 'floorLog'>;

/**
 * A floor pill is a toggle chip, so its selected look is the dashboard's
 * `.filter-chip[data-active]` recipe verbatim, per family:
 * `--pt-X-bg` fill + `--pt-X-ink` text + a 50% `--pt-X` border.
 */
export const FLOOR_PILLS: {
  key: FloorKey;
  label: string;
  /** Pill styling when the floor is met. */
  on: string;
  /** Dot fill when met — also used by the header progress dots. */
  dot: string;
}[] = [
  {
    key: 'dsa',
    label: '4+ DSA solved',
    on: 'border-[color-mix(in_srgb,var(--pt-blue)_50%,transparent)] bg-[var(--pt-blue-bg)] text-[var(--pt-blue-ink)]',
    dot: 'bg-[var(--pt-blue)]',
  },
  {
    key: 'cpp',
    label: '1 C++ task touched',
    on: 'border-[color-mix(in_srgb,var(--pt-green)_50%,transparent)] bg-[var(--pt-green-bg)] text-[var(--pt-green-ink)]',
    dot: 'bg-[var(--pt-green)]',
  },
  {
    key: 'log',
    label: 'Log written',
    on: 'border-[color-mix(in_srgb,var(--pt-violet)_50%,transparent)] bg-[var(--pt-violet-bg)] text-[var(--pt-violet-ink)]',
    dot: 'bg-[var(--pt-violet)]',
  },
];

/**
 * Recessed input well. `--pt-surface-2` is deliberate here: it is darker than
 * `--pt-surface` in both modes, which is exactly right for a sunken field and
 * exactly wrong for anything raised — those use `--pt-surface-raised`.
 */
export const FIELD =
  'rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-2)] px-3 py-2 text-[13px] text-[var(--pt-text)] outline-none transition-colors placeholder:text-[var(--pt-text-3)] focus:[outline-offset:-1px] disabled:cursor-not-allowed disabled:opacity-50';

/** The plan entry for a date key, or null on a day the plan doesn't cover. */
export function dayEntry(dateKey: string): DayEntry | null {
  return DAYS.find((d) => d.date === dateKey) ?? null;
}

/** Whether one specific floor is met on a day. */
export function floorMet(state: PlanViewState, dateKey: string, which: FloorKey): boolean {
  return !!state.days[dateKey]?.[FLOOR_FIELD[which]];
}

/** How many of the three floors are met on a day. */
export function floorDoneCount(state: PlanViewState, dateKey: string): number {
  return FLOOR_PILLS.filter((p) => floorMet(state, dateKey, p.key)).length;
}

/**
 * A future day is read-only: its floors, trip flag and log are things that
 * haven't happened yet. Past days stay writable — backfilling a missed floor or
 * log is legitimate and `plan_days` accepts any valid date key.
 */
export function isFuture(dateKey: string, todayKey: string): boolean {
  return dateKey > todayKey;
}

/* ── header ──────────────────────────────────────────────────────────────── */

type HeaderProps = {
  state: PlanViewState;
  dateKey: string;
  todayKey: string;
  /** Renders prev/next day arrows when provided. */
  onStep?: (delta: -1 | 1) => void;
  onGoToToday?: () => void;
};

/** Day label + milestone on the left, floor-dot progress on the right. */
export function DayHeader({ state, dateKey, todayKey, onStep, onGoToToday }: HeaderProps) {
  const day = dayEntry(dateKey);
  const floorDone = floorDoneCount(state, dateKey);
  const isToday = dateKey === todayKey;

  // Whole days between two calendar keys, read at UTC midnight so DST never
  // shifts the difference. Same technique as `daysUntil` on the page.
  const offset = Math.round(
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000,
  );

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3 sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        {onStep && (
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label="Previous day"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--pt-text-3)] transition-colors hover:bg-[var(--pt-surface)] hover:text-[var(--pt-text)] max-sm:h-9 max-sm:w-9"
          >
            <span className="rotate-180">
              <Chevron open={false} size={12} />
            </span>
          </button>
        )}

        {/* The calendar convention: a "Today" button that only exists while you
            are looking at some other day, sitting with the arrows that moved you
            off it. */}
        {!isToday && onGoToToday && (
          <button
            type="button"
            onClick={onGoToToday}
            className={cn(
              'shrink-0 rounded-md border border-[var(--pt-border)] px-2.5 py-1 text-[12px] font-semibold transition-colors',
              'text-[var(--pt-text-2)] hover:border-[var(--pt-text-3)] hover:bg-[var(--pt-surface)] hover:text-[var(--pt-text)]',
              'max-sm:min-h-[36px]',
            )}
          >
            Today
          </button>
        )}

        {/* min-w-0 so a long day label wraps instead of pushing the floor-pill
            counter out of the card. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {isToday ? (
              <span className="rounded px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--pt-bg)] bg-[var(--pt-blue)]">
                Today
              </span>
            ) : (
              <span className="rounded px-1.5 py-[1px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]">
                {offset > 0 ? `+${offset}d` : `${offset}d`}
              </span>
            )}
            <span className="text-[15px] font-semibold text-[var(--pt-text)]">
              {day ? day.label : dateKey}
            </span>
          </div>
          {day?.milestone && (
            <div className="mt-0.5 text-[12px] font-medium text-[var(--pt-violet)]">
              {day.milestone}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* floor pill progress */}
        <div className="flex shrink-0 items-center gap-1.5">
          {FLOOR_PILLS.map((p) => (
            <span
              key={p.key}
              aria-hidden="true"
              className={cn(
                'h-2 w-2 rounded-full transition-all',
                state.days[dateKey]?.[FLOOR_FIELD[p.key]] ? p.dot : 'bg-[var(--pt-border-2)]',
              )}
            />
          ))}
          <span
            className={cn(
              'ml-1 font-mono text-[12px] tabular-nums',
              floorDone === FLOOR_PILLS.length
                ? 'text-[var(--pt-green)]'
                : 'text-[var(--pt-text-3)]',
            )}
          >
            {floorDone}/{FLOOR_PILLS.length} floor
          </span>
        </div>

        {onStep && (
          <button
            type="button"
            onClick={() => onStep(1)}
            aria-label="Next day"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--pt-text-3)] transition-colors hover:bg-[var(--pt-surface)] hover:text-[var(--pt-text)] max-sm:h-9 max-sm:w-9"
          >
            <Chevron open={false} size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── tasks ───────────────────────────────────────────────────────────────── */

export function DayTasks({
  state,
  dateKey,
  onToggleCheck,
}: {
  state: PlanViewState;
  dateKey: string;
  onToggleCheck: (id: string, val: boolean) => void;
}) {
  const day = dayEntry(dateKey);

  if (!day) {
    return (
      <p className="px-2 text-[13px] text-[var(--pt-text-3)]">No scheduled plan for this date.</p>
    );
  }

  return (
    <div className="-mx-2">
      {day.tasks.map((task, j) => {
        // IDs come from checkId.task — never a positional template literal.
        const id = checkId.task(day.date, j);
        return (
          <TaskRow
            key={id}
            id={id}
            label={task[1]}
            tag={task[0]}
            checked={!!state.checks[id]}
            auto={!!state.autoSolved[id]}
            onChange={onToggleCheck}
          />
        );
      })}
    </div>
  );
}

/* ── problems ────────────────────────────────────────────────────────────── */

/**
 * One day's problems in the three category groups. Owns its own accordion state
 * keyed by the bare category — only one day renders here, unlike Schedule, which
 * has to key by `${date}:${cat}`. Resets when `dateKey` changes via the `key`
 * the caller passes.
 */
export function DayProblems({
  state,
  dateKey,
  onToggleCheck,
}: {
  state: PlanViewState;
  dateKey: string;
  onToggleCheck: (id: string, val: boolean) => void;
}) {
  const day = dayEntry(dateKey);
  const [openCats, setOpenCats] = useState<Set<DsaCategory>>(
    () => new Set(DEFAULT_OPEN_CATEGORIES),
  );

  const toggleCat = (cat: DsaCategory) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  // Nothing renders when the day has no problems[] — a day may legitimately be
  // tasks-only, and an empty kicker reads as a bug.
  const entries = day ? problemEntries(day.date, day.problems) : [];
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {CATEGORY_ORDER.map((cat) => (
        <ProblemCategoryGroup
          key={cat}
          category={cat}
          entries={entries}
          state={state}
          open={openCats.has(cat)}
          onToggleOpen={() => toggleCat(cat)}
          onToggleCheck={onToggleCheck}
        />
      ))}
    </div>
  );
}

/** True when the day has any problems to show — lets a caller skip the kicker. */
export function hasProblems(dateKey: string): boolean {
  const day = dayEntry(dateKey);
  return !!day && (day.problems?.length ?? 0) > 0;
}

/* ── floor pills + trip ──────────────────────────────────────────────────── */

type FloorProps = {
  state: PlanViewState;
  dateKey: string;
  todayKey: string;
  onToggleFloor: (date: string, which: FloorKey) => void;
  onToggleTrip: (date: string) => void;
  /** Render trip as a fourth chip rather than a separate checkbox row. */
  tripAsChip?: boolean;
};

export function FloorControls({
  state,
  dateKey,
  todayKey,
  onToggleFloor,
  onToggleTrip,
  tripAsChip = false,
}: FloorProps) {
  const dayState = state.days[dateKey];
  const isTripDay = !!dayState?.trip;
  const liveSolved = state.solvedPerDay[dateKey] ?? 0;
  const dsaFloorAuto = !!state.floorDsaAuto[dateKey];
  const locked = isFuture(dateKey, todayKey);
  const lockHint = locked ? `${shortDate(dateKey)} hasn't happened yet` : undefined;

  // Trip days are budgeted across the whole plan, not per-day.
  const tripCount = Object.values(state.days).filter((d) => d.trip).length;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {FLOOR_PILLS.map(({ key, label, on, dot }) => {
          const active = !!dayState?.[FLOOR_FIELD[key]];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggleFloor(dateKey, key)}
              disabled={locked}
              title={lockHint}
              aria-pressed={active}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-all',
                'max-sm:min-h-[44px] max-sm:px-3.5',
                'disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? on
                  : // `.filter-chip:hover` verbatim: ink to --pt-text, border to --pt-text-3.
                    'border-[var(--pt-border)] bg-transparent text-[var(--pt-text-2)] hover:border-[var(--pt-text-3)] hover:text-[var(--pt-text)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  active ? dot : 'bg-[var(--pt-border-2)]',
                )}
              />
              {label}
              {key === 'dsa' && (
                <span className="font-mono text-[10px] font-normal tabular-nums opacity-75">
                  {liveSolved}/4{dsaFloorAuto ? ' · auto' : ''}
                </span>
              )}
            </button>
          );
        })}

        {tripAsChip && (
          <button
            type="button"
            onClick={() => onToggleTrip(dateKey)}
            disabled={locked}
            title={lockHint}
            aria-pressed={isTripDay}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-all',
              'max-sm:min-h-[44px] max-sm:px-3.5',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isTripDay
                ? 'border-[color-mix(in_srgb,var(--pt-rose)_50%,transparent)] bg-[var(--pt-rose-bg)] text-[var(--pt-rose-ink)]'
                : 'border-[var(--pt-border)] bg-transparent text-[var(--pt-text-2)] hover:border-[var(--pt-text-3)] hover:text-[var(--pt-text)]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                isTripDay ? 'bg-[var(--pt-rose)]' : 'bg-[var(--pt-border-2)]',
              )}
            />
            Trip day
            <span className="font-mono text-[10px] font-normal tabular-nums opacity-75">
              {tripCount}/{TRIP_BUDGET}
            </span>
          </button>
        )}
      </div>

      {!tripAsChip && (
        // The <label> is the only interactive surface, so a click cannot toggle
        // the input and a handler on the box twice.
        <label
          title={lockHint}
          className={cn(
            'mt-3 flex select-none flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--pt-text-2)] max-sm:min-h-[44px]',
            locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          )}
        >
          <input
            type="checkbox"
            checked={isTripDay}
            disabled={locked}
            onChange={() => onToggleTrip(dateKey)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-all',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--pt-blue-ring)]',
              isTripDay
                ? 'border-[var(--pt-rose)] bg-[var(--pt-rose)] text-[var(--pt-bg)]'
                : 'border-[var(--pt-border-2)] bg-transparent',
            )}
          >
            {isTripDay && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
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
          Trip day — zero work, no guilt
          <span className="font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
            ({tripCount}/{TRIP_BUDGET})
          </span>
        </label>
      )}
    </>
  );
}

/* ── log ─────────────────────────────────────────────────────────────────── */

type LogProps = {
  dateKey: string;
  todayKey: string;
  value: string;
  onChange: (v: string) => void;
  onSave: (date: string, text: string) => void;
  className?: string;
};

/** The one-line log field. Drafts live in PlanClient so a remount can't eat them. */
export function LogField({ dateKey, todayKey, value, onChange, onSave, className }: LogProps) {
  const locked = isFuture(dateKey, todayKey);
  const isToday = dateKey === todayKey;

  const save = () => {
    const text = value.trim();
    if (text && !locked) {
      onSave(dateKey, text);
      onChange('');
    }
  };

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row', className)}>
      <input
        type="text"
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
        }}
        placeholder={
          isToday
            ? 'problems done / phase progress / one thing learned'
            : `log for ${shortDate(dateKey)}`
        }
        title={locked ? `${shortDate(dateKey)} hasn't happened yet` : undefined}
        aria-label={isToday ? 'One-line log' : `One-line log for ${shortDate(dateKey)}`}
        className={cn(FIELD, 'min-w-0 flex-1 focus:[outline:2px_solid_var(--pt-violet)] max-sm:min-h-[44px]')}
      />
      <button
        type="button"
        onClick={save}
        disabled={locked}
        className="shrink-0 rounded-md bg-[var(--pt-violet)] px-3.5 py-2 text-[13px] font-semibold text-[var(--pt-bg)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-[44px]"
      >
        Save
      </button>
    </div>
  );
}

/** Every saved log, newest first, behind a disclosure. */
export function LogHistory({ state }: { state: PlanViewState }) {
  const [open, setOpen] = useState(false);

  // flatMap rather than filter so the non-null `log` survives without a cast.
  const entries = Object.entries(state.days)
    .flatMap(([date, d]) => (d.log ? [{ date, log: d.log }] : []))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (entries.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors hover:bg-[var(--pt-surface-raised)] max-sm:min-h-[44px]"
      >
        <Chevron open={open} size={11} />
        <span className="text-[13px] font-medium text-[var(--pt-text)]">Log history</span>
        <span className="text-[12px] text-[var(--pt-text-3)]">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · last{' '}
          {entries[0].date.slice(5)}
        </span>
      </button>

      {open && (
        <div className="mt-1 overflow-hidden rounded-md border border-[var(--pt-border)]">
          <div className="max-h-[180px] divide-y divide-[var(--pt-border)] overflow-y-auto [overscroll-behavior:contain]">
            {entries.map(({ date, log }) => (
              <div key={date} className="flex items-baseline gap-3 px-3 py-2 text-[12.5px]">
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--pt-text-3)]">
                  {date.slice(5)}
                </span>
                <span className="text-[var(--pt-text-2)]">{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── per-day note ────────────────────────────────────────────────────────── */

type NoteProps = {
  state: PlanViewState;
  dateKey: string;
  onSaveNote: (date: string, text: string) => void;
};

/**
 * A short pinned note for one day — the thing that shows up beside that day in
 * the rail. Distinct from the one-line log: the log is "what I did", written
 * after the fact and kept as history; a note is "what this day is for", and it
 * is the only annotation the rail has room to surface.
 *
 * Unlike the log, this is editable on any day including future ones — annotating
 * "Google OA" on a day that hasn't arrived is the whole point.
 */
export function DayNote({ state, dateKey, onSaveNote }: NoteProps) {
  const saved = state.days[dateKey]?.note ?? '';
  const [draft, setDraft] = useState(saved);
  const [editing, setEditing] = useState(false);

  // The note is per-day, so a draft must not follow the user to the next day.
  // Callers key this component by dateKey; this resync covers the case where the
  // saved value changes underneath an open editor (a revalidation landing).
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    if (!editing) setDraft(saved);
  }

  const commit = () => {
    const text = draft.trim().slice(0, NOTE_MAX_LEN);
    setEditing(false);
    if (text !== saved) onSaveNote(dateKey, text);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
          'hover:bg-[var(--pt-surface-raised)] max-sm:min-h-[44px]',
          saved ? 'text-[var(--pt-violet)]' : 'text-[var(--pt-text-3)]',
        )}
      >
        <span aria-hidden="true" className="shrink-0 text-[11px]">
          {saved ? '◆' : '+'}
        </span>
        <span className="min-w-0 flex-1 break-words">{saved || 'Add a note for this day'}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={draft}
        maxLength={NOTE_MAX_LEN}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit();
          if (e.key === 'Escape') {
            setDraft(saved);
            setEditing(false);
          }
        }}
        placeholder="e.g. Google OA — warmup only"
        aria-label={`Note for ${shortDate(dateKey)}`}
        className={cn(FIELD, 'min-w-0 flex-1 focus:[outline:2px_solid_var(--pt-violet)] max-sm:min-h-[44px]')}
      />
      <button
        type="button"
        onClick={commit}
        className="shrink-0 rounded-md bg-[var(--pt-violet)] px-3.5 py-2 text-[13px] font-semibold text-[var(--pt-bg)] transition-opacity hover:opacity-85 max-sm:min-h-[44px]"
      >
        Save
      </button>
    </div>
  );
}

/* ── extra-problem counter ───────────────────────────────────────────────── */

type ExtraProps = {
  state: PlanViewState;
  value: string;
  onChange: (v: string) => void;
  onAdd: (n: number) => void;
  onUndo: () => void;
  /** Drop the "N left in extra" caption where a meter already shows it. */
  compact?: boolean;
  /**
   * Put the label above the controls instead of inline. The rail is 272px wide
   * — label + badge + field + two buttons on one line wraps `Undo` onto an
   * orphan row there.
   */
  stacked?: boolean;
};

/**
 * Writes `plan_counters` — a singleton row, NOT day-scoped. It must never sit
 * inside a panel that can display a day other than today, or it reads as if it
 * were writing to that day.
 */
export function ExtraCounter({
  state,
  value,
  onChange,
  onAdd,
  onUndo,
  compact = false,
  stacked = false,
}: ExtraProps) {
  const submit = () => {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) {
      onAdd(n);
      onChange('');
    }
  };

  const label = (
    <>
      <span className={cn(MICRO, 'shrink-0')}>Extra</span>
      <span className="rounded-md bg-[var(--pt-violet-bg)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--pt-violet)]">
        {state.counters.dsaExtra}/{DSA_TARGET}
      </span>
    </>
  );

  return (
    <div className={cn(stacked ? 'space-y-1.5' : 'flex flex-wrap items-center gap-2')}>
      {stacked ? <div className="flex items-center gap-2">{label}</div> : label}
      <div className={cn(stacked && 'flex items-center gap-1.5')}>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
        }}
        placeholder="0"
        aria-label="Add to extra-problem counter"
        className={cn(
          FIELD,
          'font-mono tabular-nums max-sm:min-h-[44px]',
          stacked ? 'w-12 min-w-0 flex-1 px-2' : 'w-14',
          'focus:[outline:2px_solid_var(--pt-violet)]',
        )}
      />
      <button
        type="button"
        onClick={submit}
        className={cn(
          'shrink-0 rounded-md bg-[var(--pt-violet)] py-2 text-[13px] font-semibold text-[var(--pt-bg)] transition-opacity hover:opacity-85 max-sm:min-h-[44px]',
          stacked ? 'px-2.5' : 'px-3',
        )}
      >
        Add
      </button>
      <button
        type="button"
        onClick={onUndo}
        className={cn(
          'shrink-0 rounded-md border border-[var(--pt-border)] bg-transparent py-2 text-[13px] font-semibold text-[var(--pt-text-2)] transition-colors hover:border-[var(--pt-text-3)] hover:text-[var(--pt-text)] max-sm:min-h-[44px]',
          stacked ? 'px-2.5' : 'px-3',
        )}
      >
        Undo
      </button>
      </div>
      {!compact && (
        <span className="text-[11px] text-[var(--pt-text-3)]">
          <span className="font-mono tabular-nums">
            {Math.max(0, DSA_TARGET - state.counters.dsaExtra)}
          </span>{' '}
          left in extra
        </span>
      )}
    </div>
  );
}

/* ── shared derivations ──────────────────────────────────────────────────── */

/**
 * The calendar day before a 'YYYY-MM-DD' key.
 *
 * This steps an already-local key back by one calendar day; it does NOT read the
 * clock. The key is parsed at UTC midnight and rebuilt from UTC getters, so the
 * arithmetic is pure calendar maths with no zone in play. That is the opposite
 * of calling `toISOString()` on `new Date()`, which is what rolls the plan day
 * over at the wrong local time — keys still only ever originate in
 * `localDateKey`.
 */
function previousDateKey(dateKey: string): string | null {
  const ms = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms - 86_400_000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * True when yesterday was a zero day with no trip flag — the only moment the
 * "never miss twice" rule is information rather than decoration.
 */
export function missedYesterday(state: PlanViewState): boolean {
  const y = previousDateKey(state.todayKey);
  if (!y) return false;

  // Only meaningful inside the plan window.
  if (!DAYS.some((d) => d.date === y)) return false;
  if (state.days[y]?.trip) return false;
  return (state.solvedPerDay[y] ?? 0) === 0 && floorDoneCount(state, y) === 0;
}
