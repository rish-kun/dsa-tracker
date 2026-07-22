import type { PlanCounters, PlanDayState } from '@/lib/plan-state';

/**
 * Everything the /plan client tree renders from. Assembled on the server by the
 * page (persisted `plan_*` rows + the derived auto-tick pass over
 * `solved_problems`) and handed down as a single prop.
 *
 * `checks` is the RESOLVED value — `manual[id] ?? autoSolved[id]` — so a
 * component never re-derives it. `manual` and `autoSolved` exist only so the UI
 * can explain *why* something is ticked.
 */
export type PlanViewState = {
  /** Resolved: manual override ?? derived from solves. */
  checks: Record<string, boolean>;
  /** Explicit user overrides only — absence means "derive it". */
  manual: Record<string, boolean>;
  /** checkId -> true when the tick came from a real detected solve. */
  autoSolved: Record<string, boolean>;
  /** Unique solved keys that belong to the canonical NeetCode 150 set. */
  neetcode150Solved: number;
  /** Local plan date -> distinct live solves detected on that date. */
  solvedPerDay: Record<string, number>;
  /** Date -> true when its DSA floor is satisfied by live solve activity. */
  floorDsaAuto: Record<string, boolean>;
  days: Record<string, PlanDayState>;
  counters: PlanCounters;
  streak: number;
  /** Local date 'YYYY-MM-DD' (never toISOString()). */
  todayKey: string;
};

/**
 * Everything the layout shell needs. It owns no data: every mutation goes
 * through a handler `PlanClient` wires to a Server Action, so the shell stays
 * pure presentation and the optimistic reducer stays in one place.
 */
export type PlanLayoutProps = {
  state: PlanViewState;
  daysLeft: number;
  cppDone: number;
  onToggleCheck: (id: string, val: boolean) => void;
  onToggleFloor: (date: string, which: 'dsa' | 'cpp' | 'log') => void;
  onToggleTrip: (date: string) => void;
  onSaveLog: (date: string, text: string) => void;
  onSaveNote: (date: string, text: string) => void;
  onAddDsaExtra: (n: number) => void;
  onUndoDsaExtra: () => void;
  /** Input drafts live in PlanClient so an unmounted pane can't eat them. */
  logInput: string;
  setLogInput: (v: string) => void;
  extraInput: string;
  setExtraInput: (v: string) => void;
};
