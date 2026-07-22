'use client';

import { DAYS, PHASE_COUNT, RESUME_ITEMS, checkId } from '@dsa-tracker/plan-data';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { CppPhasesBody, TriageNote, cppPhasesDone } from './cpp-phases';
import {
  DayHeader,
  DayProblems,
  DayTasks,
  ExtraCounter,
  FloorControls,
  LogField,
  LogHistory,
  MICRO,
  dayEntry,
  hasProblems,
} from './day-parts';
import { daySummaries, planTotals } from './day-summary';
import { DsaMethodBody, NeverMissTwice } from './dsa-method';
import { PlanTabs, type PlanTabId } from './plan-tabs';
import { problemEntries } from './problem-group';
import { ResumeChecklistBody, resumeDone } from './resume-checklist';
import { ScheduleBody } from './schedule';
import { PlanStatusBar } from './status-bar';
import type { PlanLayoutProps } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Layout B — tabbed workspace.
 *
 * Four jobs on four different clocks never need to be co-visible. One slim
 * status bar stays put; the panes take turns. The tab badges are what keep the
 * hidden panes' headline numbers visible, so hiding a pane costs the detail and
 * not the signal.
 * ──────────────────────────────────────────────────────────────────────────── */

const PANEL =
  'overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]';

const PANEL_HEADER =
  'flex items-center justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3.5 sm:px-5';

type Props = PlanLayoutProps & {
  initialTab: PlanTabId;
  defaultTab: PlanTabId;
};

export function LayoutTabs(props: Props) {
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
    initialTab,
    defaultTab,
  } = props;

  const todayKey = state.todayKey;

  // Seed only. There must NEVER be an effect syncing this back from a prop:
  // the focus-triggered router.refresh() re-renders the server tree, and such an
  // effect would yank the user off whatever pane they were on every time they
  // alt-tabbed back into the window.
  const [tab, setTab] = useState<PlanTabId>(initialTab);

  const goToTab = (next: PlanTabId) => {
    setTab(next);
    // history.replaceState, never router.push: a router navigation on this
    // force-dynamic page would re-run four sequential queries against a max:1
    // postgres client for a purely visual pane switch.
    try {
      const url = next === defaultTab ? '/plan?view=b' : `/plan?view=b&tab=${next}`;
      window.history.replaceState(null, '', url);
    } catch {
      // Non-fatal: the tab still switches, the URL just won't reflect it.
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  };

  const summaries = useMemo(() => daySummaries(state), [state]);
  const totals = useMemo(() => planTotals(summaries, todayKey), [summaries, todayKey]);

  const today = dayEntry(todayKey);
  const todayDone = today
    ? today.tasks.filter((_, j) => state.checks[checkId.task(todayKey, j)]).length +
      problemEntries(todayKey, today.problems).filter(({ id }) => state.checks[id]).length
    : 0;
  const todayTotal = today ? today.tasks.length + (today.problems?.length ?? 0) : 0;

  const badges: Partial<Record<PlanTabId, string>> = {
    today: today ? `${todayDone}/${todayTotal}` : undefined,
    cpp: `${cppPhasesDone(state)}/${PHASE_COUNT}`,
    schedule: `${totals.remaining}d`,
    method: `${resumeDone(state)}/${RESUME_ITEMS.length}`,
  };

  const paneProps = (id: PlanTabId) => ({
    role: 'tabpanel' as const,
    id: `plan-pane-${id}`,
    'aria-labelledby': `plan-tab-${id}`,
    tabIndex: -1,
  });

  return (
    <>
      <PlanStatusBar state={state} cppDone={cppDone} daysLeft={daysLeft} />

      <PlanTabs tab={tab} onChange={goToTab} badges={badges} />

      {/* Today stays mounted and is hidden rather than unmounted — it owns
          accordion state, and the standard ARIA tabpanel pattern keeps it in the
          DOM. The other three unmount; Schedule at 26 days is the DOM weight
          worth shedding. */}
      <div {...paneProps('today')} hidden={tab !== 'today'}>
        <section className={PANEL}>
          <DayHeader state={state} dateKey={todayKey} todayKey={todayKey} />

          <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="space-y-5">
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

              {!today && (
                <div className="rounded-md border border-[var(--pt-border)] px-3.5 py-3">
                  <p className="text-[13px] text-[var(--pt-text-2)]">
                    No scheduled plan for {todayKey}. The plan runs{' '}
                    {DAYS[0]?.date ?? '—'} – {DAYS[DAYS.length - 1]?.date ?? '—'}.
                  </p>
                  <button
                    type="button"
                    onClick={() => goToTab('schedule')}
                    className="filter-chip mt-2.5"
                  >
                    Open schedule →
                  </button>
                </div>
              )}
            </div>

            {/* One dense cluster instead of three loose blocks. */}
            <div className="space-y-4">
              <p className={MICRO}>Close the day</p>

              <FloorControls
                state={state}
                dateKey={todayKey}
                todayKey={todayKey}
                onToggleFloor={onToggleFloor}
                onToggleTrip={onToggleTrip}
              />

              <div className="border-t border-[var(--pt-border)] pt-4">
                <LogField
                  dateKey={todayKey}
                  todayKey={todayKey}
                  value={logInput}
                  onChange={setLogInput}
                  onSave={onSaveLog}
                />
              </div>

              <ExtraCounter
                state={state}
                value={extraInput}
                onChange={setExtraInput}
                onAdd={onAddDsaExtra}
                onUndo={onUndoDsaExtra}
                compact
              />

              <LogHistory state={state} />
            </div>
          </div>
        </section>
      </div>

      {tab === 'cpp' && (
        <div {...paneProps('cpp')}>
          <section className={PANEL}>
            <div className={PANEL_HEADER}>
              <h2 className="min-w-0 text-[14px] font-semibold text-[var(--pt-text)]">
                C++ Semantic Cache
              </h2>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--pt-text-3)]">
                {cppPhasesDone(state)}/{PHASE_COUNT} complete
              </span>
            </div>
            <div className="h-[3px] bg-[var(--pt-border)]">
              <div
                className="h-full bg-[var(--pt-green)] transition-all duration-700"
                style={{ width: `${(cppPhasesDone(state) / PHASE_COUNT) * 100}%` }}
              />
            </div>

            <CppPhasesBody state={state} onToggleCheck={onToggleCheck} collapsibleTriage />
          </section>
        </div>
      )}

      {tab === 'schedule' && (
        <div {...paneProps('schedule')}>
          <section className={PANEL}>
            <div className={PANEL_HEADER}>
              <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">
                Day-by-day schedule
              </h2>
              <span className="text-right text-[12px] text-[var(--pt-text-3)]">
                tap a day to expand
              </span>
            </div>
            <ScheduleBody
              state={state}
              todayKey={todayKey}
              onToggleCheck={onToggleCheck}
              filterable
            />
          </section>
        </div>
      )}

      {tab === 'method' && (
        <div {...paneProps('method')} className="space-y-5">
          <section className={PANEL}>
            <div className={PANEL_HEADER}>
              <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">
                DSA method &amp; order
              </h2>
            </div>
            <DsaMethodBody />
          </section>

          <section className={PANEL}>
            <div className={PANEL_HEADER}>
              <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">Rules</h2>
            </div>
            <div className="space-y-2.5 p-4">
              <NeverMissTwice />
              <TriageNote />
            </div>
          </section>

          <section className={PANEL}>
            <div className={PANEL_HEADER}>
              <h2 className="min-w-0 text-[14px] font-semibold text-[var(--pt-text)]">
                Resume checklist
              </h2>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--pt-text-3)]">
                {resumeDone(state)}/{RESUME_ITEMS.length}
              </span>
            </div>
            <ResumeChecklistBody state={state} onToggleCheck={onToggleCheck} />
          </section>
        </div>
      )}
    </>
  );
}
