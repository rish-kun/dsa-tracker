import type { SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createSiteAdapterRunner } from '../../lib/site-adapter';

type ProblemContext = { slug: string; title: string; url: string };

function currentSlug(): string | null {
  return location.pathname.match(/\/problems\/([^/]+)/)?.[1] ?? null;
}

function cleanTitle(): string {
  return document.title.replace(/\s*[-|]\s*LeetCode.*$/i, '').trim() || document.title;
}

function captureProblemContext(submittedSlug?: string): ProblemContext | null {
  const routeSlug = currentSlug();
  const slug = submittedSlug || routeSlug;
  if (!slug) return null;
  const onSubmittedRoute = routeSlug === slug;
  return {
    slug,
    title: onSubmittedRoute
      ? cleanTitle()
      : slug
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' '),
    url: onSubmittedRoute ? location.href : `https://leetcode.com/problems/${slug}/`,
  };
}

function solveRequest(problem: ProblemContext, detected: 'auto' | 'manual'): SolveRequest {
  return {
    canonicalKey: `lc:${problem.slug}`,
    lcSlug: problem.slug,
    title: problem.title,
    source: 'leetcode',
    url: problem.url,
    detected,
  };
}

export default defineContentScript({
  // The separately manifest-registered MAIN-world interceptor relays submit
  // and verdict signals through window.postMessage. It intentionally remains
  // unchanged: only the isolated-world lifecycle is shared with other sites.
  // Site-wide so an SPA transition from the problem list into /problems/* can
  // publish problem-time context without requiring a document reload.
  matches: ['*://leetcode.com/*'],
  runAt: 'document_start',
  async main(ctx: ContentScriptContext) {
    const runner = createSiteAdapterRunner(ctx, {
      mode: 'auto',
      isProblemPage: () => currentSlug() !== null,
      totalFor(_payload, totals) {
        return { label: 'Unique total', total: totals.lcUnique };
      },
      async detect() {
        const problem = captureProblemContext();
        return problem ? solveRequest(problem, 'manual') : null;
      },
    });
    runner.registerMessages();

    const seenSubmissions = new Set<string>();
    const polledSubmissions = new Set<string>();
    const submissionContexts = new Map<string, ProblemContext>();
    let lastAutoMark = 0;

    async function onAccepted(submissionId: string | null): Promise<void> {
      const problem =
        (submissionId ? submissionContexts.get(submissionId) : null) ?? captureProblemContext();
      if (!problem) return;
      const now = Date.now();
      if (submissionId) {
        if (seenSubmissions.has(submissionId)) return;
        seenSubmissions.add(submissionId);
      } else if (now - lastAutoMark < 5000) {
        return;
      }
      lastAutoMark = now;
      await runner.recordAuto(solveRequest(problem, 'auto'));
    }

    /** Poll in the isolated world so LeetCode session cookies apply. Each id
     * retains its submit-time problem context, even after SPA navigation. */
    async function pollVerdict(submissionId: string): Promise<void> {
      if (polledSubmissions.has(submissionId)) return;
      polledSubmissions.add(submissionId);
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline && ctx.isValid) {
        try {
          const response = await fetch(
            `https://leetcode.com/submissions/detail/${submissionId}/check/`,
            { credentials: 'include' },
          );
          if (response.ok) {
            const verdict = await response.json();
            if (verdict?.state === 'SUCCESS') {
              if (verdict?.status_msg === 'Accepted') await onAccepted(submissionId);
              return;
            }
          }
        } catch {
          // A transient page-origin failure is retried until the deadline.
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }

    const onInterceptorMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== 'dsa-tracker-interceptor') return;
      const submittedSlug = typeof data.slug === 'string' && data.slug ? data.slug : undefined;
      if (data.kind === 'submitted' && data.submissionId) {
        const id = String(data.submissionId);
        const problem = captureProblemContext(submittedSlug);
        if (problem) submissionContexts.set(id, problem);
        void pollVerdict(id);
      } else if (data.kind === 'accepted') {
        const id = data.submissionId ? String(data.submissionId) : null;
        if (id && !submissionContexts.has(id)) {
          const problem = captureProblemContext(submittedSlug);
          if (problem) submissionContexts.set(id, problem);
        }
        void onAccepted(id);
      }
    };
    window.addEventListener('message', onInterceptorMessage);
    ctx.onInvalidated(() => window.removeEventListener('message', onInterceptorMessage));

    runner.scheduleCheck();
  },
});
