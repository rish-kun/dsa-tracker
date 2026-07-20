import type {
  BackfillResponse,
  BackfillRunResult,
  CachedState,
  CheckProblemResponse,
  ExtMessage,
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

async function apiGet<T>(path: string): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, { method: 'GET' });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
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
  if (!cache.keys.includes(payload.canonicalKey)) {
    cache.keys.push(payload.canonicalKey);
    cache.solved.unshift({
      canonicalKey: payload.canonicalKey,
      lcSlug: payload.lcSlug ?? null,
      title: payload.title,
      difficulty: null,
      firstSource: payload.source,
      firstSolvedAt: new Date().toISOString(),
    });
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

// ---------------------------------------------------------------------------
// backfill: run inside a leetcode.com tab so session cookies apply
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

/** Find an existing leetcode.com tab or create one. We use chrome.scripting on
 * this tab (not messaging a content script) because our content script only
 * matches /problems/* — a plain leetcode.com tab has no content script, but
 * executeScript can inject into any leetcode page where host permission holds. */
async function ensureLeetCodeTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: '*://leetcode.com/*' });
  let tab = tabs.find((t) => t.status === 'complete') ?? tabs[0];
  if (!tab) {
    tab = await chrome.tabs.create({ url: 'https://leetcode.com/', active: false });
  }
  if (tab.id === undefined) return null;
  await waitForTabComplete(tab.id);
  return tab;
}

async function handleRunBackfill(): Promise<BackfillRunResult> {
  try {
    const tab = await ensureLeetCodeTab();
    if (!tab || tab.id === undefined) {
      return { ok: false, error: 'Could not open a leetcode.com tab.' };
    }
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectAcSlugs,
    });
    const result = inj?.result as CollectResult | undefined;
    if (!result) return { ok: false, error: 'No response from leetcode.com.' };
    if (result.needLogin) {
      return { ok: false, error: 'Open leetcode.com and log in first.' };
    }
    if (result.error) return { ok: false, error: result.error };
    const slugs = result.slugs ?? [];
    const res = await apiPost<BackfillResponse>('/api/backfill', { slugs });
    apiOk = true;
    await syncCache();
    return {
      ok: true,
      imported: res.imported,
      skipped: res.skipped,
      totals: res.totals,
      collected: slugs.length,
    };
  } catch (e) {
    apiOk = false;
    return { ok: false, error: e instanceof Error ? e.message : 'Backfill failed.' };
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
    case 'SET_API_BASE':
      resolveCache.clear();
      return chrome.storage.local
        .set({ [K_API_BASE]: msg.baseUrl.replace(/\/+$/, '') })
        .then(() => syncCache());
    case 'RUN_BACKFILL':
      return handleRunBackfill();
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
