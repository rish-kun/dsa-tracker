import type { SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createBanner, type BannerHandle } from '../../components/Banner';
import { sendMessage } from '../../lib/messaging';

export default defineContentScript({
  matches: ['*://neetcode.io/problems/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx: ContentScriptContext) {
    let banner: BannerHandle | null = null;

    // NeetCode's /problems/<slug> is a 1:1 match with the LeetCode titleSlug.
    function currentSlug(): string | null {
      const m = location.pathname.match(/\/problems\/([^/?#]+)/);
      return m?.[1] ?? null;
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
      const slug = currentSlug();
      if (!slug) return removeBanner();
      const key = `lc:${slug}`;

      // Resolve only for a nicer display title/difficulty — parity holds regardless.
      const resolved = await sendMessage({ type: 'RESOLVE', slug });
      const displayTitle =
        resolved.problem?.title ?? slug.replace(/-/g, ' ');

      const res = await sendMessage({ type: 'CHECK_PROBLEM', canonicalKey: key });
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
          lcSlug: slug,
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
