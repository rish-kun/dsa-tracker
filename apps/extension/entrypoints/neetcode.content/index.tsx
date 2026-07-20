import type { SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createBanner, type BannerHandle } from '../../components/Banner';
import { sendMessage } from '../../lib/messaging';

export default defineContentScript({
  matches: ['*://neetcode.io/problems/*'],
  runAt: 'document_idle',
  async main(ctx: ContentScriptContext) {
    let banner: BannerHandle | null = null;
    let checkRun = 0; // invalidates in-flight checks on route change

    // NeetCode editor slugs are NOT LeetCode titleSlugs (`duplicate-integer`
    // is LC's `contains-duplicate`), so identity comes from the displayed
    // problem title, resolved against the catalog. The URL slug is only a
    // fallback namespace (`nc:`) for NeetCode-only problems.
    function currentSlug(): string | null {
      const m = location.pathname.match(/\/problems\/([^/?#]+)/);
      return m?.[1] ?? null;
    }

    function titleFromDom(): string | null {
      // NeetCode keeps many modal headings in the DOM as h1 elements (for
      // example "Editor Settings"), so only trust the problem-title marker.
      const heading = document.querySelector('.problem-title');
      const t = heading?.textContent?.trim();
      if (t) return t;
      // Only accept the problem-title form ("Contains Duplicate - NeetCode").
      // The generic Angular shell title starts with "NeetCode | ..." and must
      // not end the wait before the problem data renders.
      const doc = document.title.match(/^(.+?)\s*[-|·]\s*NeetCode(?:\s.*)?$/i)?.[1]?.trim();
      if (doc && !/^neetcode\b/i.test(doc)) return doc;
      return null;
    }

    /** The page is an Angular SPA — the h1 can render well after idle. */
    async function waitForTitle(run: number, timeoutMs = 10_000): Promise<string | null> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline && ctx.isValid && run === checkRun) {
        const t = titleFromDom();
        if (t) return t;
        await new Promise((r) => setTimeout(r, 300));
      }
      return null;
    }

    async function removeBanner() {
      banner?.remove();
      banner = null;
    }

    async function ensureBanner(): Promise<BannerHandle> {
      if (!banner) banner = await createBanner(ctx, { state: { kind: 'queued' } });
      return banner;
    }

    async function check() {
      const run = ++checkRun;
      const slug = currentSlug();
      if (!slug) return removeBanner();

      const title = await waitForTitle(run);
      if (run !== checkRun) return;

      // Resolve identity: URL slug (in case it is a real LC slug), then title.
      let resolved = await sendMessage({ type: 'RESOLVE', slug });
      if (!resolved?.problem && title) {
        resolved = await sendMessage({ type: 'RESOLVE', title });
      }
      if (run !== checkRun) return;

      const problem = resolved?.problem ?? null;
      const key = problem ? `lc:${problem.lcSlug}` : `nc:${slug}`;
      const displayTitle = problem?.title ?? title ?? slug.replace(/-/g, ' ');

      const res = await sendMessage({ type: 'CHECK_PROBLEM', canonicalKey: key });
      if (run !== checkRun || !res) return;
      const b = await ensureBanner();

      if (res.solved && res.entry) {
        b.update({
          state: {
            kind: 'already-solved',
            title: res.entry.title || displayTitle,
            source: res.entry.firstSource,
            date: res.entry.firstSolvedAt,
          },
          onClose: () => removeBanner(),
        });
        return;
      }

      const mark = async () => {
        b.update({ state: { kind: 'prompt', title: displayTitle, busy: true } });
        const payload: SolveRequest = {
          canonicalKey: key,
          lcSlug: problem?.lcSlug,
          title: displayTitle,
          source: 'neetcode',
          url: location.href,
          detected: 'manual',
        };
        const r = await sendMessage({ type: 'MARK_SOLVED', payload });
        if (r.queued) {
          b.update({ state: { kind: 'queued' }, onClose: () => removeBanner() });
        } else {
          b.update({
            state: {
              kind: 'recorded',
              isNew: r.isNew,
              total: r.totals.lcUnique,
              label: 'Unique total',
            },
            onClose: () => removeBanner(),
          });
          ctx.setTimeout(() => removeBanner(), 5000);
        }
      };

      b.update({
        state: { kind: 'prompt', title: displayTitle },
        onMark: () => void mark(),
        onClose: () => removeBanner(),
      });
    }

    let debounce: ReturnType<typeof setTimeout> | undefined;
    function scheduleCheck() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void check(), 300);
    }

    // Angular SPA: react to history changes (via background) and popstate.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'ROUTE_CHANGED') {
        void removeBanner();
        scheduleCheck();
      }
    });
    window.addEventListener('popstate', () => {
      void removeBanner();
      scheduleCheck();
    });

    scheduleCheck();
  },
});
