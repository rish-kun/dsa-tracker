'use client';

import { DAYS, PHASE_COUNT, RESUME_ITEMS } from '@dsa-tracker/plan-data';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { CppPhasesBody, cppPhasesDone, nextCppPhase } from './cpp-phases';
import {
  DayHeader,
  DayProblems,
  DayTasks,
  ExtraCounter,
  FloorControls,
  LogField,
  LogHistory,
  MICRO,
  hasProblems,
  missedYesterday,
} from './day-parts';
import { daySummaries, planTotals } from './day-summary';
import { DsaMethodBody, NeverMissTwice } from './dsa-method';
import { PaceStrip } from './pace-strip';
import { ResumeChecklistBody, resumeDone } from './resume-checklist';
import { ScheduleBody } from './schedule';
import { Shelf, type ShelfKey, type ShelfRowSpec } from './shelf';
import type { PlanLayoutProps } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Layout A — dense single-column stack.
 *
 * One scrolling column, but fidelity proportional to how often a region is
 * read. Today is the only thing expanded on load; everything else is a
 * disclosure row carrying its own summary. ~1.4 viewports desktop when shut,
 * against ~4.5 for the layout this replaces.
 * ──────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'pt_plan_shelf';
const SHELF_KEYS: ShelfKey[] = ['cpp', 'schedule', 'resume', 'rules'];

/** Whole days between two 'YYYY-MM-DD' keys, read at UTC midnight. */
function spanDays(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

export function LayoutStack(props: PlanLayoutProps) {
  const {
    state,
    daysLeft,
    cppDone,
    onToggleCheck,
    onToggleFloor,
    onToggleTrip,
    onSaveLog,
    onAddDsaExtra,
    onUndoDsaExtra,
    logInput,
    setLogInput,
    extraInput,
    setExtraInput,
  } = props;

  const todayKey = state.todayKey;

  // Everything shut on first paint. Restoring from localStorage happens in an
  // effect, never during render — /plan is server-rendered and reading storage
  // in the render body is a hydration mismatch. Same shape src/lib/theme.tsx
  // uses to read the already-resolved theme back.
  const [open, setOpen] = useState<Set<ShelfKey>>(() => new Set());
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((k): k is ShelfKey =>
            (SHELF_KEYS as string[]).includes(k as string),
          );
          if (valid.length > 0) setOpen(new Set(valid));
        }
      }
    } catch {
      // A corrupt or unavailable store just means "start closed".
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...open]));
    } catch {
      // Private mode / quota — the shelf still works, it just won't persist.
    }
  }, [open, restored]);

  const toggle = (key: ShelfKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const summaries = useMemo(() => daySummaries(state), [state]);
  const totals = useMemo(() => planTotals(summaries, todayKey), [summaries, todayKey]);

  const nextPhase = nextCppPhase(state);
  const phasesDone = cppPhasesDone(state);
  const resDone = resumeDone(state);
  const resOpen = RESUME_ITEMS.length - resDone;

  const planDays = DAYS.length > 0 ? spanDays(DAYS[0].date, DAYS[DAYS.length - 1].date) + 1 : 0;
  const elapsedDenominator = planDays > 0 ? planDays : daysLeft;

  const rows: ShelfRowSpec[] = [
    {
      key: 'cpp',
      title: 'C++ Semantic Cache',
      summary: nextPhase ? (
        <>
          next: {nextPhase.name} · {nextPhase.dates}
        </>
      ) : (
        <span className="text-[var(--pt-green)]">all phases shipped</span>
      ),
      count: `${phasesDone}/${PHASE_COUNT}`,
      meter: { fraction: phasesDone / PHASE_COUNT, tone: 'green' },
      body: <CppPhasesBody state={state} onToggleCheck={onToggleCheck} collapsibleTriage />,
    },
    {
      key: 'schedule',
      title: 'Day-by-day schedule',
      summary:
        totals.dayNumber > 0 ? (
          <>
            day {totals.dayNumber} of {totals.dayCount} ·{' '}
            {totals.behind > 0 ? (
              <span className="text-[var(--pt-amber)]">{totals.behind} items behind</span>
            ) : (
              <span className="text-[var(--pt-green)]">on track</span>
            )}
          </>
        ) : (
          'plan window closed'
        ),
      count: `${totals.done}/${totals.total}`,
      meter: { fraction: totals.total > 0 ? totals.done / totals.total : 0, tone: 'blue' },
      body: (
        <ScheduleBody
          state={state}
          todayKey={todayKey}
          onToggleCheck={onToggleCheck}
          collapsibleWeeks
          openToday={false}
        />
      ),
    },
    {
      key: 'resume',
      title: 'Resume checklist',
      summary:
        resOpen > 0 ? (
          `${resOpen} ${resOpen === 1 ? 'item' : 'items'} open`
        ) : (
          <span className="text-[var(--pt-green)]">all clear</span>
        ),
      count: `${resDone}/${RESUME_ITEMS.length}`,
      meter: { fraction: resDone / RESUME_ITEMS.length, tone: 'amber' },
      body: <ResumeChecklistBody state={state} onToggleCheck={onToggleCheck} />,
    },
    {
      key: 'rules',
      title: 'Rules & reference',
      summary: 'two-phase plan · three slots · the loop · must-own patterns · never miss twice',
      body: <DsaMethodBody withRules />,
    },
  ];

  const showZeroDayWarning = missedYesterday(state);

  return (
    <>
      <PaceStrip
        state={state}
        cppDone={cppDone}
        daysLeft={daysLeft}
        planDays={elapsedDenominator}
      />

      {/* ── today ── */}
      <section className="mb-5 overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
        <DayHeader state={state} dateKey={todayKey} todayKey={todayKey} />

        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <p className={cn(MICRO, 'mb-2')}>Today&apos;s plan</p>
            <DayTasks state={state} dateKey={todayKey} onToggleCheck={onToggleCheck} />
          </div>

          {hasProblems(todayKey) && (
            <div>
              <p className={cn(MICRO, 'mb-2.5')}>Today&apos;s problems</p>
              <DayProblems
                key={todayKey}
                state={state}
                dateKey={todayKey}
                onToggleCheck={onToggleCheck}
              />
            </div>
          )}

          {/* The rule appears only on the day it is actually information. The
              permanent copy lives in the Rules & reference row. */}
          {showZeroDayWarning && <NeverMissTwice urgent />}

          {/* action bar — floors, trip, log and the extra counter on one surface */}
          <div className="space-y-3 rounded-md border border-[var(--pt-border)] p-3">
            <FloorControls
              state={state}
              dateKey={todayKey}
              todayKey={todayKey}
              onToggleFloor={onToggleFloor}
              onToggleTrip={onToggleTrip}
              tripAsChip
            />

            <div className="flex flex-wrap items-center gap-2">
              <LogField
                dateKey={todayKey}
                todayKey={todayKey}
                value={logInput}
                onChange={setLogInput}
                onSave={onSaveLog}
                className="min-w-0 grow basis-[240px]"
              />
              <span className="hidden h-6 w-px bg-[var(--pt-border)] sm:block" aria-hidden="true" />
              <ExtraCounter
                state={state}
                value={extraInput}
                onChange={setExtraInput}
                onAdd={onAddDsaExtra}
                onUndo={onUndoDsaExtra}
                compact
              />
            </div>
          </div>

          <LogHistory state={state} />
        </div>
      </section>

      <Shelf rows={rows} open={open} onToggle={toggle} onCollapseAll={() => setOpen(new Set())} />
    </>
  );
}
