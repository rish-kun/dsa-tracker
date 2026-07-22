'use client';

import { PHASE_COUNT, RESUME_ITEMS } from '@dsa-tracker/plan-data';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CppPhasesBody, cppPhasesDone } from './cpp-phases';
import {
  DayHeader,
  DayProblems,
  DayTasks,
  FloorControls,
  LogField,
  LogHistory,
  MICRO,
  hasProblems,
} from './day-parts';
import { DayStrip } from './day-strip';
import { daySummaries } from './day-summary';
import { DsaMethodBody } from './dsa-method';
import { PlanRail } from './plan-rail';
import { RailVitals } from './rail-vitals';
import { ResumeChecklistBody, resumeDone } from './resume-checklist';
import { ScheduleBody } from './schedule';
import { defaultDate, parseSelection, serializeSelection, stepDate, type PlanSelection } from './selection';
import type { PlanLayoutProps } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Layout C — two-column cockpit.
 *
 * The 26-day schedule becomes navigation rather than a section. A sticky rail
 * holds the vitals and every day; the right pane shows exactly one thing.
 * ──────────────────────────────────────────────────────────────────────────── */

const PANEL =
  'overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]';

const PANEL_HEADER =
  'flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3.5 sm:px-5';

type Props = PlanLayoutProps & { initialSelected?: string };

export function LayoutCockpit(props: Props) {
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
    initialSelected,
  } = props;

  const todayKey = state.todayKey;

  const [selection, setSelection] = useState<PlanSelection>(() =>
    parseSelection(initialSelected, todayKey),
  );
  // Once the user picks a day deliberately, day rollover stops moving them.
  const touched = useRef(false);

  const select = (sel: PlanSelection) => {
    touched.current = true;
    setSelection(sel);
  };

  // Mirror to the URL write-only, outside Next's router. replaceState, not
  // pushState: 26 history entries would trap the back button on a page that has
  // one URL, and a router navigation would re-run four sequential DB reads.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'c');
      url.searchParams.set('d', serializeSelection(selection));
      window.history.replaceState(null, '', url);
    } catch {
      // Non-fatal — selection still works, the URL just won't reflect it.
    }
  }, [selection]);

  // A tab left open overnight re-pins to the new today; a tab deliberately
  // parked on another day does not get yanked away.
  useEffect(() => {
    if (!touched.current) setSelection({ kind: 'day', date: defaultDate(todayKey) });
  }, [todayKey]);

  const summaries = useMemo(() => daySummaries(state), [state]);
  const phasesDone = cppPhasesDone(state);
  const resDone = resumeDone(state);

  const onStep = (delta: -1 | 1) => {
    if (selection.kind !== 'day') return;
    select({ kind: 'day', date: stepDate(selection.date, delta) });
  };

  return (
    <>
      {/* sub-lg: vitals, then the horizontal strip, then the pane */}
      <div className="mb-4 lg:hidden">
        <RailVitals
          state={state}
          cppDone={cppDone}
          daysLeft={daysLeft}
          extraInput={extraInput}
          setExtraInput={setExtraInput}
          onAddDsaExtra={onAddDsaExtra}
          onUndoDsaExtra={onUndoDsaExtra}
          wide
        />
      </div>

      <DayStrip summaries={summaries} selection={selection} onSelect={select} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[296px_minmax(0,1fr)] xl:gap-6">
        {/* rail — lg and up only */}
        <div className="hidden flex-col gap-4 lg:flex">
          <RailVitals
            state={state}
            cppDone={cppDone}
            daysLeft={daysLeft}
            extraInput={extraInput}
            setExtraInput={setExtraInput}
            onAddDsaExtra={onAddDsaExtra}
            onUndoDsaExtra={onUndoDsaExtra}
          />
          <PlanRail
            summaries={summaries}
            selection={selection}
            onSelect={select}
            cppDone={phasesDone}
            resDone={resDone}
          />
        </div>

        {/* pane */}
        <div id="plan-pane" role="tabpanel" tabIndex={-1} className="min-w-0">
          {selection.kind === 'day' && (
            <section className={PANEL}>
              <DayHeader
                state={state}
                dateKey={selection.date}
                todayKey={todayKey}
                onStep={onStep}
                onGoToToday={() => select({ kind: 'day', date: defaultDate(todayKey) })}
              />

              <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
                <div className="space-y-5">
                  <div>
                    <p className={cn(MICRO, 'mb-2')}>
                      {selection.date === todayKey ? "Today's plan" : 'Plan'}
                    </p>
                    <DayTasks
                      state={state}
                      dateKey={selection.date}
                      onToggleCheck={onToggleCheck}
                    />
                  </div>

                  {hasProblems(selection.date) && (
                    <div>
                      <p className={cn(MICRO, 'mb-2.5')}>Problems</p>
                      {/* keyed by date so the accordion resets per day */}
                      <DayProblems
                        key={selection.date}
                        state={state}
                        dateKey={selection.date}
                        onToggleCheck={onToggleCheck}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <p className={cn(MICRO, 'mb-2.5')}>Daily floor</p>
                    <FloorControls
                      state={state}
                      dateKey={selection.date}
                      todayKey={todayKey}
                      onToggleFloor={onToggleFloor}
                      onToggleTrip={onToggleTrip}
                    />
                  </div>

                  <div className="border-t border-[var(--pt-border)] pt-4">
                    <p className={cn(MICRO, 'mb-2')}>One-line log</p>
                    <LogField
                      dateKey={selection.date}
                      todayKey={todayKey}
                      value={logInput}
                      onChange={setLogInput}
                      onSave={onSaveLog}
                    />
                  </div>

                  <LogHistory state={state} />
                </div>
              </div>
            </section>
          )}

          {selection.kind === 'cpp' && (
            <section className={PANEL}>
              <div className={PANEL_HEADER}>
                <h2 className="min-w-0 text-[14px] font-semibold text-[var(--pt-text)]">
                  C++ Semantic Cache
                </h2>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--pt-text-3)]">
                  {phasesDone}/{PHASE_COUNT} complete
                </span>
              </div>
              <div className="h-[3px] bg-[var(--pt-border)]">
                <div
                  className="h-full bg-[var(--pt-green)] transition-all duration-700"
                  style={{ width: `${(phasesDone / PHASE_COUNT) * 100}%` }}
                />
              </div>
              <CppPhasesBody state={state} onToggleCheck={onToggleCheck} />
            </section>
          )}

          {selection.kind === 'schedule' && (
            <section className={PANEL}>
              <div className={PANEL_HEADER}>
                <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">
                  Day-by-day schedule
                </h2>
                <span className="text-right text-[12px] text-[var(--pt-text-3)]">
                  tap a day to expand
                </span>
              </div>
              <ScheduleBody state={state} todayKey={todayKey} onToggleCheck={onToggleCheck} />
            </section>
          )}

          {selection.kind === 'method' && (
            <section className={PANEL}>
              <div className={PANEL_HEADER}>
                <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">
                  DSA method &amp; order
                </h2>
              </div>
              <DsaMethodBody withRules />
            </section>
          )}

          {selection.kind === 'resume' && (
            <section className={PANEL}>
              <div className={PANEL_HEADER}>
                <h2 className="min-w-0 text-[14px] font-semibold text-[var(--pt-text)]">
                  Resume checklist
                </h2>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--pt-text-3)]">
                  {resDone}/{RESUME_ITEMS.length}
                </span>
              </div>
              <ResumeChecklistBody state={state} onToggleCheck={onToggleCheck} />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
