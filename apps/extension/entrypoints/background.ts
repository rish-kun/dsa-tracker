import type {
  ActiveProblemResult,
  BackfillResponse,
  BackfillRunResult,
  CachedState,
  CheckProblemResponse,
  ExtMessage,
  AuthState,
  ImportRequest,
  ImportResponse,
  PageProblemMessage,
  ResolveResponse,
  SolveRequest,
  SolveResponse,
  SolvedListResponse,
  SolvedProblem,
  StatsResponse,
  StatsResult,
  Totals,
} from '@dsa-tracker/shared';
import type { MarkSolvedResult } from '../lib/messaging';

/**
 * Service worker. In MV3, content scripts are bound to the page origin by CORS,
 * so ALL backend fetches go through here where host_permissions apply. It also
 * owns the local cache of solved keys/totals and a retry queue for offline writes.
 */

const DEFAULT_API_BASE = 'http://localhost:3000';
const REFRESH_ALARM = 'dsa-refresh';
const REFRESH_MINUTES = 30;

// chrome.storage.local keys
const K_API_BASE = 'apiBaseUrl'; // v1, retained only for migration
const K_CACHE = 'solvedCache'; // v1, retained only for migration
const K_PENDING = 'pendingSolves'; // v1, retained only for migration
const K_STATE = 'trackerStateV2';
const STORAGE_VERSION = 2;

interface SolvedCache {
  version: number;
  keys: string[];
  solved: SolvedProblem[];
  totals: Totals;
  lastSync: number | null;
}

const EMPTY_TOTALS: Totals = { lcUnique: 0, other: 0 };
const EMPTY_CACHE: SolvedCache = {
  version: STORAGE_VERSION,
  keys: [],
  solved: [],
  totals: EMPTY_TOTALS,
  lastSync: null,
};

interface QueuedSolve {
  /** Stable identity used to finish only the request that was actually sent. */
  id: string;
  payload: SolveRequest;
  queuedAt: number;
  attempts: number;
  lastStatus?: number;
  lastError?: string;
}

interface RejectedSolve extends QueuedSolve {
  rejectedAt: number;
}

interface ProfileState {
  apiBaseUrl: string;
  /** Stored only in chrome.storage.local. Never returned to popup callers. */
  apiKey: string | null;
  cache: SolvedCache;
  pending: QueuedSolve[];
  deadLetters: RejectedSolve[];
  resolveCache: Record<string, ResolveResponse>;
  authState: AuthState;
}

interface ExtensionState {
  version: number;
  activeProfileId: string;
  profiles: Record<string, ProfileState>;
  /** Legacy queued writes are adopted by the first configured API key. */
  legacyPending: QueuedSolve[];
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

class MissingApiKeyError extends Error {
  constructor() {
    super('No extension API key configured.');
    this.name = 'MissingApiKeyError';
  }
}

type FlushOutcome = 'ok' | 'retry' | 'unauthorized' | 'missing-key';

let storageSerial: Promise<void> = Promise.resolve();
const flushInFlight = new Map<string, Promise<FlushOutcome>>();

function normalizeBase(base?: string): string {
  const value = base?.trim().replace(/\/+$/, '');
  return value || DEFAULT_API_BASE;
}

async function credentialFingerprint(key: string | null): Promise<string> {
  if (!key) return 'anonymous';
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function profileId(base: string, key: string | null): Promise<string> {
  return `${normalizeBase(base)}|${await credentialFingerprint(key)}`;
}

function createProfile(base: string, key: string | null): ProfileState {
  return {
    apiBaseUrl: normalizeBase(base),
    apiKey: key,
    cache: { ...EMPTY_CACHE, totals: { ...EMPTY_TOTALS } },
    pending: [],
    deadLetters: [],
    resolveCache: {},
    authState: key ? 'ok' : 'missing-key',
  };
}

function queuedSolveId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// storage helpers
// ---------------------------------------------------------------------------

async function migrateState(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get([K_STATE, K_API_BASE, K_CACHE, K_PENDING]);
  const existing = stored[K_STATE] as ExtensionState | undefined;
  if (existing?.version === STORAGE_VERSION && existing.profiles && existing.activeProfileId) {
    // Early v2 development builds did not give queue entries stable ids. Heal
    // those records in place so a service-worker update cannot reintroduce the
    // in-flight head-removal race.
    let healed = false;
    for (const profile of Object.values(existing.profiles)) {
      profile.pending = profile.pending.map((item) => {
        if (item.id) return item;
        healed = true;
        return { ...item, id: queuedSolveId() };
      });
      profile.deadLetters = profile.deadLetters.map((item) => {
        if (item.id) return item;
        healed = true;
        return { ...item, id: queuedSolveId() };
      });
    }
    existing.legacyPending = (existing.legacyPending ?? []).map((item) => {
      if (item.id) return item;
      healed = true;
      return { ...item, id: queuedSolveId() };
    });
    // Persist healed ids before a flush captures one. Otherwise each read of an
    // early-v2 record would mint a different id and the completed request could
    // never remove the item it actually sent.
    if (healed) await chrome.storage.local.set({ [K_STATE]: existing });
    return existing;
  }

  const base = normalizeBase(typeof stored[K_API_BASE] === 'string' ? stored[K_API_BASE] : undefined);
  const id = await profileId(base, null);
  const oldPending = Array.isArray(stored[K_PENDING]) ? (stored[K_PENDING] as SolveRequest[]) : [];
  const state: ExtensionState = {
    version: STORAGE_VERSION,
    activeProfileId: id,
    // Do not carry the v1 solved cache across identities. It may belong to a
    // different user; a fresh authenticated sync is cheap and safe.
    profiles: { [id]: createProfile(base, null) },
    legacyPending: oldPending.map((payload) => ({
      id: queuedSolveId(),
      payload,
      queuedAt: Date.now(),
      attempts: 0,
    })),
  };
  await chrome.storage.local.set({ [K_STATE]: state });
  return state;
}

async function withState<T>(fn: (state: ExtensionState) => Promise<T> | T): Promise<T> {
  const previous = storageSerial;
  let release!: () => void;
  storageSerial = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const state = await migrateState();
    const result = await fn(state);
    await chrome.storage.local.set({ [K_STATE]: state });
    return result;
  } finally {
    release();
  }
}

async function readState(): Promise<ExtensionState> {
  await storageSerial;
  return migrateState();
}

function activeProfile(state: ExtensionState): ProfileState {
  const profile = state.profiles[state.activeProfileId];
  if (profile) return profile;
  const fallback = createProfile(DEFAULT_API_BASE, null);
  state.profiles[state.activeProfileId] = fallback;
  return fallback;
}

async function getApiBase(): Promise<string> {
  return activeProfile(await readState()).apiBaseUrl;
}

async function readCache(): Promise<SolvedCache> {
  return activeProfile(await readState()).cache;
}

async function enqueuePending(
  payload: SolveRequest,
  error?: unknown,
  targetProfileId?: string,
): Promise<void> {
  await withState((state) => {
    const profile = targetProfileId ? state.profiles[targetProfileId] : activeProfile(state);
    if (!profile) return;
    const failure = queueFailure(error);
    profile.pending = profile.pending.filter((item) => item.payload.canonicalKey !== payload.canonicalKey);
    profile.pending.push({
      id: queuedSolveId(),
      payload,
      queuedAt: Date.now(),
      attempts: 0,
      ...(failure.status === undefined ? {} : { lastStatus: failure.status }),
      ...(failure.message ? { lastError: failure.message } : {}),
    });
  });
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Build an error carrying the server's message, not just the status code. */
async function httpError(method: string, path: string, res: Response): Promise<HttpError> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      detail = (JSON.parse(text) as { error?: string }).error ?? '';
    } catch {
      detail = text;
    }
  } catch {
    // body unavailable
  }
  detail = detail.trim().slice(0, 200);
  return new HttpError(res.status, `${method} ${path} -> ${res.status}${detail ? `: ${detail}` : ''}`);
}

async function apiGet<T>(path: string): Promise<T> {
  const profile = activeProfile(await readState());
  return apiGetForProfile(profile, path);
}

async function apiGetForProfile<T>(profile: Pick<ProfileState, 'apiBaseUrl' | 'apiKey'>, path: string): Promise<T> {
  if (!profile.apiKey) throw new MissingApiKeyError();
  const res = await fetch(`${profile.apiBaseUrl}${path}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${profile.apiKey}` },
  });
  if (!res.ok) throw await httpError('GET', path, res);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const profile = activeProfile(await readState());
  return apiPostForProfile(profile, path, body);
}

async function apiPostForProfile<T>(
  profile: Pick<ProfileState, 'apiBaseUrl' | 'apiKey'>,
  path: string,
  body: unknown,
): Promise<T> {
  if (!profile.apiKey) throw new MissingApiKeyError();
  const res = await fetch(`${profile.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${profile.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await httpError('POST', path, res);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// cache sync
// ---------------------------------------------------------------------------

function queueFailure(error: unknown): { status?: number; message?: string } {
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  if (error instanceof Error) return { message: error.message };
  return { message: 'Request failed.' };
}

async function setAuthState(authState: AuthState): Promise<void> {
  await withState((state) => {
    activeProfile(state).authState = authState;
  });
}

async function setProfileAuthState(profileId: string, authState: AuthState): Promise<void> {
  await withState((state) => {
    const profile = state.profiles[profileId];
    if (profile) profile.authState = authState;
  });
}

/** A single-flight FIFO drain. A permanently bad item is retained in the
 * dead-letter list and cannot starve later solves. */
function flushPending(targetProfileId?: string): Promise<FlushOutcome> {
  const start = targetProfileId;
  if (!start) {
    return readState().then((state) => flushPending(state.activeProfileId));
  }
  const existing = flushInFlight.get(start);
  if (existing) return existing;
  const job = (async () => {
    for (;;) {
      const state = await readState();
      const profile = state.profiles[start];
      if (!profile) return 'ok';
      if (!profile.apiKey) {
        await withState((next) => {
          const target = next.profiles[start];
          if (target) target.authState = 'missing-key';
        });
        return 'missing-key';
      }
      const queued = profile.pending[0];
      if (!queued) return 'ok';
      const queuedId = queued.id;
      try {
        await apiPostForProfile<SolveResponse>(profile, '/api/solve', queued.payload);
        await withState((next) => {
          const target = next.profiles[start];
          if (!target) return;
          target.pending = target.pending.filter((item) => item.id !== queuedId);
          target.authState = 'ok';
        });
      } catch (error) {
        const failure = queueFailure(error);
        await withState((next) => {
          const current = next.profiles[start];
          if (!current) return;
          const item = current.pending.find((candidate) => candidate.id === queuedId);
          if (!item) return;
          item.attempts += 1;
          if (failure.status !== undefined) item.lastStatus = failure.status;
          if (failure.message) item.lastError = failure.message;
          if (failure.status === 400 || failure.status === 422) {
            current.deadLetters.push({ ...item, rejectedAt: Date.now() });
            current.pending = current.pending.filter((candidate) => candidate.id !== queuedId);
          } else if (failure.status === 401 || failure.status === 403) {
            current.authState = 'invalid-key';
          } else if (error instanceof MissingApiKeyError) {
            current.authState = 'missing-key';
          } else {
            current.authState = 'api-error';
          }
        });
        if (failure.status === 400 || failure.status === 422) continue;
        if (failure.status === 401 || failure.status === 403) return 'unauthorized';
        return error instanceof MissingApiKeyError ? 'missing-key' : 'retry';
      }
    }
  })().finally(() => {
    flushInFlight.delete(start);
  });
  flushInFlight.set(start, job);
  return job;
}

/** Refresh the solved cache from the API and flush queued writes. Never throws;
 * on failure it leaves the existing cache in place and flags the API as down. */
async function syncCache(): Promise<CachedState> {
  const initial = await readState();
  const targetProfileId = initial.activeProfileId;
  const targetProfile = initial.profiles[targetProfileId];
  if (!targetProfile) return buildCachedState();
  try {
    const flushOutcome = await flushPending(targetProfileId);
    if (flushOutcome !== 'ok') return buildCachedState();
    const solved = await apiGetForProfile<SolvedListResponse>(targetProfile, '/api/solved');
    const cache: SolvedCache = {
      version: STORAGE_VERSION,
      keys: solved.keys,
      solved: solved.solved,
      totals: solved.totals,
      lastSync: Date.now(),
    };
    await withState((state) => {
      const profile = state.profiles[targetProfileId];
      if (!profile) return;
      profile.cache = cache;
      profile.authState = 'ok';
    });
  } catch (error) {
    await withState((state) => {
      const profile = state.profiles[targetProfileId];
      if (!profile) return;
      profile.authState =
        error instanceof MissingApiKeyError
          ? 'missing-key'
          : error instanceof HttpError && (error.status === 401 || error.status === 403)
            ? 'invalid-key'
            : 'api-error';
    });
  }
  return buildCachedState();
}

async function buildCachedState(): Promise<CachedState> {
  const profile = activeProfile(await readState());
  return {
    totals: profile.cache.totals,
    solved: profile.cache.solved,
    pending: profile.pending.length,
    apiOk: profile.authState === 'ok',
    authState: profile.authState,
    hasApiKey: !!profile.apiKey,
    rejected: profile.deadLetters.length,
    rejectedItems: profile.deadLetters
      .slice()
      .sort((a, b) => b.rejectedAt - a.rejectedAt)
      .slice(0, 10)
      .map((item) => ({
        canonicalKey: item.payload.canonicalKey,
        title: item.payload.title,
        status: item.lastStatus ?? null,
        error: item.lastError ?? null,
        rejectedAt: item.rejectedAt,
      })),
    apiBaseUrl: profile.apiBaseUrl,
    lastSync: profile.cache.lastSync,
  };
}

/** Apply a successful solve to the local cache without a network round-trip. */
async function applySolveToCache(
  payload: SolveRequest,
  res: SolveResponse,
  targetProfileId: string,
): Promise<void> {
  await withState((state) => {
    const profile = state.profiles[targetProfileId];
    if (!profile) return;
    const cache = profile.cache;
    cache.totals = res.totals;
    const entry = res.entry;
    if (entry) {
    // Drop a client-side nc: alias when the server upgraded it to lc:.
    cache.keys = cache.keys.filter(
      (key) => key !== payload.canonicalKey || key === entry.canonicalKey,
    );
    cache.solved = cache.solved.filter(
      (solved) =>
        solved.canonicalKey !== payload.canonicalKey ||
        solved.canonicalKey === entry.canonicalKey,
    );
    if (!cache.keys.includes(entry.canonicalKey)) cache.keys.push(entry.canonicalKey);
    const existingIndex = cache.solved.findIndex(
      (solved) => solved.canonicalKey === entry.canonicalKey,
    );
    if (existingIndex >= 0) cache.solved[existingIndex] = entry;
    else cache.solved.unshift(entry);
    }
    profile.cache = cache;
  });
}

// ---------------------------------------------------------------------------
// message handlers
// ---------------------------------------------------------------------------

async function handleCheckProblem(canonicalKey: string): Promise<CheckProblemResponse> {
  let cache = await readCache();
  // Cold cache: try a sync before answering.
  if (cache.lastSync === null) {
    await syncCache();
    cache = await readCache();
  }
  const entry = cache.solved.find((s) => s.canonicalKey === canonicalKey) ?? null;
  const profile = activeProfile(await readState());
  return { solved: cache.keys.includes(canonicalKey), entry, authState: profile.authState };
}

async function handleMarkSolved(payload: SolveRequest): Promise<MarkSolvedResult> {
  const initial = await readState();
  const targetProfileId = initial.activeProfileId;
  const targetProfile = initial.profiles[targetProfileId];
  try {
    if (!targetProfile) throw new MissingApiKeyError();
    const res = await apiPostForProfile<SolveResponse>(targetProfile, '/api/solve', payload);
    await setProfileAuthState(targetProfileId, 'ok');
    await applySolveToCache(payload, res, targetProfileId);
    // Opportunistically drain any older queued writes (don't block the caller).
    void flushPending(targetProfileId);
    return { ...res, authState: 'ok' };
  } catch (error) {
    const failure = queueFailure(error);
    if (failure.status === 400 || failure.status === 422) {
      await withState((state) => {
        const profile = state.profiles[targetProfileId];
        if (!profile) return;
        profile.deadLetters.push({
          id: queuedSolveId(),
          payload,
          queuedAt: Date.now(),
          attempts: 1,
          ...(failure.status === undefined ? {} : { lastStatus: failure.status }),
          ...(failure.message ? { lastError: failure.message } : {}),
          rejectedAt: Date.now(),
        });
      });
    } else {
      await enqueuePending(payload, error, targetProfileId);
    }
    await setProfileAuthState(targetProfileId,
      failure.status === 400 || failure.status === 422
        ? 'ok'
        : error instanceof MissingApiKeyError
          ? 'missing-key'
          : failure.status === 401 || failure.status === 403
            ? 'invalid-key'
            : 'api-error',
    );
    const profile = (await readState()).profiles[targetProfileId];
    const cache = profile?.cache ?? EMPTY_CACHE;
    const entry = cache.solved.find((s) => s.canonicalKey === payload.canonicalKey) ?? null;
    return {
      isNew: !cache.keys.includes(payload.canonicalKey),
      entry,
      alreadySolved: entry,
      totals: cache.totals,
      queued: failure.status !== 400 && failure.status !== 422,
      rejected: failure.status === 400 || failure.status === 422,
      authState: profile?.authState ?? 'missing-key',
    };
  }
}

async function handleResolve(slug?: string, title?: string): Promise<ResolveResponse> {
  const cacheKey = `s:${slug ?? ''}|t:${title ?? ''}`;
  const initial = await readState();
  const targetProfileId = initial.activeProfileId;
  const profile = initial.profiles[targetProfileId];
  if (!profile) return { problem: null, unavailable: true };
  const cached = profile.resolveCache[cacheKey];
  if (cached) return cached;
  try {
    const params = new URLSearchParams();
    if (slug) params.set('slug', slug);
    if (title) params.set('title', title);
    const res = await apiGetForProfile<ResolveResponse>(profile, `/api/resolve?${params.toString()}`);
    await withState((state) => {
      const current = state.profiles[targetProfileId];
      if (!current) return;
      current.authState = 'ok';
      current.resolveCache[cacheKey] = res;
    });
    return res;
  } catch (error) {
    await setProfileAuthState(
      targetProfileId,
      error instanceof MissingApiKeyError
        ? 'missing-key'
        : error instanceof HttpError && (error.status === 401 || error.status === 403)
          ? 'invalid-key'
          : 'api-error',
    );
    return { problem: null, unavailable: true };
  }
}

async function handleBackfillSlugs(slugs: string[]): Promise<BackfillResponse> {
  try {
    const res = await apiPost<BackfillResponse>('/api/backfill', { slugs });
    await setAuthState('ok');
    await syncCache();
    return res;
  } catch (error) {
    await setAuthState(
      error instanceof MissingApiKeyError
        ? 'missing-key'
        : error instanceof HttpError && (error.status === 401 || error.status === 403)
          ? 'invalid-key'
          : 'api-error',
    );
    const cache = await readCache();
    return { imported: 0, skipped: slugs.length, totals: cache.totals };
  }
}

async function handleGetStats(): Promise<StatsResult> {
  await syncCache();
  try {
    const stats = await apiGet<StatsResponse>('/api/stats');
    await setAuthState('ok');
    return { ok: true, stats, cache: await buildCachedState() };
  } catch (error) {
    await setAuthState(
      error instanceof MissingApiKeyError
        ? 'missing-key'
        : error instanceof HttpError && (error.status === 401 || error.status === 403)
          ? 'invalid-key'
          : 'api-error',
    );
    return { ok: false, stats: null, cache: await buildCachedState() };
  }
}

async function handleGetActiveProblem(): Promise<ActiveProblemResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return { payload: null, solved: false, entry: null };

  try {
    const payload = (await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_PAGE_PROBLEM',
    } satisfies PageProblemMessage)) as SolveRequest | null | undefined;
    if (!payload) return { payload: null, solved: false, entry: null };
    const status = await handleCheckProblem(payload.canonicalKey);
    return { payload, ...status };
  } catch {
    return { payload: null, solved: false, entry: null };
  }
}

async function activateProfile(base: string, key: string | null, clearAnonymousCache = false): Promise<CachedState> {
  const normalizedBase = normalizeBase(base);
  const id = await profileId(normalizedBase, key);
  await withState((state) => {
    let profile = state.profiles[id];
    if (!profile) {
      profile = createProfile(normalizedBase, key);
      state.profiles[id] = profile;
    }
    if (clearAnonymousCache && !key) {
      profile.cache = { ...EMPTY_CACHE, totals: { ...EMPTY_TOTALS } };
      profile.resolveCache = {};
      profile.authState = 'missing-key';
    }
    // A v1 queue was not bound to an identity. Preserve it by explicitly
    // adopting it into the first account that is configured after upgrade.
    if (key && state.legacyPending.length) {
      for (const legacy of state.legacyPending) {
        profile.pending = profile.pending.filter(
          (queued) => queued.payload.canonicalKey !== legacy.payload.canonicalKey,
        );
        profile.pending.push(legacy);
      }
      state.legacyPending = [];
    }
    state.activeProfileId = id;
  });
  return buildCachedState();
}

async function notifyIdentityChanged(): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: [
      '*://leetcode.com/*',
      '*://neetcode.io/*',
      '*://takeuforward.org/*',
      '*://*.geeksforgeeks.org/*',
      '*://geeksforgeeks.org/*',
    ],
  });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => tab.id !== undefined)
      .map((tab) =>
        chrome.tabs
          .sendMessage(tab.id, { type: 'AUTH_PROFILE_CHANGED' } satisfies ExtMessage)
          .catch(() => undefined),
      ),
  );
}

async function handleSetApiBase(baseUrl: string): Promise<CachedState> {
  const current = activeProfile(await readState());
  const next = await activateProfile(baseUrl, current.apiKey);
  // A base/key profile has its own cache and queue. Sync is intentionally
  // after the switch so a failed request cannot contaminate the old identity.
  await notifyIdentityChanged();
  return next.hasApiKey ? syncCache() : next;
}

async function handleSetApiKey(key: string): Promise<CachedState> {
  const current = activeProfile(await readState());
  const trimmed = key.trim();
  if (!trimmed) return handleClearApiKey();
  const next = await activateProfile(current.apiBaseUrl, trimmed);
  await notifyIdentityChanged();
  return syncCache().catch(() => next);
}

async function handleClearApiKey(): Promise<CachedState> {
  const current = activeProfile(await readState());
  const state = await activateProfile(current.apiBaseUrl, null, true);
  await notifyIdentityChanged();
  return state;
}

async function handleOpenPopup(): Promise<void> {
  try {
    await chrome.action.openPopup();
    return;
  } catch {
    // Older Chromium may reject openPopup from a content-script click. The
    // settings page is a useful, authenticated fallback where keys are made.
    const base = await getApiBase();
    await chrome.tabs.create({ url: `${base}/settings` });
  }
}

// ---------------------------------------------------------------------------
// LeetCode backfill: run inside a leetcode.com tab so session cookies apply
// ---------------------------------------------------------------------------

interface CollectResult {
  slugs?: string[];
  needLogin?: boolean;
  error?: string;
}

/**
 * Injected (serialized) into a leetcode.com tab via chrome.scripting. Runs in
 * that tab's context so first-party session cookies + CSRF token are available.
 * Must be fully self-contained — no references to outer scope.
 */
async function collectAcSlugs(): Promise<CollectResult> {
  try {
    const csrf =
      document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';
    const query = `
      query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
          total: totalNum
          questions: data { titleSlug status }
        }
      }`;
    const limit = 100;
    let skip = 0;
    let total = Infinity;
    const slugs: string[] = [];

    while (skip < total) {
      const resp = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrftoken': csrf,
        },
        body: JSON.stringify({
          query,
          variables: { categorySlug: '', limit, skip, filters: { status: 'AC' } },
        }),
      });
      if (resp.status === 403 || resp.status === 401) return { needLogin: true };
      const json = await resp.json();
      const list = json?.data?.problemsetQuestionList;
      if (!list) return { needLogin: true };
      total = typeof list.total === 'number' ? list.total : slugs.length;
      const questions: Array<{ titleSlug?: string }> = list.questions ?? [];
      for (const q of questions) {
        if (q?.titleSlug) slugs.push(q.titleSlug);
      }
      if (questions.length === 0) break;
      skip += limit;
      await new Promise((r) => setTimeout(r, 300)); // be gentle between pages
    }
    return { slugs };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'collection failed' };
  }
}

async function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** Find an existing tab on a site or create one. We use chrome.scripting on
 * this tab (not messaging a content script) because collectors must run with
 * the site's first-party session — executeScript can inject into any page
 * where host permission holds, content script or not. */
async function ensureSiteTab(pattern: string, createUrl: string): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: pattern });
  let tab = tabs.find((t) => t.status === 'complete') ?? tabs[0];
  if (!tab) {
    tab = await chrome.tabs.create({ url: createUrl, active: false });
  }
  if (tab.id === undefined) return null;
  await waitForTabComplete(tab.id);
  return tab;
}

async function handleRunBackfill(): Promise<BackfillRunResult> {
  try {
    const tab = await ensureSiteTab('*://leetcode.com/*', 'https://leetcode.com/');
    if (!tab || tab.id === undefined) {
      return { ok: false, cacheSynced: false, error: 'Could not open a leetcode.com tab.' };
    }
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectAcSlugs,
    });
    const result = inj?.result as CollectResult | undefined;
    if (!result) {
      return { ok: false, cacheSynced: false, error: 'No response from leetcode.com.' };
    }
    if (result.needLogin) {
      return { ok: false, cacheSynced: false, error: 'Open leetcode.com and log in first.' };
    }
    if (result.error) return { ok: false, cacheSynced: false, error: result.error };
    const slugs = result.slugs ?? [];
    const res = await apiPost<BackfillResponse>('/api/backfill', { slugs });
    await setAuthState('ok');
    const cache = await syncCache();
    const cacheSynced = cache.apiOk;
    return {
      ok: true,
      cacheSynced,
      warning: cacheSynced
        ? undefined
        : 'Import succeeded, but the local solved-problem cache could not be refreshed.',
      imported: res.imported,
      skipped: res.skipped,
      totals: res.totals,
      collected: slugs.length,
    };
  } catch (e) {
    await setAuthState(
      e instanceof MissingApiKeyError
        ? 'missing-key'
        : e instanceof HttpError && (e.status === 401 || e.status === 403)
          ? 'invalid-key'
          : 'api-error',
    );
    return {
      ok: false,
      cacheSynced: false,
      error: e instanceof Error ? e.message : 'Backfill failed.',
    };
  }
}

// ---------------------------------------------------------------------------
// NeetCode import: run inside a neetcode.io tab so the Firebase session applies
// ---------------------------------------------------------------------------

/**
 * Injected (serialized) into a neetcode.io tab via chrome.scripting. Signed-in
 * progress lives behind NeetCode's `getCompletedProblems` callable; the
 * similarly-shaped localStorage value is only the signed-out fallback. Must be
 * fully self-contained — no references to outer scope.
 */
async function collectNcCompleted(): Promise<CollectResult> {
  try {
    interface AuthRow {
      fbase_key: string;
      value?: {
        apiKey?: string;
        stsTokenManager?: {
          accessToken?: string;
          refreshToken?: string;
          expirationTime?: number;
        };
      };
    }

    const ids = new Set<string>();
    const seen = new Set<object>();
    const isValidId = (value: string): boolean =>
      /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(value);
    const normalizeId = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (isValidId(trimmed)) return trimmed;

      try {
        const url = new URL(trimmed);
        const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
        if (hostname !== 'leetcode.com' && hostname !== 'neetcode.io') return null;
        const match = url.pathname.match(/^\/problems?\/([^/]+)\/?$/);
        if (!match) return null;
        const slug = decodeURIComponent(match[1]);
        return isValidId(slug) ? slug : null;
      } catch {
        return null;
      }
    };
    const walk = (value: unknown, depth = 0): void => {
      if (depth > 12) return;
      const normalized = normalizeId(value);
      if (normalized) {
        ids.add(normalized);
        return;
      }
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);

      if (Array.isArray(value)) {
        value.forEach((item) => walk(item, depth + 1));
        return;
      }

      const record = value as Record<string, unknown>;
      for (const field of ['data', 'result', 'completedProblems', 'problems']) {
        if (field in record) walk(record[field], depth + 1);
      }
      for (const child of Object.values(record)) {
        if (Array.isArray(child)) walk(child, depth + 1);
      }
    };

    const authRow = await new Promise<AuthRow | null>((resolve, reject) => {
      const open = indexedDB.open('firebaseLocalStorageDb');
      open.onerror = () => reject(new Error('Could not read the NeetCode login session.'));
      open.onsuccess = () => {
        try {
          if (!open.result.objectStoreNames.contains('firebaseLocalStorage')) {
            resolve(null);
            return;
          }
          const tx = open.result.transaction('firebaseLocalStorage', 'readonly');
          const all = tx.objectStore('firebaseLocalStorage').getAll();
          all.onsuccess = () => {
            const rows = (all.result ?? []) as AuthRow[];
            resolve(
              rows.find(
                (row) =>
                  typeof row?.fbase_key === 'string' &&
                  row.fbase_key.startsWith('firebase:authUser:'),
              ) ?? null,
            );
          };
          all.onerror = () => reject(new Error('Could not read the NeetCode login session.'));
        } catch (error) {
          reject(error);
        }
      };
    });

    const tokenManager = authRow?.value?.stsTokenManager;
    if (authRow && tokenManager) {
      const apiKey =
        authRow.fbase_key.match(/^firebase:authUser:([^:]+):/)?.[1] ??
        authRow.value?.apiKey;
      let token = tokenManager.accessToken ?? null;
      const tokenIsStale =
        !token ||
        (typeof tokenManager.expirationTime === 'number' &&
          tokenManager.expirationTime < Date.now() + 120_000);

      if (tokenIsStale && tokenManager.refreshToken && apiKey) {
        const refresh = await fetch(
          `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokenManager.refreshToken)}`,
          },
        );
        if (refresh.ok) {
          const refreshed = (await refresh.json()) as {
            access_token?: string;
            id_token?: string;
          };
          token = refreshed.id_token ?? refreshed.access_token ?? token;
        }
      }

      if (token) {
        const response = await fetch('https://neetcode.io/api/callableFunctionHttp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ data: { functionId: 'getCompletedProblems' } }),
        });
        if (response.status === 401 || response.status === 403) return { needLogin: true };
        if (!response.ok) {
          const detail = (await response.text()).trim().slice(0, 160);
          return {
            error: `NeetCode progress request failed (${response.status})${detail ? `: ${detail}` : ''}`,
          };
        }
        walk((await response.json()) as unknown);
      }
    }

    // NeetCode uses this only for anonymous/local progress now, but importing
    // it remains useful if the user has not signed in or the API returned none.
    if (ids.size === 0) {
      const raw = localStorage.getItem('completed-problem-list');
      if (raw) {
        try {
          walk(JSON.parse(raw) as unknown);
        } catch {
          return { error: 'Local NeetCode progress is malformed and could not be read.' };
        }
      }
    }

    if (ids.size === 0 && !tokenManager) return { needLogin: true };
    if (ids.size === 0) return { error: 'No completed problems found on your NeetCode account.' };
    return { slugs: [...ids] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'collection failed' };
  }
}

async function handleRunNcImport(): Promise<BackfillRunResult> {
  try {
    const tab = await ensureSiteTab('*://neetcode.io/*', 'https://neetcode.io/practice');
    if (!tab || tab.id === undefined) {
      return { ok: false, cacheSynced: false, error: 'Could not open a neetcode.io tab.' };
    }
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectNcCompleted,
    });
    const result = inj?.result as CollectResult | undefined;
    if (!result) {
      return { ok: false, cacheSynced: false, error: 'No response from neetcode.io.' };
    }
    if (result.needLogin) {
      return { ok: false, cacheSynced: false, error: 'Open neetcode.io and log in first.' };
    }
    if (result.error) return { ok: false, cacheSynced: false, error: result.error };
    const ids = result.slugs ?? [];
    const res = await apiPost<ImportResponse>('/api/import', { ids } satisfies ImportRequest);
    await setAuthState('ok');
    const cache = await syncCache();
    const cacheSynced = cache.apiOk;
    return {
      ok: true,
      cacheSynced,
      warning: cacheSynced
        ? undefined
        : 'Import succeeded, but the local solved-problem cache could not be refreshed.',
      imported: res.imported,
      skipped: res.skipped,
      totals: res.totals,
      collected: ids.length,
    };
  } catch (e) {
    await setAuthState(
      e instanceof MissingApiKeyError
        ? 'missing-key'
        : e instanceof HttpError && (e.status === 401 || e.status === 403)
          ? 'invalid-key'
          : 'api-error',
    );
    return {
      ok: false,
      cacheSynced: false,
      error: e instanceof Error ? e.message : 'NeetCode import failed.',
    };
  }
}

// ---------------------------------------------------------------------------
// message router
// ---------------------------------------------------------------------------

function route(msg: ExtMessage): Promise<unknown> | undefined {
  switch (msg.type) {
    case 'CHECK_PROBLEM':
      return handleCheckProblem(msg.canonicalKey);
    case 'MARK_SOLVED':
      return handleMarkSolved(msg.payload);
    case 'RESOLVE':
      return handleResolve(msg.slug, msg.title);
    case 'BACKFILL_SLUGS':
      return handleBackfillSlugs(msg.slugs);
    case 'GET_STATS':
      return handleGetStats();
    case 'GET_CACHE':
      return buildCachedState();
    case 'REFRESH_CACHE':
      return syncCache();
    case 'GET_ACTIVE_PROBLEM':
      return handleGetActiveProblem();
    case 'SET_API_BASE':
      return handleSetApiBase(msg.baseUrl);
    case 'SET_API_KEY':
      return handleSetApiKey(msg.key);
    case 'CLEAR_API_KEY':
      return handleClearApiKey();
    case 'OPEN_POPUP':
      return handleOpenPopup();
    case 'RUN_BACKFILL':
      return handleRunBackfill();
    case 'RUN_NC_IMPORT':
      return handleRunNcImport();
    case 'ROUTE_CHANGED':
      return undefined;
  }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
    const result = route(msg);
    if (!result) return false;
    result.then(sendResponse).catch((e) => {
      console.error('[dsa-tracker] message handler failed', msg.type, e);
      sendResponse(undefined);
    });
    return true; // async response
  });

  // Refresh cache on lifecycle events + a periodic alarm.
  chrome.runtime.onInstalled.addListener(() => {
    void syncCache();
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  });
  chrome.runtime.onStartup.addListener(() => {
    void syncCache();
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM) void syncCache();
  });

  // SPA route detection: notify the tab so content scripts re-check the problem.
  chrome.webNavigation.onHistoryStateUpdated.addListener(
    (details) => {
      if (details.frameId !== 0) return;
      chrome.tabs
        .sendMessage(details.tabId, { type: 'ROUTE_CHANGED' } satisfies ExtMessage)
        .catch(() => {
          // "Receiving end does not exist" when no content script is present — ignore.
        });
    },
    {
      url: [
        { hostEquals: 'leetcode.com' },
        { hostEquals: 'neetcode.io' },
        { hostEquals: 'takeuforward.org' },
        { hostEquals: 'geeksforgeeks.org' },
        { hostEquals: 'www.geeksforgeeks.org' },
        { hostEquals: 'practice.geeksforgeeks.org' },
      ],
    },
  );
});
