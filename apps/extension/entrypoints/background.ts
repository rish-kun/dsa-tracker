import type {
  ActiveProblemResult,
  BackfillResponse,
  BackfillRunResult,
  CachedState,
  CheckProblemResponse,
  ExtMessage,
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
const K_API_BASE = 'apiBaseUrl';
const K_CACHE = 'solvedCache';
const K_PENDING = 'pendingSolves';

interface SolvedCache {
  keys: string[];
  solved: SolvedProblem[];
  totals: Totals;
  lastSync: number | null;
}

const EMPTY_TOTALS: Totals = { lcUnique: 0, other: 0 };
const EMPTY_CACHE: SolvedCache = {
  keys: [],
  solved: [],
  totals: EMPTY_TOTALS,
  lastSync: null,
};

// In-memory, per-SW-life state.
let apiOk = true;
const resolveCache = new Map<string, ResolveResponse>();

// ---------------------------------------------------------------------------
// storage helpers
// ---------------------------------------------------------------------------

async function getApiBase(): Promise<string> {
  const v = await chrome.storage.local.get(K_API_BASE);
  const base = v[K_API_BASE];
  return typeof base === 'string' && base ? base.replace(/\/+$/, '') : DEFAULT_API_BASE;
}

async function readCache(): Promise<SolvedCache> {
  const v = await chrome.storage.local.get(K_CACHE);
  const c = v[K_CACHE] as SolvedCache | undefined;
  return c ?? EMPTY_CACHE;
}

async function writeCache(cache: SolvedCache): Promise<void> {
  await chrome.storage.local.set({ [K_CACHE]: cache });
}

async function readPending(): Promise<SolveRequest[]> {
  const v = await chrome.storage.local.get(K_PENDING);
  const p = v[K_PENDING] as SolveRequest[] | undefined;
  return Array.isArray(p) ? p : [];
}

async function writePending(pending: SolveRequest[]): Promise<void> {
  await chrome.storage.local.set({ [K_PENDING]: pending });
}

/** Queue an offline write, deduped by canonicalKey (last one wins). */
async function enqueuePending(payload: SolveRequest): Promise<void> {
  const pending = await readPending();
  const next = pending.filter((p) => p.canonicalKey !== payload.canonicalKey);
  next.push(payload);
  await writePending(next);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Build an error carrying the server's message, not just the status code. */
async function httpError(method: string, path: string, res: Response): Promise<Error> {
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
  return new Error(`${method} ${path} -> ${res.status}${detail ? `: ${detail}` : ''}`);
}

async function apiGet<T>(path: string): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, { method: 'GET' });
  if (!res.ok) throw await httpError('GET', path, res);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await httpError('POST', path, res);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// cache sync
// ---------------------------------------------------------------------------

/** POST every queued solve; on any failure throw so the caller marks API down
 * and keeps the queue for the next attempt. Successful items are dropped. */
async function flushPending(): Promise<void> {
  let pending = await readPending();
  while (pending.length > 0) {
    const next = pending[0];
    await apiPost<SolveResponse>('/api/solve', next); // throws if API down
    pending = pending.slice(1);
    await writePending(pending);
  }
}

/** Refresh the solved cache from the API and flush queued writes. Never throws;
 * on failure it leaves the existing cache in place and flags the API as down. */
async function syncCache(): Promise<CachedState> {
  try {
    await flushPending();
    const solved = await apiGet<SolvedListResponse>('/api/solved');
    const cache: SolvedCache = {
      keys: solved.keys,
      solved: solved.solved,
      totals: solved.totals,
      lastSync: Date.now(),
    };
    await writeCache(cache);
    apiOk = true;
  } catch {
    apiOk = false;
  }
  return buildCachedState();
}

async function buildCachedState(): Promise<CachedState> {
  const [cache, pending, apiBaseUrl] = await Promise.all([
    readCache(),
    readPending(),
    getApiBase(),
  ]);
  return {
    totals: cache.totals,
    solved: cache.solved,
    pending: pending.length,
    apiOk,
    apiBaseUrl,
    lastSync: cache.lastSync,
  };
}

/** Apply a successful solve to the local cache without a network round-trip. */
async function applySolveToCache(
  payload: SolveRequest,
  res: SolveResponse,
): Promise<void> {
  const cache = await readCache();
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
  await writeCache(cache);
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
  return { solved: cache.keys.includes(canonicalKey), entry };
}

async function handleMarkSolved(payload: SolveRequest): Promise<MarkSolvedResult> {
  try {
    const res = await apiPost<SolveResponse>('/api/solve', payload);
    apiOk = true;
    await applySolveToCache(payload, res);
    // Opportunistically drain any older queued writes (don't block the caller).
    void flushPending().catch(() => {
      apiOk = false;
    });
    return res;
  } catch {
    apiOk = false;
    await enqueuePending(payload);
    const cache = await readCache();
    const entry = cache.solved.find((s) => s.canonicalKey === payload.canonicalKey) ?? null;
    return {
      isNew: !cache.keys.includes(payload.canonicalKey),
      entry,
      alreadySolved: entry,
      totals: cache.totals,
      queued: true,
    };
  }
}

async function handleResolve(slug?: string, title?: string): Promise<ResolveResponse> {
  const cacheKey = `s:${slug ?? ''}|t:${title ?? ''}`;
  const cached = resolveCache.get(cacheKey);
  if (cached) return cached;
  try {
    const params = new URLSearchParams();
    if (slug) params.set('slug', slug);
    if (title) params.set('title', title);
    const res = await apiGet<ResolveResponse>(`/api/resolve?${params.toString()}`);
    apiOk = true;
    resolveCache.set(cacheKey, res);
    return res;
  } catch {
    apiOk = false;
    return { problem: null };
  }
}

async function handleBackfillSlugs(slugs: string[]): Promise<BackfillResponse> {
  try {
    const res = await apiPost<BackfillResponse>('/api/backfill', { slugs });
    apiOk = true;
    await syncCache();
    return res;
  } catch {
    apiOk = false;
    const cache = await readCache();
    return { imported: 0, skipped: slugs.length, totals: cache.totals };
  }
}

async function handleGetStats(): Promise<StatsResult> {
  await syncCache();
  const cache = await buildCachedState();
  try {
    const stats = await apiGet<StatsResponse>('/api/stats');
    apiOk = true;
    return { ok: true, stats, cache };
  } catch {
    apiOk = false;
    return { ok: false, stats: null, cache };
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
    apiOk = true;
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
    apiOk = false;
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
    apiOk = true;
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
    apiOk = false;
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
      resolveCache.clear();
      return chrome.storage.local
        .set({ [K_API_BASE]: msg.baseUrl.replace(/\/+$/, '') })
        .then(() => syncCache());
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
      ],
    },
  );
});
