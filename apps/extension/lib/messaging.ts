import type {
  ActiveProblemResult,
  AuthState,
  BackfillResponse,
  BackfillRunResult,
  CachedState,
  CheckProblemResponse,
  ExtMessage,
  ResolveResponse,
  SolveResponse,
  StatsResult,
  TimeResult,
} from '@dsa-tracker/shared';

/** MARK_SOLVED response: a normal SolveResponse plus a `queued` flag set when
 * the API was unreachable and the write was queued locally for later retry. */
export interface MarkSolvedResult extends SolveResponse {
  queued?: boolean;
  /** The server permanently rejected this write (400/422); details are in the
   * active profile's popup dead-letter count. */
  rejected?: boolean;
  /** Current credential/reachability state, including after a queued write. */
  authState: AuthState;
}

/** Maps each message type to the shape the service worker responds with. */
interface ResponseMap {
  CHECK_PROBLEM: CheckProblemResponse;
  MARK_SOLVED: MarkSolvedResult;
  RESOLVE: ResolveResponse;
  BACKFILL_SLUGS: BackfillResponse;
  GET_STATS: StatsResult;
  ROUTE_CHANGED: void;
  ACTIVITY: void;
  GET_TIME: TimeResult;
  GET_CACHE: CachedState;
  REFRESH_CACHE: CachedState;
  GET_ACTIVE_PROBLEM: ActiveProblemResult;
  SET_API_BASE: CachedState;
  SET_API_KEY: CachedState;
  CLEAR_API_KEY: CachedState;
  OPEN_POPUP: void;
  AUTH_PROFILE_CHANGED: void;
  RUN_BACKFILL: BackfillRunResult;
  RUN_NC_IMPORT: BackfillRunResult;
}

/** Typed wrapper around chrome.runtime.sendMessage. */
export async function sendMessage<T extends ExtMessage['type']>(
  message: Extract<ExtMessage, { type: T }>,
): Promise<ResponseMap[T]> {
  return (await chrome.runtime.sendMessage(message)) as ResponseMap[T];
}
