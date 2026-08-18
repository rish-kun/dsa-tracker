import type {
  ExtMessage,
  PageProblemMessage,
  ProblemTimeContext,
  SolveRequest,
  Totals,
} from '@dsa-tracker/shared';
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
  let publishedProblemSignature: string | undefined;
  let run = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function publishProblem(payload: SolveRequest | null): void {
    const problem = payload
      ? {
          canonicalKey: payload.canonicalKey,
          title: payload.title,
          url: payload.url,
        }
      : null;
    const signature = problem
      ? `${problem.canonicalKey}\u0000${problem.title}\u0000${problem.url}`
      : '';
    if (signature === publishedProblemSignature) return;
    publishedProblemSignature = signature;
    // The service worker relays this only to the activity content script in
    // the sender's tab. Page JavaScript never sees or controls the context.
    void chrome.runtime
      .sendMessage({ type: 'SET_PAGE_PROBLEM', problem } satisfies ExtMessage)
      .catch(() => {
        // Time attribution is decoration and must never affect solve UI.
        // Permit the next check to retry if the worker was being restarted.
        if (publishedProblemSignature === signature) publishedProblemSignature = undefined;
      });
  }

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
    const next = result.nextUp ?? undefined;
    b.update({
      state: { kind: 'recorded', isNew: result.isNew, ...total, next },
      onClose: () => void removeBanner(),
    });
    // The recorded card normally self-dismisses, but a next-problem link would
    // vanish before it can be clicked — keep it until closed or navigated away
    // (route changes remove the banner anyway).
    if (!next) ctx.setTimeout(() => void removeBanner(), 5000);
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
      publishProblem(null);
      await removeBanner();
      return;
    }

    // Detection runs alongside the cheap cache read. Deterministic identities
    // such as LeetCode can therefore publish problem-time context even before
    // an API key is configured, while resolver-dependent sites safely return
    // null during an outage instead of inventing a fallback key.
    let detectionFailed = false;
    const detection = adapter.detect().catch(() => {
      detectionFailed = true;
      return null;
    });
    const cached = await sendMessage({ type: 'GET_CACHE' });
    if (!isCurrent(checkRun)) return;
    if (needsAuth(cached)) {
      void detection.then((payload) => {
        if (isCurrent(checkRun)) publishProblem(payload);
      });
      await showNeedsAuth(checkRun, cached.authState);
      return;
    }

    const payload = await detection;
    if (detectionFailed) {
      // Detection failures should be invisible rather than leaving a stale CTA.
      if (isCurrent(checkRun)) {
        publishProblem(null);
        await removeBanner();
      }
      return;
    }
    if (!isCurrent(checkRun)) return;
    if (!payload) {
      publishProblem(null);
      await removeBanner();
      return;
    }
    publishProblem(payload);

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
    // nextUp: a repeat solve of an already-counted problem still deserves the
    // banner when there's a next-problem suggestion to show.
    if (result.queued || result.isNew || needsAuth(result) || result.nextUp) {
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
        // Clear synchronously so a slow resolver cannot attribute the new
        // route's next tick to the problem that was just left.
        publishProblem(null);
        void removeBanner();
        scheduleCheck();
      }
      return false;
    });
    window.addEventListener('popstate', () => {
      publishProblem(null);
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
