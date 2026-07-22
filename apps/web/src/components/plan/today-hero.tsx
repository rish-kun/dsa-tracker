'use client';

import { DAYS, checkId, type DsaCategory } from '@dsa-tracker/plan-data';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CATEGORY_ORDER,
  DEFAULT_OPEN_CATEGORIES,
  ProblemCategoryGroup,
  problemEntries,
} from './problem-group';
import { TaskRow } from './task-row';
import type { PlanViewState } from './types';

/** NeetCode 150 / the matching "extra" ladder — both counters share the ceiling. */
const DSA_TARGET = 150;

/** Trip days budgeted for the whole plan. */
const TRIP_BUDGET = 3;

/** The one uppercase kicker recipe — defined in globals.css, shared with `.problems-table th`. */
const MICRO = 'micro-label';

type FloorKey = 'dsa' | 'cpp' | 'log';

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
const FLOOR_PILLS: {
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

const TABS = [
  {
    key: 'neetcode' as const,
    label: 'NeetCode',
    text: 'text-[var(--pt-blue)]',
    chip: 'bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
    // Matches `.search-input:focus` — a 2px inset accent outline, not a border swap.
    focus: 'focus:[outline:2px_solid_var(--pt-blue)]',
    button: 'bg-[var(--pt-blue)]',
    left: 'left in NeetCode',
  },
  {
    key: 'extra' as const,
    label: 'Extra',
    text: 'text-[var(--pt-violet)]',
    chip: 'bg-[var(--pt-violet-bg)] text-[var(--pt-violet)]',
    focus: 'focus:[outline:2px_solid_var(--pt-violet)]',
    button: 'bg-[var(--pt-violet)]',
    left: 'left in extra',
  },
];

/**
 * Recessed input well. `--pt-surface-2` is deliberate here and *only* here (plus
 * the tab track below): it is darker than `--pt-surface` in both modes, which is
 * exactly right for a sunken field and exactly wrong for anything raised — those
 * use `--pt-surface-raised`.
 */
const FIELD =
  'rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-2)] px-3 py-2 text-[13px] text-[var(--pt-text)] outline-none transition-colors placeholder:text-[var(--pt-text-3)] focus:[outline-offset:-1px]';

type Props = {
  state: PlanViewState;
  todayKey: string;
  onToggleCheck: (id: string, val: boolean) => void;
  onToggleFloor: (date: string, which: FloorKey) => void;
  onToggleTrip: (date: string) => void;
  onAddDsa: (n: number) => void;
  onUndoDsa: () => void;
  onAddDsaExtra: (n: number) => void;
  onUndoDsaExtra: () => void;
  onSaveLog: (text: string) => void;
};

export function TodayHero({
  state,
  todayKey,
  onToggleCheck,
  onToggleFloor,
  onToggleTrip,
  onAddDsa,
  onUndoDsa,
  onAddDsaExtra,
  onUndoDsaExtra,
  onSaveLog,
}: Props) {
  const today = DAYS.find((d) => d.date === todayKey) ?? null;
  const dayState = state.days[todayKey];
  const isTripDay = !!dayState?.trip;

  const [dsaInput, setDsaInput] = useState('');
  const [extraInput, setExtraInput] = useState('');
  const [dsaTab, setDsaTab] = useState<'neetcode' | 'extra'>('neetcode');
  const [logInput, setLogInput] = useState('');

  // Same seeding rule as schedule.tsx: "new" + "revision" open, "stretch"
  // closed. Only one day is ever rendered here, so the key is the bare category.
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

  // Resolve every id once, up front. Ids come from checkId.problem — never a
  // template literal — so they match the ones Schedule emits for the same day.
  const todayProblems = today ? problemEntries(today.date, today.problems) : [];

  const floorOn = (key: FloorKey) => !!dayState?.[FLOOR_FIELD[key]];
  const floorDone = FLOOR_PILLS.filter((p) => floorOn(p.key)).length;

  // Trip days are budgeted across the whole plan, not per-day.
  const tripCount = Object.values(state.days).filter((d) => d.trip).length;

  // Log history now lives on state.days — flatMap rather than filter so the
  // non-null `log` survives into the render without a cast.
  const logEntries = Object.entries(state.days)
    .flatMap(([date, d]) => (d.log ? [{ date, log: d.log }] : []))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const submitCount = (raw: string, add: (n: number) => void, clear: () => void) => {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) {
      add(n);
      clear();
    }
  };
  const handleAddDsa = () => submitCount(dsaInput, onAddDsa, () => setDsaInput(''));
  const handleAddExtra = () => submitCount(extraInput, onAddDsaExtra, () => setExtraInput(''));
  const handleSaveLog = () => {
    const text = logInput.trim();
    if (text) {
      onSaveLog(text);
      setLogInput('');
    }
  };

  const activeTab = TABS.find((t) => t.key === dsaTab) ?? TABS[0];
  const activeCount = dsaTab === 'neetcode' ? state.counters.dsa : state.counters.dsaExtra;

  return (
    <section className="mb-6 overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
      {/* top bar — --pt-surface-raised, the same header fill as `.problems-table th` */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3 sm:gap-4 sm:px-5">
        {/* min-w-0 so a long day label ("Thu Jul 23 — total → 180 · Sliding
            window + two pointers + binary search") wraps instead of pushing the
            floor-pill counter out of the card. */}
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-[var(--pt-text)]">
            {today ? today.label : todayKey}
          </div>
          {today?.milestone && (
            <div className="mt-0.5 text-[12px] font-medium text-[var(--pt-violet)]">
              {today.milestone}
            </div>
          )}
        </div>

        {/* floor pill progress */}
        <div className="flex shrink-0 items-center gap-1.5">
          {FLOOR_PILLS.map((p) => (
            <span
              key={p.key}
              aria-hidden="true"
              className={cn(
                'h-2 w-2 rounded-full transition-all',
                floorOn(p.key) ? p.dot : 'bg-[var(--pt-border-2)]',
              )}
            />
          ))}
          <span
            className={cn(
              'ml-1 font-mono text-[12px] tabular-nums',
              floorDone === FLOOR_PILLS.length ? 'text-[var(--pt-green)]' : 'text-[var(--pt-text-3)]',
            )}
          >
            {floorDone}/{FLOOR_PILLS.length} floor
          </span>
        </div>
      </div>

      {/* minmax(0, …) rather than a bare fr: an fr track floors at min-content,
          so one long unbroken label could widen the left column past its share
          at lg. Identical rendering, no blow-out path. */}
      <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        {/* ── Left: plan + floor ── */}
        <div>
          <p className={cn(MICRO, 'mb-2')}>Today&apos;s plan</p>
          <div className="-mx-2">
            {today ? (
              today.tasks.map((task, j) => {
                // IDs come from checkId.task — never a positional template literal.
                const id = checkId.task(today.date, j);
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
              })
            ) : (
              <p className="px-2 text-[13px] text-[var(--pt-text-3)]">
                No scheduled plan for this date.
              </p>
            )}
          </div>

          {/* ── Today's problems ──
              Nothing renders when the day has no problems[] — a day may
              legitimately be tasks-only, and an empty kicker reads as a bug. */}
          {todayProblems.length > 0 && (
            <>
              <p className={cn(MICRO, 'mb-2.5 mt-5')}>Today&apos;s problems</p>
              <div className="space-y-2">
                {CATEGORY_ORDER.map((cat) => (
                  // Same component Schedule renders, keyed by the bare category
                  // because only one day exists here.
                  <ProblemCategoryGroup
                    key={cat}
                    category={cat}
                    entries={todayProblems}
                    state={state}
                    open={openCats.has(cat)}
                    onToggleOpen={() => toggleCat(cat)}
                    onToggleCheck={onToggleCheck}
                  />
                ))}
              </div>
            </>
          )}

          <p className={cn(MICRO, 'mb-2.5 mt-5')}>Daily floor</p>
          <div className="flex flex-wrap gap-2">
            {FLOOR_PILLS.map(({ key, label, on, dot }) => {
              const active = floorOn(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onToggleFloor(todayKey, key)}
                  aria-pressed={active}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-all',
                    'max-sm:min-h-[44px] max-sm:px-3.5',
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
                </button>
              );
            })}
          </div>

          {/* trip day — the <label> is the only interactive surface, so a click
              cannot toggle the input and a handler on the box twice. */}
          <label className="mt-3 flex cursor-pointer select-none flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[var(--pt-text-2)] max-sm:min-h-[44px]">
            <input
              type="checkbox"
              checked={isTripDay}
              onChange={() => onToggleTrip(todayKey)}
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
        </div>

        {/* ── Right: DSA counter + log ── */}
        <div className="flex flex-col gap-5">
          <div>
            <p className={cn(MICRO, 'mb-2')}>Problems solved today</p>

            {/* tab switcher */}
            {/* recessed track (--pt-surface-2) with a raised selected pill on top */}
            <div className="mb-3 flex w-fit max-w-full flex-wrap gap-1 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-2)] p-0.5">
              {TABS.map((tab) => {
                const selected = dsaTab === tab.key;
                const count = tab.key === 'neetcode' ? state.counters.dsa : state.counters.dsaExtra;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDsaTab(tab.key)}
                    aria-pressed={selected}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all',
                      'max-sm:min-h-[40px]',
                      selected
                        ? cn('bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]', tab.text)
                        : 'bg-transparent text-[var(--pt-text-3)]',
                    )}
                  >
                    {tab.label}
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                        selected ? tab.chip : 'bg-transparent text-[var(--pt-text-3)]',
                      )}
                    >
                      {count}/{DSA_TARGET}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* counter input — one control, re-pointed by the active tab */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                value={dsaTab === 'neetcode' ? dsaInput : extraInput}
                onChange={(e) =>
                  dsaTab === 'neetcode' ? setDsaInput(e.target.value) : setExtraInput(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    if (dsaTab === 'neetcode') handleAddDsa();
                    else handleAddExtra();
                  }
                }}
                placeholder="0"
                aria-label={`Problems solved — ${activeTab.label}`}
                className={cn(
                  FIELD,
                  'w-16 font-mono tabular-nums max-sm:min-h-[44px]',
                  activeTab.focus,
                )}
              />
              <button
                type="button"
                onClick={dsaTab === 'neetcode' ? handleAddDsa : handleAddExtra}
                className={cn(
                  // Ink on a *solid* accent fill is --pt-bg — it flips per mode,
                  // where a literal `white` only worked against the light accents.
                  'rounded-md px-3.5 py-2 text-[13px] font-semibold text-[var(--pt-bg)] transition-opacity hover:opacity-85 max-sm:min-h-[44px]',
                  activeTab.button,
                )}
              >
                Add
              </button>
              <button
                type="button"
                onClick={dsaTab === 'neetcode' ? onUndoDsa : onUndoDsaExtra}
                className="rounded-md border border-[var(--pt-border)] bg-transparent px-3.5 py-2 text-[13px] font-semibold text-[var(--pt-text-2)] transition-colors hover:border-[var(--pt-text-3)] hover:text-[var(--pt-text)] max-sm:min-h-[44px]"
              >
                Undo
              </button>
              <span className="text-[11px] text-[var(--pt-text-3)]">
                <span className="font-mono tabular-nums">
                  {Math.max(0, DSA_TARGET - activeCount)}
                </span>{' '}
                {activeTab.left}
              </span>
            </div>
          </div>

          <div>
            <p className={cn(MICRO, 'mb-2')}>One-line log</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={logInput}
                onChange={(e) => setLogInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveLog();
                }}
                placeholder="problems done / phase progress / one thing learned"
                aria-label="One-line log"
                className={cn(
                  FIELD,
                  'min-w-0 flex-1 focus:[outline:2px_solid_var(--pt-violet)] max-sm:min-h-[44px]',
                )}
              />
              <button
                type="button"
                onClick={handleSaveLog}
                className="shrink-0 rounded-md bg-[var(--pt-violet)] px-3.5 py-2 text-[13px] font-semibold text-[var(--pt-bg)] transition-opacity hover:opacity-85 max-sm:min-h-[44px]"
              >
                Save
              </button>
            </div>
          </div>

          {/* rule card */}
          <div className="rounded-md border-l-2 border-l-[var(--pt-amber)] bg-[var(--pt-amber-bg)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--pt-text-2)]">
            <span className="font-semibold text-[var(--pt-amber)]">Never miss twice.</span> A zero
            day happens — jet lag, trip. Two in a row is the real danger.
          </div>

          {/* log history — newest first */}
          {logEntries.length > 0 && (
            <div className="overflow-hidden rounded-md border border-[var(--pt-border)]">
              <div
                className={cn(
                  MICRO,
                  'border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-3 py-2',
                )}
              >
                Log history
              </div>
              <div className="max-h-[130px] divide-y divide-[var(--pt-border)] overflow-y-auto">
                {logEntries.map(({ date, log }) => (
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
      </div>
    </section>
  );
}
