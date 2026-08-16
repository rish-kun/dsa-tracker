import { trackerDateKey, type TimeSite } from '@dsa-tracker/shared';
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
  runAt: 'document_idle',
  main(ctx: ContentScriptContext) {
    const detected = siteFromHostname(location.hostname);
    if (!detected) return;
    // Re-bound so the narrowing survives into the closures below.
    const site: TimeSite = detected;

    /** Accrued seconds keyed by tracker day, so a session that crosses midnight
     * splits across both days instead of landing wholly on the day it flushes. */
    const pending = new Map<string, number>();
    let lastInteractionAt = Date.now();

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
      for (const seconds of pending.values()) total += seconds;
      return total;
    }

    function flush(): void {
      for (const [date, seconds] of [...pending]) {
        // The service worker treats a segment as an increment, so a zero (or a
        // negative from a clock jump) is never worth a message.
        if (seconds <= 0) {
          pending.delete(date);
          continue;
        }
        try {
          pending.delete(date);
          void sendMessage({ type: 'ACTIVITY', site, date, seconds }).catch(() => {
            // A sleeping/updating service worker rejects the send. Put the time
            // back so the next flush carries it rather than losing the minute.
            pending.set(date, (pending.get(date) ?? 0) + seconds);
          });
        } catch {
          // An invalidated context can throw synchronously. Time tracking is
          // decoration; it must never surface an error into the host page.
        }
      }
    }

    ctx.setInterval(() => {
      if (!isActive()) return;
      // Day key resolved at accrual time, not at flush time — that is what makes
      // the midnight split correct.
      const date = trackerDateKey();
      pending.set(date, (pending.get(date) ?? 0) + TICK_MS / 1000);
      if (pendingSeconds() >= REPORT_SECONDS) flush();
    }, TICK_MS);

    // Flush the tail the moment attention leaves, so a tab that is backgrounded
    // (or a page that is bfcached) does not sit on up to 30s of unreported time.
    ctx.addEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    ctx.addEventListener(window, 'blur', () => flush());
    ctx.addEventListener(window, 'pagehide', () => flush());
  },
});
