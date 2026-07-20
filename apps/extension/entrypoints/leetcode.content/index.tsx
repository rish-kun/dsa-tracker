import type { SolveRequest } from '@dsa-tracker/shared';
import { injectScript } from 'wxt/utils/inject-script';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createBanner, type BannerHandle } from '../../components/Banner';
import { sendMessage } from '../../lib/messaging';

export default defineContentScript({
  matches: ['*://leetcode.com/problems/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx: ContentScriptContext) {
    // Inject the MAIN-world network interceptor as early as possible.
    injectScript('/leetcode-interceptor.js', { keepInDom: true }).catch(() => {});

    let banner: BannerHandle | null = null;
    const seenSubmissions = new Set<string>();
    let lastAutoMark = 0;

    function currentSlug(): string | null {
      const m = location.pathname.match(/\/problems\/([^/]+)/);
      return m?.[1] ?? null;
    }

    function cleanTitle(): string {
      return document.title.replace(/\s*[-|]\s*LeetCode.*$/i, '').trim() || document.title;
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
      const now = Date.now();
      if (submissionId) {
        if (seenSubmissions.has(submissionId)) return;
        seenSubmissions.add(submissionId);
      } else if (now - lastAutoMark < 5000) {
        // No id (graphql): guard against rapid duplicate signals.
        return;
      }
      lastAutoMark = now;

      const slug = currentSlug();
      if (!slug) return;
      const payload: SolveRequest = {
        canonicalKey: `lc:${slug}`,
        lcSlug: slug,
        title: cleanTitle(),
        source: 'leetcode',
        url: location.href,
        detected: 'auto',
      };
      const res = await sendMessage({ type: 'MARK_SOLVED', payload });
      if (res.queued) await showToast('queued');
      else if (res.isNew) await showToast('recorded', res.totals.lcUnique, true);
      // If not new, it was already counted — no toast needed.
    }

    // Relay accepted-submission signals from the MAIN-world interceptor.
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.source !== 'dsa-tracker-interceptor' || d.kind !== 'accepted') return;
      void onAccepted(d.submissionId ? String(d.submissionId) : null);
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
