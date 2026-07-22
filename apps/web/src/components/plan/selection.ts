import { DAYS } from '@dsa-tracker/plan-data';

/*
 * The cockpit's rail selects a day and nothing else.
 *
 * It briefly also selected between four "reference views" that took over the
 * right pane; those now render expanded in the main column below the day panel,
 * and the rail links to them by anchor. So a selection is just a date key.
 */

/** Resolve a raw `?d=` value, falling back to today when it names no plan day. */
export function parseSelectedDate(raw: string | undefined, todayKey: string): string {
  if (raw && DAYS.some((d) => d.date === raw)) return raw;
  return defaultDate(todayKey);
}

/**
 * Today when the plan covers it, otherwise the closest scheduled day — after the
 * plan ends there is no "today" row to show, and a blank pane reads as broken.
 */
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

/** Step by a whole week, clamped — PageUp/PageDown in the rail. */
export function stepWeek(date: string, delta: -1 | 1): string {
  const i = DAYS.findIndex((d) => d.date === date);
  if (i === -1) return date;
  const next = Math.min(DAYS.length - 1, Math.max(0, i + delta * 7));
  return DAYS[next].date;
}
