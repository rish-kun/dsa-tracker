import { DAYS } from '@dsa-tracker/plan-data';

/**
 * What the cockpit's right pane is showing. A day, or one of the four reference
 * views the rail's pinned footer switches to.
 */
export type PlanSelection =
  | { kind: 'day'; date: string }
  | { kind: 'cpp' | 'method' | 'resume' | 'schedule' };

const REF_KINDS = ['cpp', 'method', 'resume', 'schedule'] as const;
type RefKind = (typeof REF_KINDS)[number];

function isRefKind(v: string): v is RefKind {
  return (REF_KINDS as readonly string[]).includes(v);
}

/** URL form: a date key, or a bare reference kind. */
export function serializeSelection(sel: PlanSelection): string {
  return sel.kind === 'day' ? sel.date : sel.kind;
}

/**
 * Resolve a raw `?d=` value. An unknown value, or a date outside the plan,
 * falls back to today — and to the last scheduled day when today is outside the
 * plan window entirely (after the plan ends, there is no "today" row to show).
 */
export function parseSelection(raw: string | undefined, todayKey: string): PlanSelection {
  if (raw && isRefKind(raw)) return { kind: raw };
  if (raw && DAYS.some((d) => d.date === raw)) return { kind: 'day', date: raw };
  return { kind: 'day', date: defaultDate(todayKey) };
}

/** Today when the plan covers it, otherwise the closest scheduled day. */
export function defaultDate(todayKey: string): string {
  if (DAYS.some((d) => d.date === todayKey)) return todayKey;
  const upcoming = DAYS.find((d) => d.date > todayKey);
  if (upcoming) return upcoming.date;
  return DAYS[DAYS.length - 1]?.date ?? todayKey;
}

/** Step a day selection by ±1 within the plan, clamped at both ends. */
export function stepDate(date: string, delta: -1 | 1): string {
  const i = DAYS.findIndex((d) => d.date === date);
  if (i === -1) return date;
  const next = Math.min(DAYS.length - 1, Math.max(0, i + delta));
  return DAYS[next].date;
}
