import {
  trackerDateKey,
  type ProblemTimeContext,
  type TimeSite,
} from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { sendMessage } from '../lib/messaging';

/**
 * Active-time meter. Deliberately NOT a site adapter: the solve entrypoints are
 * scoped to each site's `/problems/*` routes, but time spent reading an editorial,
 * a course page or a problem list is still practice time. This runs site-wide and
 * shares nothing with the detect → resolve → banner loop.
 *
 * It measures *attention*, not tab lifetime, and does so without asking for a new
 * permission: `visibilityState` covers the foreground tab, `hasFocus()` covers the
 * focused window, and an interaction deadline covers "the user actually left".
 * `chrome.idle` would give the last of those more cheaply but costs a permission.
 */

const TICK_MS = 5_000;
/** No interaction for this long means the user walked away from a visible tab. */
const IDLE_MS = 120_000;
/** Report this much accrued time before waiting for a flush trigger. */
const REPORT_SECONDS = 30;
/** Interaction stamping is a hot path on mousemove; once a second is plenty. */
const STAMP_THROTTLE_MS = 1_000;

function siteFromHostname(hostname: string): TimeSite | null {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'leetcode.com') return 'leetcode';
  if (host === 'neetcode.io') return 'neetcode';
  if (host === 'takeuforward.org') return 'tuf';
  if (host === 'geeksforgeeks.org' || host === 'practice.geeksforgeeks.org') return 'gfg';
  return null;
}

export default defineContentScript({
  // Site-wide, unlike the per-site solve scripts: every page on these hosts is
  // practice time. host_permissions already cover exactly this list.
  matches: [
    '*://leetcode.com/*',
    '*://neetcode.io/*',
    '*://takeuforward.org/*',
    '*://geeksforgeeks.org/*',
    '*://www.geeksforgeeks.org/*',
    '*://practice.geeksforgeeks.org/*',
  ],
  // Start before the problem adapters publish their first resolved context.
  // Accrual still begins on the first 5s tick and retains the same focus/idle
  // checks as before.
  runAt: 'document_start',
  main(ctx: ContentScriptContext) {
    const detected = siteFromHostname(location.hostname);
    if (!detected) return;
    // Re-bound so the narrowing survives into the closures below.
    const site: TimeSite = detected;

    type PendingSegment = {
      date: string;
      seconds: number;
      problem?: ProblemTimeContext;
    };

    /** Accrued seconds keyed by tracker day + problem. A blank problem part is
     * ordinary site-wide time. This prevents a navigation before flush from
     * folding two problems into one increment. */
    const pending = new Map<string, PendingSegment>();
    let currentProblem: ProblemTimeContext | null = null;
    let lastInteractionAt = Date.now();

    function problemIsValid(value: unknown): value is ProblemTimeContext {
      if (!value || typeof value !== 'object') return false;
      const problem = value as Partial<ProblemTimeContext>;
      return (
        typeof problem.canonicalKey === 'string' &&
        problem.canonicalKey.length > 0 &&
        typeof problem.title === 'string' &&
        typeof problem.url === 'string'
      );
    }

    function bucketKey(date: string, problem: ProblemTimeContext | null): string {
      return `${date}\u0000${problem?.canonicalKey ?? ''}`;
    }

    function stampInteraction(): void {
      const now = Date.now();
      if (now - lastInteractionAt < STAMP_THROTTLE_MS) return;
      lastInteractionAt = now;
    }

    for (const event of ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const) {
      // Passive + capture: never delay the host page's own scroll handling, and
      // still see interactions that a page stops from bubbling.
      ctx.addEventListener(window, event, stampInteraction, { passive: true, capture: true });
    }

    function isActive(): boolean {
      return (
        document.visibilityState === 'visible' &&
        document.hasFocus() &&
        Date.now() - lastInteractionAt < IDLE_MS
      );
    }

    function pendingSeconds(): number {
      let total = 0;
      for (const segment of pending.values()) total += segment.seconds;
      return total;
    }

    function flush(): Promise<void> {
      const sends: Promise<unknown>[] = [];
      for (const [key, segment] of [...pending]) {
        // The service worker treats a segment as an increment, so a zero (or a
        // negative from a clock jump) is never worth a message.
        if (segment.seconds <= 0) {
          pending.delete(key);
          continue;
        }
        try {
          pending.delete(key);
          sends.push(sendMessage({
            type: 'ACTIVITY',
            site,
            date: segment.date,
            seconds: segment.seconds,
            ...(segment.problem ? { problem: segment.problem } : {}),
          }).catch(() => {
            // A sleeping/updating service worker rejects the send. Put the time
            // back so the next flush carries it rather than losing the minute.
            const newer = pending.get(key);
            pending.set(key, {
              date: segment.date,
              seconds: (newer?.seconds ?? 0) + segment.seconds,
              // Prefer metadata learned after this send began when available.
              problem: newer?.problem ?? segment.problem,
            });
          }));
        } catch {
          // An invalidated context can throw synchronously. Time tracking is
          // decoration; it must never surface an error into the host page.
        }
      }
      return Promise.all(sends).then(() => undefined);
    }

    function switchProblem(problem: ProblemTimeContext | null): void {
      if (problem?.canonicalKey === currentProblem?.canonicalKey) {
        // Titles and canonical URLs can improve after a site's late render.
        currentProblem = problem;
        return;
      }
      // Send the old context's sub-threshold tail before subsequent ticks use
      // the new identity. Each message still carries its own identity, so an
      // asynchronous send cannot cross-attribute the increment.
      void flush();
      currentProblem = problem;
    }

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'PAGE_PROBLEM_CHANGED') {
        const next = msg.problem === null
          ? null
          : problemIsValid(msg.problem)
            ? msg.problem
            : null;
        switchProblem(next);
        return false;
      }
      if (msg?.type === 'FLUSH_ACTIVITY') {
        // A popup read waits until every tail increment has reached the
        // service-worker store, then its server flush cannot race ahead of us.
        void flush().then(() => sendResponse(undefined));
        return true;
      }
      if (msg?.type === 'ROUTE_CHANGED') {
        // This arrives in the same tab as the adapter notification and closes
        // even the tiny relay window before the adapter publishes null.
        switchProblem(null);
      }
      return false;
    });

    ctx.setInterval(() => {
      if (!isActive()) return;
      // Day key resolved at accrual time, not at flush time — that is what makes
      // the midnight split correct.
      const date = trackerDateKey();
      const key = bucketKey(date, currentProblem);
      const existing = pending.get(key);
      pending.set(key, {
        date,
        seconds: (existing?.seconds ?? 0) + TICK_MS / 1000,
        ...(currentProblem ? { problem: currentProblem } : {}),
      });
      if (pendingSeconds() >= REPORT_SECONDS) void flush();
    }, TICK_MS);

    // Flush the tail the moment attention leaves, so a tab that is backgrounded
    // (or a page that is bfcached) does not sit on up to 30s of unreported time.
    ctx.addEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
    ctx.addEventListener(window, 'blur', () => void flush());
    ctx.addEventListener(window, 'pagehide', () => void flush());
  },
});
