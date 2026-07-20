import type { SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createBanner, type BannerHandle } from '../../components/Banner';
import { sendMessage } from '../../lib/messaging';

export default defineContentScript({
  // The MAIN-world interceptor (leetcode-main.content.ts) is registered
  // separately in the manifest and relays signals via window.postMessage.
  matches: ['*://leetcode.com/problems/*'],
  runAt: 'document_start',
  async main(ctx: ContentScriptContext) {
    type ProblemContext = {
      slug: string;
      title: string;
      url: string;
    };

    let banner: BannerHandle | null = null;
    const seenSubmissions = new Set<string>();
    const submissionContexts = new Map<string, ProblemContext>();
    let lastAutoMark = 0;

    function currentSlug(): string | null {
      const m = location.pathname.match(/\/problems\/([^/]+)/);
      return m?.[1] ?? null;
    }

    function cleanTitle(): string {
      return document.title.replace(/\s*[-|]\s*LeetCode.*$/i, '').trim() || document.title;
    }

    function captureProblemContext(submittedSlug?: string): ProblemContext | null {
      const routeSlug = currentSlug();
      const slug = submittedSlug || routeSlug;
      if (!slug) return null;

      const isSubmittedRoute = routeSlug === slug;
      return {
        slug,
        title: isSubmittedRoute
          ? cleanTitle()
          : slug
              .split('-')
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(' '),
        url: isSubmittedRoute ? location.href : `https://leetcode.com/problems/${slug}/`,
      };
    }

    async function removeBanner() {
      banner?.remove();
      banner = null;
    }

    async function ensureBanner(): Promise<BannerHandle> {
      if (!banner) {
        banner = await createBanner(ctx, { state: { kind: 'queued' } });
      }
      return banner;
    }

    async function check() {
      const slug = currentSlug();
      if (!slug) return removeBanner();
      const res = await sendMessage({ type: 'CHECK_PROBLEM', canonicalKey: `lc:${slug}` });
      if (res.solved && res.entry) {
        const b = await ensureBanner();
        b.update({
          state: {
            kind: 'already-solved',
            title: res.entry.title,
            source: res.entry.firstSource,
            date: res.entry.firstSolvedAt,
          },
          onClose: () => removeBanner(),
        });
      } else {
        // LeetCode is auto-detect only — no prompt banner for unsolved problems.
        await removeBanner();
      }
    }

    async function showToast(kind: 'recorded' | 'queued', total = 0, isNew = true) {
      const b = await ensureBanner();
      b.update({
        state:
          kind === 'queued'
            ? { kind: 'queued' }
            : { kind: 'recorded', isNew, total, label: 'Unique total' },
        onClose: () => removeBanner(),
      });
      ctx.setTimeout(() => removeBanner(), 5000);
    }

    async function onAccepted(submissionId: string | null) {
      const problem =
        (submissionId ? submissionContexts.get(submissionId) : null) ?? captureProblemContext();
      if (!problem) return;

      const now = Date.now();
      if (submissionId) {
        if (seenSubmissions.has(submissionId)) return;
        seenSubmissions.add(submissionId);
      } else if (now - lastAutoMark < 5000) {
        // No id (graphql): guard against rapid duplicate signals.
        return;
      }
      lastAutoMark = now;

      const payload: SolveRequest = {
        canonicalKey: `lc:${problem.slug}`,
        lcSlug: problem.slug,
        title: problem.title,
        source: 'leetcode',
        url: problem.url,
        detected: 'auto',
      };
      const res = await sendMessage({ type: 'MARK_SOLVED', payload });
      if (res.queued) await showToast('queued');
      else if (res.isNew) await showToast('recorded', res.totals.lcUnique, true);
      // If not new, it was already counted — no toast needed.
    }

    /**
     * Actively poll the verdict for a submission id caught by the interceptor.
     * Content-script fetches run against the page origin, so first-party
     * session cookies apply. This is the primary detection path — it works
     * regardless of how the page itself transports its result (fetch, XHR
     * that got unwrapped, websocket, ...).
     */
    const polledSubmissions = new Set<string>();
    async function pollVerdict(submissionId: string) {
      if (polledSubmissions.has(submissionId)) return;
      polledSubmissions.add(submissionId);
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline && ctx.isValid) {
        try {
          const res = await fetch(
            `https://leetcode.com/submissions/detail/${submissionId}/check/`,
            { credentials: 'include' },
          );
          if (res.ok) {
            const json = await res.json();
            if (json?.state === 'SUCCESS') {
              if (json?.status_msg === 'Accepted') void onAccepted(submissionId);
              return; // terminal verdict (accepted or not) — stop polling
            }
          }
        } catch {
          // transient network error — keep polling until the deadline
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    // Signals from the MAIN-world interceptor.
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.source !== 'dsa-tracker-interceptor') return;
      if (d.kind === 'submitted' && d.submissionId) {
        const submissionId = String(d.submissionId);
        const problem = captureProblemContext(
          typeof d.slug === 'string' && d.slug ? d.slug : undefined,
        );
        if (problem) submissionContexts.set(submissionId, problem);
        void pollVerdict(submissionId);
      } else if (d.kind === 'accepted') {
        const submissionId = d.submissionId ? String(d.submissionId) : null;
        if (submissionId && !submissionContexts.has(submissionId)) {
          const problem = captureProblemContext(
            typeof d.slug === 'string' && d.slug ? d.slug : undefined,
          );
          if (problem) submissionContexts.set(submissionId, problem);
        }
        void onAccepted(submissionId);
      }
    });

    // Debounced re-check on SPA route changes.
    let debounce: ReturnType<typeof setTimeout> | undefined;
    function scheduleCheck() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void check(), 300);
    }

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'ROUTE_CHANGED') {
        void removeBanner();
        scheduleCheck();
      }
    });

    scheduleCheck();
  },
});
