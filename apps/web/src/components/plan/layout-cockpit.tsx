'use client';

import { PHASE_COUNT, RESUME_ITEMS } from '@dsa-tracker/plan-data';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { CppPhasesBody, cppPhasesDone } from './cpp-phases';
import {
  DayHeader,
  DayNote,
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
import { defaultDate, parseSelectedDate, stepDate } from './selection';
import type { PlanLayoutProps } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * The cockpit.
 *
 * A sticky rail holds the vitals and every day of the plan; the main column
 * holds the selected day, then the project and reference material expanded
 * below it. The 26-day schedule is navigation, not a section — which is what
 * makes "look ahead at Jul 24" one click instead of 3000px of scrolling.
 * ──────────────────────────────────────────────────────────────────────────── */

const PANEL =
  'overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]';

const PANEL_HEADER =
  'flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3.5 sm:px-5';

/** `scroll-mt` clears the sticky NavBar when a rail jump-link lands. */
const SECTION = 'scroll-mt-[88px]';

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
    onSaveNote,
    onAddDsaExtra,
    onUndoDsaExtra,
    logInput,
    setLogInput,
    extraInput,
    setExtraInput,
    initialSelected,
  } = props;

  const todayKey = state.todayKey;

  const [selected, setSelected] = useState<string>(() =>
    parseSelectedDate(initialSelected, todayKey),
  );
  // Once the user picks a day deliberately, day rollover stops moving them.
  const touched = useRef(false);

  const select = (date: string) => {
    touched.current = true;
    setSelected(date);
  };

  // Mirror to the URL write-only, outside Next's router. replaceState, not
  // pushState: 26 history entries would trap the back button on a page that has
  // one URL, and a router navigation would re-run four sequential DB reads.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('d', selected);
      window.history.replaceState(null, '', url);
    } catch {
      // Non-fatal — selection still works, the URL just won't reflect it.
    }
  }, [selected]);

  // A tab left open overnight re-pins to the new today; a tab deliberately
  // parked on another day does not get yanked away.
  useEffect(() => {
    if (!touched.current) setSelected(defaultDate(todayKey));
  }, [todayKey]);

  const summaries = useMemo(() => daySummaries(state), [state]);
  const phasesDone = cppPhasesDone(state);
  const resDone = resumeDone(state);

  const isToday = selected === todayKey;

  return (
    <>
      {/* sub-lg: vitals, then the horizontal strip, then the column */}
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

      <DayStrip summaries={summaries} selectedDate={selected} onSelect={select} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[296px_minmax(0,1fr)] xl:gap-6">
        {/* Rail — lg and up only. The whole column is the sticky, viewport-tall
            box (72px NavBar + 16px breathing room above, 20px below); vitals
            and the pinned reference links take their natural height and the day
            list absorbs the rest, so the links are always reachable. */}
        <div className="hidden flex-col gap-4 lg:flex lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-108px)]">
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
            selectedDate={selected}
            onSelect={select}
            cppDone={phasesDone}
            resDone={resDone}
          />
        </div>

        {/* main column: the selected day, then everything else expanded below */}
        <div className="min-w-0 space-y-5">
          <section id="plan-pane" className={PANEL}>
            <DayHeader
              state={state}
              dateKey={selected}
              todayKey={todayKey}
              onStep={(delta) => select(stepDate(selected, delta))}
              onGoToToday={() => select(defaultDate(todayKey))}
            />

            <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
              <div className="space-y-5">
                <div>
                  <p className={cn(MICRO, 'mb-2')}>{isToday ? "Today's plan" : 'Plan'}</p>
                  <DayTasks state={state} dateKey={selected} onToggleCheck={onToggleCheck} />
                </div>

                {hasProblems(selected) && (
                  <div>
                    <p className={cn(MICRO, 'mb-2.5')}>Problems</p>
                    {/* keyed by date so the accordion resets per day */}
                    <DayProblems
                      key={selected}
                      state={state}
                      dateKey={selected}
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
                    dateKey={selected}
                    todayKey={todayKey}
                    onToggleFloor={onToggleFloor}
                    onToggleTrip={onToggleTrip}
                  />
                </div>

                <div className="border-t border-[var(--pt-border)] pt-4">
                  <p className={cn(MICRO, 'mb-2')}>Note</p>
                  {/* keyed by date: a draft must never follow you to another day */}
                  <DayNote
                    key={selected}
                    state={state}
                    dateKey={selected}
                    onSaveNote={onSaveNote}
                  />
                </div>

                <div className="border-t border-[var(--pt-border)] pt-4">
                  <p className={cn(MICRO, 'mb-2')}>One-line log</p>
                  <LogField
                    dateKey={selected}
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

          {/* ── project & reference, expanded ── */}

          <section id="plan-cpp" className={cn(PANEL, SECTION)}>
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
            <CppPhasesBody state={state} onToggleCheck={onToggleCheck} collapsibleTriage />
          </section>

          <section id="plan-schedule" className={cn(PANEL, SECTION)}>
            <div className={PANEL_HEADER}>
              <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">
                Day-by-day schedule
              </h2>
              <span className="text-right text-[12px] text-[var(--pt-text-3)]">
                tap a day to expand
              </span>
            </div>
            {/* Today already has the panel above it, so this opens nothing by
                default and folds each week — the rail is the fast path here. */}
            <ScheduleBody
              state={state}
              todayKey={todayKey}
              onToggleCheck={onToggleCheck}
              collapsibleWeeks
              openToday={false}
            />
          </section>

          <section id="plan-method" className={cn(PANEL, SECTION)}>
            <div className={PANEL_HEADER}>
              <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">
                DSA method &amp; order
              </h2>
            </div>
            <DsaMethodBody withRules />
          </section>

          <section id="plan-resume" className={cn(PANEL, SECTION)}>
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
        </div>
      </div>
    </>
  );
}
