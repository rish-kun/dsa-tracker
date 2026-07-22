'use client';

import { PHASES, checkId } from '@dsa-tracker/plan-data';
import { useRouter } from 'next/navigation';
import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import {
  addDsaExtraAction,
  saveLogAction,
  setCheckAction,
  setFloorAction,
  setTripAction,
  undoDsaExtraAction,
} from '../../../app/plan/actions';
import type { PlanDayState } from '@/lib/plan-state';
import { CppPhases } from './cpp-phases';
import { DsaMethod } from './dsa-method';
import { ResumeChecklist } from './resume-checklist';
import { Schedule } from './schedule';
import { StatRings } from './stat-rings';
import { TodayHero } from './today-hero';
import type { PlanViewState } from './types';

/** Mirrors MAX_DSA in lib/plan-state.ts for the manual extra counter. */
const MAX_DSA = 150;

type FloorKey = 'dsa' | 'cpp' | 'log';

/** A day with no persisted row yet — every flag off, no log. */
const EMPTY_DAY: PlanDayState = {
  log: null,
  floorDsa: false,
  floorCpp: false,
  floorLog: false,
  trip: false,
};

type OptimisticAction =
  | { kind: 'check'; id: string; val: boolean }
  | { kind: 'floor'; date: string; which: FloorKey; value: boolean }
  | { kind: 'trip'; date: string; value: boolean }
  | { kind: 'log'; date: string; text: string }
  | { kind: 'addExtra'; n: number }
  | { kind: 'undoExtra' };

/**
 * Switch rather than a computed key so the result stays a real PlanDayState —
 * `{ ...day, [which]: value }` on a union key widens the type.
 */
function withFloor(day: PlanDayState, which: FloorKey, value: boolean): PlanDayState {
  switch (which) {
    case 'dsa':
      return { ...day, floorDsa: value };
    case 'cpp':
      return { ...day, floorCpp: value };
    case 'log':
      return { ...day, floorLog: value };
  }
}

function patchDay(
  state: PlanViewState,
  date: string,
  patch: (day: PlanDayState) => PlanDayState,
): PlanViewState {
  const day = state.days[date] ?? EMPTY_DAY;
  return { ...state, days: { ...state.days, [date]: patch(day) } };
}

/**
 * One reducer over the whole view state. Each case reproduces what the matching
 * Server Action will persist, so the UI lands on the same value the next
 * revalidation delivers. Anything the server derives from a query it alone can
 * run (the extras floor) is deliberately left to reconciliation rather than
 * guessed at and flashed.
 */
function planReducer(state: PlanViewState, action: OptimisticAction): PlanViewState {
  switch (action.kind) {
    case 'check':
      // A click is a manual override, so it lands in both maps: `manual` keeps
      // the precedence the server will re-derive, `checks` is what renders.
      return {
        ...state,
        checks: { ...state.checks, [action.id]: action.val },
        manual: { ...state.manual, [action.id]: action.val },
      };

    case 'floor':
      return patchDay(state, action.date, (day) =>
        withFloor(
          day,
          action.which,
          action.which === 'dsa' && state.floorDsaAuto[action.date] ? true : action.value,
        ),
      );

    case 'trip':
      return patchDay(state, action.date, (day) => ({ ...day, trip: action.value }));

    case 'log':
      // saveLog also claims the log floor whenever the text is non-empty.
      return patchDay(state, action.date, (day) => ({
        ...day,
        log: action.text,
        floorLog: true,
      }));

    case 'addExtra': {
      const c = state.counters;
      return {
        ...state,
        counters: {
          ...c,
          dsaExtra: Math.min(MAX_DSA, c.dsaExtra + action.n),
          dsaExtraHist: [...c.dsaExtraHist, action.n],
        },
      };
    }

    case 'undoExtra': {
      const c = state.counters;
      // Pop the last increment and subtract it — the counter floors at 0
      // because history keeps the un-clamped value.
      const last = c.dsaExtraHist.at(-1) ?? 0;
      return {
        ...state,
        counters: {
          ...c,
          dsaExtra: Math.max(0, c.dsaExtra - last),
          dsaExtraHist: c.dsaExtraHist.slice(0, -1),
        },
      };
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Could not save that change.';
}

type Props = {
  state: PlanViewState;
  daysLeft: number;
  cppDone: number;
};

/**
 * The whole interactive /plan tree. Every mutation is applied optimistically
 * and then sent to its Server Action; the actions revalidate '/plan', so the
 * server value replaces the optimistic one on the next render. A rejected
 * action rolls its optimistic entry back automatically — all this has to do is
 * catch it so it never surfaces as an unhandled rejection.
 */
export function PlanClient({ state, daysLeft, cppDone }: Props) {
  const router = useRouter();
  const [optimistic, applyOptimistic] = useOptimistic(state, planReducer);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const refreshQueued = useRef(false);
  const lastRefreshAt = useRef(0);

  // Extension writes happen outside this React tree. Revalidate when the user
  // returns to the plan tab so newly detected solves appear without polling.
  // A short dedupe window plus a queued microtask coalesces the focus +
  // visibilitychange pair browsers commonly emit together into one refresh.
  useEffect(() => {
    const refreshWhenVisible = () => {
      const now = Date.now();
      if (
        document.visibilityState !== 'visible' ||
        refreshQueued.current ||
        now - lastRefreshAt.current < 250
      ) {
        return;
      }
      refreshQueued.current = true;
      lastRefreshAt.current = now;
      queueMicrotask(() => {
        router.refresh();
        refreshQueued.current = false;
      });
    };

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [router]);

  const run = (action: OptimisticAction, send: () => Promise<void>) => {
    startTransition(async () => {
      applyOptimistic(action);
      try {
        await send();
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  };

  const todayKey = optimistic.todayKey;

  // The server-computed count is authoritative; while a write is in flight the
  // same formula is re-run over the optimistic checks so the ring tracks a
  // phase click instead of lagging a whole round trip behind CppPhases.
  const cppDoneNow = isPending
    ? PHASES.filter((phase) => optimistic.checks[checkId.phase(phase)]).length
    : cppDone;

  const onToggleCheck = (id: string, val: boolean) =>
    run({ kind: 'check', id, val }, () => setCheckAction(id, val));

  // Floors and the trip flag arrive as toggles carrying no value — invert
  // against the current (optimistic) day so repeated clicks alternate.
  const onToggleFloor = (date: string, which: FloorKey) => {
    const day = optimistic.days[date] ?? EMPTY_DAY;
    const current = which === 'dsa' ? day.floorDsa : which === 'cpp' ? day.floorCpp : day.floorLog;
    const value = !current;
    run({ kind: 'floor', date, which, value }, () => setFloorAction(date, which, value));
  };

  const onToggleTrip = (date: string) => {
    const value = !(optimistic.days[date] ?? EMPTY_DAY).trip;
    run({ kind: 'trip', date, value }, () => setTripAction(date, value));
  };

  // TodayHero trims and drops empties before calling this.
  const onSaveLog = (text: string) =>
    run({ kind: 'log', date: todayKey, text }, () => saveLogAction(todayKey, text));

  const onAddDsaExtra = (n: number) =>
    run({ kind: 'addExtra', n }, () => addDsaExtraAction(n));
  const onUndoDsaExtra = () => run({ kind: 'undoExtra' }, () => undoDsaExtraAction());

  return (
    <div aria-busy={isPending}>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-md border-l-2 border-l-[var(--pt-rose)] bg-[var(--pt-rose-bg)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--pt-text-2)]"
        >
          <span className="flex-1">
            <span className="font-semibold text-[var(--pt-rose)]">Change not saved.</span> {error}
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="micro-label shrink-0 rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--pt-rose-bg)]"
          >
            Dismiss
          </button>
        </div>
      )}

      <StatRings
        dsaCount={optimistic.neetcode150Solved}
        dsaExtra={optimistic.counters.dsaExtra}
        cppDone={cppDoneNow}
        streak={optimistic.streak}
        daysLeft={daysLeft}
      />

      <TodayHero
        state={optimistic}
        todayKey={todayKey}
        onToggleCheck={onToggleCheck}
        onToggleFloor={onToggleFloor}
        onToggleTrip={onToggleTrip}
        onAddDsaExtra={onAddDsaExtra}
        onUndoDsaExtra={onUndoDsaExtra}
        onSaveLog={onSaveLog}
      />

      <CppPhases state={optimistic} onToggleCheck={onToggleCheck} />

      <DsaMethod />

      <Schedule state={optimistic} todayKey={todayKey} onToggleCheck={onToggleCheck} />

      <ResumeChecklist state={optimistic} onToggleCheck={onToggleCheck} />
    </div>
  );
}
