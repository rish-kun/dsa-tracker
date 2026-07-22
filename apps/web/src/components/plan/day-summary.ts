import { DAYS, checkId } from '@dsa-tracker/plan-data';
import { problemEntries } from './problem-group';
import type { PlanViewState } from './types';

/**
 * One day reduced to everything a navigator needs to draw a row: counts, state
 * flags and short labels. Extracted from what `schedule.tsx` used to compute
 * inline so the rail, the day strip, the shelf summary and the tab badges all
 * agree by construction rather than by three copies of the same arithmetic.
 */
export type DaySummary = {
  /** Local plan date key, 'YYYY-MM-DD'. */
  date: string;
  /** Full label from plan-data, e.g. 'Wed Jul 22 — total → 175 · Greedy + stack'. */
  label: string;
  /** Compact form for a narrow rail: 'Wed 22'. */
  shortLabel: string;
  /** The part of `label` after the em dash, for a pane subtitle. */
  topic: string;
  done: number;
  total: number;
  allDone: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  trip: boolean;
  hasLog: boolean;
  milestone: string;
  /** The user's own pinned note for this day, or '' — what the rail surfaces. */
  note: string;
  /** How many of the three daily floors are met. */
  floorDone: number;
  /** The DSA floor was satisfied by detected solves rather than a manual tick. */
  dsaFloorAuto: boolean;
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * 'Wed 22' from a 'YYYY-MM-DD' key. Parsed at UTC midnight and read back with
 * UTC getters, so the weekday is a property of the calendar date itself and
 * never shifts with the runtime's zone. This is a *display* string derived from
 * an already-local key — it is not, and must never become, a way to produce a
 * date key. Keys only ever come from `localDateKey`.
 */
export function shortDate(dateKey: string): string {
  const ms = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(ms)) return dateKey;
  const d = new Date(ms);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** The descriptive tail of a day label, after the em dash. */
function topicOf(label: string): string {
  const i = label.indexOf('—');
  return i === -1 ? label : label.slice(i + 1).trim();
}

/**
 * Every day in the plan, summarised against the current (optimistic) state.
 *
 * Ids come from `checkId.task` and `problemEntries` — never a template literal —
 * so a count here and a tick in a panel are the same row.
 */
export function daySummaries(state: PlanViewState): DaySummary[] {
  const { todayKey } = state;

  return DAYS.map((day) => {
    const problems = problemEntries(day.date, day.problems);
    const doneTasks = day.tasks.filter((_, j) => state.checks[checkId.task(day.date, j)]).length;
    const doneProblems = problems.filter(({ id }) => state.checks[id]).length;
    const done = doneTasks + doneProblems;
    const total = day.tasks.length + problems.length;

    const dayState = state.days[day.date];
    const floorDone =
      (dayState?.floorDsa ? 1 : 0) + (dayState?.floorCpp ? 1 : 0) + (dayState?.floorLog ? 1 : 0);

    return {
      date: day.date,
      label: day.label,
      shortLabel: shortDate(day.date),
      topic: topicOf(day.label),
      done,
      total,
      allDone: total > 0 && done === total,
      isToday: day.date === todayKey,
      isPast: day.date < todayKey,
      isFuture: day.date > todayKey,
      trip: !!dayState?.trip,
      hasLog: !!dayState?.log,
      milestone: day.milestone ?? '',
      note: dayState?.note ?? '',
      floorDone,
      dsaFloorAuto: !!state.floorDsaAuto[day.date],
    };
  });
}

/** Plan-wide totals, for the shelf summary line and the schedule tab badge. */
export function planTotals(summaries: DaySummary[], todayKey: string) {
  let done = 0;
  let total = 0;
  let dueDone = 0;
  let dueTotal = 0;

  for (const s of summaries) {
    done += s.done;
    total += s.total;
    // "Behind" only counts days that have already happened — a future day's
    // untouched problems are schedule, not debt.
    if (s.date <= todayKey) {
      dueDone += s.done;
      dueTotal += s.total;
    }
  }

  const todayIndex = summaries.findIndex((s) => s.date === todayKey);

  return {
    done,
    total,
    behind: Math.max(0, dueTotal - dueDone),
    /** 1-based position of today in the plan; 0 when today is outside it. */
    dayNumber: todayIndex + 1,
    dayCount: summaries.length,
    remaining: summaries.filter((s) => s.date >= todayKey).length,
  };
}
