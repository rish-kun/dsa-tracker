/** Where a solve was detected. */
export type Source = 'leetcode' | 'neetcode' | 'tuf' | 'gfg' | 'backfill';

/** How a solve was recorded. */
export type Detected = 'auto' | 'manual' | 'backfill';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/**
 * Canonical dedup key.
 * - `lc:<titleSlug>` — LeetCode-mapped problems (counts toward the main unique total)
 * - `tuf:<slug>` / `gfg:<slug>` / `nc:<slug>` — problems with no LeetCode
 *   equivalent (separate counter). `nc:` is a NeetCode-only problem (their
 *   editor slugs are NOT LeetCode titleSlugs — e.g. `duplicate-integer` is
 *   LeetCode's `contains-duplicate`). The server upgrades every catalog match
 *   to `lc:`; only genuinely unmappable problems remain under `nc:`.
 */
export type CanonicalKey =
  | `lc:${string}`
  | `tuf:${string}`
  | `gfg:${string}`
  | `nc:${string}`;

export interface Problem {
  lcSlug: string;
  lcNumber: number;
  title: string;
  difficulty: Difficulty;
  paidOnly: boolean;
}

export interface SolvedProblem {
  canonicalKey: string;
  lcSlug: string | null;
  title: string;
  difficulty: Difficulty | null;
  firstSource: Source;
  firstSolvedAt: string;
  /** Earliest recorded URL on the site where the problem was solved. */
  sourceUrl: string | null;
}

/** POST /api/solve request body. */
export interface SolveRequest {
  canonicalKey: string;
  lcSlug?: string;
  title: string;
  source: Source;
  url: string;
  detected: Detected;
}

/**
 * What the banner should link to after a solve: the next unsolved problem in
 * the user's track, or — only when the track has nothing to offer — the next
 * unsolved part of a multi-part series (Next Greater Element I → II → III).
 * Additive optional on SolveResponse, so older extensions simply ignore it.
 */
export interface NextUp {
  kind: 'track' | 'sequel';
  /** Display title, e.g. "503. Next Greater Element II". */
  title: string;
  url: string;
  /** Track only: unsolved items remaining in the track. */
  remaining?: number;
}

/** POST /api/solve response. */
export interface SolveResponse {
  isNew: boolean;
  /** Final server-authoritative entry after canonicalization/alias merging. */
  entry: SolvedProblem | null;
  alreadySolved: SolvedProblem | null;
  totals: Totals;
  /** Suggested next problem, or null when neither track nor series has one. */
  nextUp?: NextUp | null;
}

export interface Totals {
  lcUnique: number;
  other: number;
}

/** GET /api/solved response. */
export interface SolvedListResponse {
  keys: string[];
  solved: SolvedProblem[];
  totals: Totals;
}

/** POST /api/backfill request body. */
export interface BackfillRequest {
  slugs: string[];
}

export interface BackfillResponse {
  imported: number;
  skipped: number;
  totals: Totals;
}

/** GET /api/resolve response. */
export interface ResolveResponse {
  problem: Problem | null;
  /** The catalog could not be reached. This is deliberately distinct from a
   * successful lookup with no match, so site adapters never create a fallback
   * key during an outage. */
  unavailable?: boolean;
}

/**
 * POST /api/import request body: problem ids collected from NeetCode's local
 * completed-problem lists. Ids may be LeetCode titleSlugs (practice-list
 * problems) or NeetCode editor slugs — the server resolves each to an `lc:`
 * key when possible and falls back to `nc:`.
 */
export interface ImportRequest {
  ids: string[];
}

export interface ImportResponse {
  imported: number;
  skipped: number;
  /** Ids that could not be mapped to a LeetCode problem (imported as `nc:`). */
  unmapped: string[];
  totals: Totals;
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

/**
 * The IANA zone every tracker day key is bucketed in. Hardcoded rather than
 * "the browser's local zone" so a day boundary means the same thing in the
 * extension, the API and the dashboard even when travelling — matching
 * `PLAN_TZ` in packages/plan-data, which does the same for /plan.
 */
export const TRACKER_TZ = 'Asia/Kolkata';

/**
 * `YYYY-MM-DD` for an instant in TRACKER_TZ. Never use `toISOString()` for a
 * day key: that is UTC and rolls the day over at the wrong local time.
 * `en-CA` formats as `YYYY-MM-DD`, which is exactly the key format.
 */
export function trackerDateKey(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TRACKER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** The practice sites whose active tab time is measured. Deliberately the
 * solve `Source` values minus `backfill`, which is not a site. */
export type TimeSite = Exclude<Source, 'backfill'>;

export const TIME_SITES: TimeSite[] = ['leetcode', 'neetcode', 'tuf', 'gfg'];

/** Active seconds accumulated on one site during one tracker day. */
export interface TimeSegment {
  /** Tracker-day key from `trackerDateKey`. */
  date: string;
  site: TimeSite;
  seconds: number;
}

/**
 * POST /api/time request body. Segments are **increments**, not totals: the
 * server adds them to whatever it already holds for that (date, site). The
 * extension therefore sends each accumulated batch exactly once and only
 * clears it after a 2xx, so a dropped response can over-count by at most one
 * flush interval — the same at-least-once posture as the solve queue.
 */
export interface TimeRequest {
  segments: TimeSegment[];
}

export interface TimeResponse {
  /** Segments actually applied (malformed ones are skipped, not fatal). */
  applied: number;
  /** Total active seconds today, after applying this batch. */
  todaySeconds: number;
}

/** One day's tracked time, per site plus the day's total. */
export interface DailyTime {
  date: string;
  seconds: number;
  bySite: Record<TimeSite, number>;
}

/**
 * Response to the popup's GET_TIME. `todaySeconds` is what the user should see:
 * the server-confirmed total plus whatever is still queued locally, so the
 * number never dips while a flush is in flight.
 */
export interface TimeResult {
  /** Tracker-day key the figure belongs to. */
  date: string;
  todaySeconds: number;
  /** Of that total, the part not yet accepted by the server. */
  pendingSeconds: number;
  /** False when no flush has ever succeeded for this day — the figure is then
   * local-only and may not include time recorded on another device. */
  synced: boolean;
}

/** "1h 24m" / "24m" / "48s". Lives here so the dashboard panel and the
 * extension popup cannot drift into formatting the same number differently. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** GET /api/stats response. */
export interface StatsResponse {
  totals: Totals;
  byDifficulty: Record<Difficulty, number>;
  bySource: Record<string, number>;
  /** ISO date (yyyy-mm-dd) → count of first-solves that day. */
  overTime: { date: string; count: number }[];
  recent: SolvedProblem[];
}

/** Messages between extension content scripts / popup and the service worker. */
export type ExtMessage =
  | { type: 'CHECK_PROBLEM'; canonicalKey: string }
  | { type: 'MARK_SOLVED'; payload: SolveRequest }
  | { type: 'RESOLVE'; slug?: string; title?: string }
  | { type: 'BACKFILL_SLUGS'; slugs: string[] }
  | { type: 'GET_STATS' }
  | { type: 'ROUTE_CHANGED' }
  /** Active-tab time measured by the activity content script since its last
   * report. Fire-and-forget: the service worker accumulates and flushes. */
  | { type: 'ACTIVITY'; site: TimeSite; date: string; seconds: number }
  // popup -> service worker
  /** Today's tracked time for the popup. Flushes first so the figure is fresh. */
  | { type: 'GET_TIME' }
  | { type: 'GET_CACHE' }
  | { type: 'REFRESH_CACHE' }
  | { type: 'GET_ACTIVE_PROBLEM' }
  | { type: 'SET_API_BASE'; baseUrl: string }
  | { type: 'SET_API_KEY'; key: string }
  | { type: 'CLEAR_API_KEY' }
  | { type: 'OPEN_POPUP' }
  /** Service worker tells page adapters to discard identity-bound UI/cache. */
  | { type: 'AUTH_PROFILE_CHANGED' }
  | { type: 'RUN_BACKFILL' }
  | { type: 'RUN_NC_IMPORT' };

export interface CheckProblemResponse {
  solved: boolean;
  entry: SolvedProblem | null;
  /** Lets auto-detect sites explain why they cannot read/write yet. */
  authState: AuthState;
}

export type AuthState = 'ok' | 'missing-key' | 'invalid-key' | 'api-error';

export interface RejectedQueueItem {
  canonicalKey: string;
  title: string;
  status: number | null;
  error: string | null;
  rejectedAt: number;
}

/** Snapshot of the service worker's local cache, served to the popup. */
export interface CachedState {
  totals: Totals;
  solved: SolvedProblem[];
  /** Number of queued solves waiting for the API to come back. */
  pending: number;
  /** Whether the last API contact succeeded. */
  apiOk: boolean;
  /** Authentication is separate from reachability: queued work is retained
   * for missing or revoked credentials. */
  authState: AuthState;
  /** Whether an API key is configured for the active base/key profile. */
  hasApiKey: boolean;
  /** Permanently rejected writes kept for inspection instead of blocking FIFO. */
  rejected: number;
  /** Visible dead-letter details, newest first. Secrets are never included. */
  rejectedItems: RejectedQueueItem[];
  apiBaseUrl: string;
  /** Epoch ms of the last successful cache sync, or null if never. */
  lastSync: number | null;
}

/** Response to GET_STATS: live stats when reachable, cache fallback otherwise. */
export interface StatsResult {
  ok: boolean;
  stats: StatsResponse | null;
  cache: CachedState;
}

/** Problem context reported by the active tab to power the popup action. */
export interface ActiveProblemResult {
  payload: SolveRequest | null;
  solved: boolean;
  entry: SolvedProblem | null;
}

/** Message sent directly from the service worker to a site's content script. */
export interface PageProblemMessage {
  type: 'GET_PAGE_PROBLEM';
}

/** Result of the popup-triggered LeetCode backfill / NeetCode import runs. */
export interface BackfillRunResult {
  ok: boolean;
  /** Whether the local solved-problem cache was refreshed after the run. */
  cacheSynced: boolean;
  error?: string;
  /** Non-fatal issue, such as import success followed by a failed cache refresh. */
  warning?: string;
  imported?: number;
  skipped?: number;
  totals?: Totals;
  /** Total problems collected from the source site. */
  collected?: number;
}
