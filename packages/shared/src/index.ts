/** Where a solve was detected. */
export type Source = 'leetcode' | 'neetcode' | 'tuf' | 'backfill';

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

export function lcKey(slug: string): CanonicalKey {
  return `lc:${slug}`;
}

export function isLcKey(key: string): boolean {
  return key.startsWith('lc:');
}

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

/** POST /api/solve response. */
export interface SolveResponse {
  isNew: boolean;
  /** Final server-authoritative entry after canonicalization/alias merging. */
  entry: SolvedProblem | null;
  alreadySolved: SolvedProblem | null;
  totals: Totals;
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
  // popup -> service worker
  | { type: 'GET_CACHE' }
  | { type: 'REFRESH_CACHE' }
  | { type: 'GET_ACTIVE_PROBLEM' }
  | { type: 'SET_API_BASE'; baseUrl: string }
  | { type: 'RUN_BACKFILL' }
  | { type: 'RUN_NC_IMPORT' };

export interface CheckProblemResponse {
  solved: boolean;
  entry: SolvedProblem | null;
}

/** Snapshot of the service worker's local cache, served to the popup. */
export interface CachedState {
  totals: Totals;
  solved: SolvedProblem[];
  /** Number of queued solves waiting for the API to come back. */
  pending: number;
  /** Whether the last API contact succeeded. */
  apiOk: boolean;
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
