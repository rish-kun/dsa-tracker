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
/**
 * Which candidate layout `/plan` renders. Evaluation scaffolding: `now` is the
 * layout that shipped before this comparison, kept so the three candidates have
 * a baseline to be judged against. Once one wins, this type and every layout
 * shell but the winner go away.
 */
export const PLAN_VIEWS = ['now', 'a', 'b', 'c'] as const;
export type PlanView = (typeof PLAN_VIEWS)[number];

export function isPlanView(v: string | undefined): v is PlanView {
  return !!v && (PLAN_VIEWS as readonly string[]).includes(v);
}

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
 * Everything a layout shell needs. Identical for all four shells, so swapping
 * layouts is a render-time choice and nothing else — no shell owns data, and
 * every mutation still goes through the handlers `PlanClient` wires to the
 * Server Actions.
 */
export type PlanLayoutProps = {
  state: PlanViewState;
  daysLeft: number;
  cppDone: number;
  onToggleCheck: (id: string, val: boolean) => void;
  onToggleFloor: (date: string, which: 'dsa' | 'cpp' | 'log') => void;
  onToggleTrip: (date: string) => void;
  onSaveLog: (date: string, text: string) => void;
  onAddDsaExtra: (n: number) => void;
  onUndoDsaExtra: () => void;
  /** Input drafts live in PlanClient so an unmounted pane can't eat them. */
  logInput: string;
  setLogInput: (v: string) => void;
  extraInput: string;
  setExtraInput: (v: string) => void;
};
