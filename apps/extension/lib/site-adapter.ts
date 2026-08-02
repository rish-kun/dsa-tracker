import type { PageProblemMessage, SolveRequest, Totals } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createBanner, type BannerHandle } from '../components/Banner';
import { sendMessage, type MarkSolvedResult } from './messaging';

/** A successful catalog lookup, a genuine miss, or an unavailable resolver.
 *
 * The last state matters: callers must not turn a temporary API failure into a
 * permanent site-only key. `ResolveResponse.unavailable` is additive so older
 * servers are treated as normal misses until the authenticated API is rolled
 * out.
 */
export type CatalogResolution =
  | { kind: 'match'; lcSlug: string; title: string }
  | { kind: 'miss' }
  | { kind: 'unavailable' };

export interface SiteAdapter {
  /** Cheap synchronous route/DOM gate used before authenticated resolution. */
  isProblemPage?(): boolean;
  /** Return the current problem, or null when the route is not a problem. */
  detect(): Promise<SolveRequest | null>;
  /** LeetCode records accepted verdicts; other adapters render a manual CTA. */
  mode: 'auto' | 'manual';
  /** Label and value shown after a manual/automatic recording. */
  totalFor(payload: SolveRequest, totals: Totals): { label: string; total: number };
}

export interface SiteAdapterRunner {
  check(): Promise<void>;
  scheduleCheck(): void;
  removeBanner(): Promise<void>;
  /** Used by the popup's active-tab action without mounting UI. */
  getPageProblem(): Promise<SolveRequest | null>;
  /** Used by an auto-verdict hook, notably LeetCode's MAIN-world interceptor. */
  recordAuto(payload: SolveRequest): Promise<void>;
  /** Wire the standard GET_PAGE_PROBLEM and SPA route messages. */
  registerMessages(): void;
}

type AuthAware = { authState?: string };

function needsAuth(value: AuthAware | undefined): boolean {
  return value?.authState === 'missing-key' || value?.authState === 'invalid-key';
}

function authMessage(state: string | undefined): string {
  return state === 'invalid-key'
    ? 'Your extension API key is invalid or revoked. Update it in the extension popup.'
    : 'Add an extension API key in the popup to track solves.';
}

/**
 * The common content-script lifecycle. It intentionally owns every operation
 * that can race a SPA navigation: each check receives a monotonic run token,
 * and no result may mount/update a banner after a newer route has started.
 */
export function createSiteAdapterRunner(
  ctx: ContentScriptContext,
  adapter: SiteAdapter,
): SiteAdapterRunner {
  let banner: BannerHandle | null = null;
  let currentKey: string | null = null;
  let run = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  async function removeBanner(): Promise<void> {
    run += 1;
    banner?.remove();
    banner = null;
    currentKey = null;
  }

  async function ensureBanner(): Promise<BannerHandle> {
    if (!banner) banner = await createBanner(ctx, { state: { kind: 'queued' } });
    return banner;
  }

  function isCurrent(checkRun: number): boolean {
    return ctx.isValid && checkRun === run;
  }

  async function showNeedsAuth(checkRun: number, state?: string): Promise<void> {
    if (!isCurrent(checkRun)) return;
    const b = await ensureBanner();
    if (!isCurrent(checkRun)) return;
    b.update({
      state: { kind: 'needs-auth', message: authMessage(state) },
      onClose: () => void removeBanner(),
    });
  }

  async function showRecorded(
    payload: SolveRequest,
    result: MarkSolvedResult,
    checkRun: number,
  ): Promise<void> {
    if (!isCurrent(checkRun)) return;
    const auth = result as MarkSolvedResult & AuthAware;
    if (needsAuth(auth)) return showNeedsAuth(checkRun, auth.authState);
    const b = await ensureBanner();
    if (!isCurrent(checkRun)) return;
    if ((result as MarkSolvedResult & { rejected?: boolean }).rejected) {
      b.update({
        state: {
          kind: 'rejected',
          message: 'The server rejected this solve. Review the rejected writes in the extension popup.',
        },
        onClose: () => void removeBanner(),
      });
      return;
    }
    if (result.queued) {
      b.update({ state: { kind: 'queued' }, onClose: () => void removeBanner() });
      return;
    }
    const total = adapter.totalFor(payload, result.totals);
    b.update({
      state: { kind: 'recorded', isNew: result.isNew, ...total },
      onClose: () => void removeBanner(),
    });
    ctx.setTimeout(() => void removeBanner(), 5000);
  }

  async function mark(payload: SolveRequest, checkRun: number): Promise<void> {
    if (!isCurrent(checkRun)) return;
    const b = await ensureBanner();
    if (!isCurrent(checkRun)) return;
    b.update({ state: { kind: 'prompt', title: payload.title, busy: true } });
    const result = await sendMessage({ type: 'MARK_SOLVED', payload });
    await showRecorded(payload, result, checkRun);
  }

  async function check(): Promise<void> {
    const checkRun = ++run;
    if (adapter.isProblemPage && !adapter.isProblemPage()) {
      await removeBanner();
      return;
    }

    // Manual adapters often need the authenticated catalog resolver before
    // they can construct a canonical key. Check auth first so a missing or
    // revoked key still produces useful UI instead of looking like "not a
    // problem page" when resolution returns unavailable.
    const cached = await sendMessage({ type: 'GET_CACHE' });
    if (!isCurrent(checkRun)) return;
    if (needsAuth(cached)) {
      await showNeedsAuth(checkRun, cached.authState);
      return;
    }

    let payload: SolveRequest | null;
    try {
      payload = await adapter.detect();
    } catch {
      // Detection failures should be invisible rather than leaving a stale CTA.
      if (isCurrent(checkRun)) await removeBanner();
      return;
    }
    if (!isCurrent(checkRun)) return;
    if (!payload) {
      await removeBanner();
      return;
    }

    // Avoid remounting on incidental DOM mutations for the same active problem.
    if (payload.canonicalKey === currentKey && banner) return;
    currentKey = payload.canonicalKey;

    const status = await sendMessage({ type: 'CHECK_PROBLEM', canonicalKey: payload.canonicalKey });
    if (!isCurrent(checkRun)) return;
    if (needsAuth(status)) {
      await showNeedsAuth(checkRun, status.authState);
      return;
    }

    if (status.solved && status.entry) {
      const b = await ensureBanner();
      if (!isCurrent(checkRun)) return;
      b.update({
        state: {
          kind: 'already-solved',
          title: status.entry.title || payload.title,
          source: status.entry.firstSource,
          date: status.entry.firstSolvedAt,
        },
        onClose: () => void removeBanner(),
      });
      return;
    }

    if (adapter.mode === 'auto') {
      await removeBanner();
      return;
    }

    const b = await ensureBanner();
    if (!isCurrent(checkRun)) return;
    b.update({
      state: { kind: 'prompt', title: payload.title },
      onMark: () => void mark(payload, checkRun),
      onClose: () => void removeBanner(),
    });
  }

  function scheduleCheck(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void check(), 300);
  }

  async function recordAuto(payload: SolveRequest): Promise<void> {
    // A verdict belongs to the captured submission context, not necessarily the
    // current route. It gets its own run token, so route changes still cannot
    // let a delayed network result overwrite a newer banner.
    const checkRun = ++run;
    const result = await sendMessage({ type: 'MARK_SOLVED', payload });
    if (result.queued || result.isNew || needsAuth(result)) {
      await showRecorded(payload, result, checkRun);
    }
  }

  async function getPageProblem(): Promise<SolveRequest | null> {
    try {
      return await adapter.detect();
    } catch {
      return null;
    }
  }

  function registerMessages(): void {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if ((msg as PageProblemMessage)?.type === 'GET_PAGE_PROBLEM') {
        void getPageProblem().then(sendResponse);
        return true;
      }
      if (msg?.type === 'ROUTE_CHANGED' || msg?.type === 'AUTH_PROFILE_CHANGED') {
        void removeBanner();
        scheduleCheck();
      }
      return false;
    });
    window.addEventListener('popstate', () => {
      void removeBanner();
      scheduleCheck();
    });
  }

  return { check, scheduleCheck, removeBanner, getPageProblem, recordAuto, registerMessages };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function leetcodeSlugFromAnchor(
  root: ParentNode = document,
  selector = 'a[href*="leetcode.com/problems/"]',
): string | null {
  const anchor = root.querySelector<HTMLAnchorElement>(selector);
  return anchor?.href.match(/leetcode\.com\/problems\/([^/?#]+)/)?.[1] ?? null;
}

export async function resolveCatalog(input: {
  slug?: string;
  title?: string | null;
}): Promise<CatalogResolution> {
  try {
    const response = await sendMessage({
      type: 'RESOLVE',
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.title ? { title: input.title } : {}),
    });
    if (response.unavailable) return { kind: 'unavailable' };
    return response.problem
      ? { kind: 'match', lcSlug: response.problem.lcSlug, title: response.problem.title }
      : { kind: 'miss' };
  } catch {
    return { kind: 'unavailable' };
  }
}
