import type { CanonicalKey, PageProblemMessage, SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createBanner, type BannerHandle } from '../../components/Banner';
import { sendMessage } from '../../lib/messaging';

interface Detection {
  key: CanonicalKey;
  title: string;
}

export default defineContentScript({
  matches: ['*://takeuforward.org/*'],
  runAt: 'document_idle',
  async main(ctx: ContentScriptContext) {
    let banner: BannerHandle | null = null;
    let currentKey: string | null = null;

    function leetcodeAnchor(): string | null {
      const a = document.querySelector<HTMLAnchorElement>(
        'main a[href*="leetcode.com/problems/"], article a[href*="leetcode.com/problems/"], a[href*="leetcode.com/problems/"]',
      );
      const m = a?.href.match(/leetcode\.com\/problems\/([^/?#]+)/);
      return m?.[1] ?? null;
    }

    function hasEditor(): boolean {
      return !!document.querySelector('.monaco-editor, .ace_editor, [class*="editor"] textarea');
    }

    /** Only banner on things that look like problem pages, never blog/articles.
     * Require a LeetCode anchor, a code editor, or a deep /plus/ path. */
    function isProblemPage(): boolean {
      if (leetcodeAnchor()) return true;
      if (hasEditor()) return true;
      const segs = location.pathname.split('/').filter(Boolean);
      if (segs[0] === 'plus' && segs.length >= 3) return true;
      return false;
    }

    function cleanTitle(): string {
      const h1 = document.querySelector('h1')?.textContent?.trim();
      const raw = h1 || document.title;
      return raw.replace(/\s*[-|]\s*take\s*u\s*forward.*$/i, '').trim() || raw;
    }

    function slugify(s: string): string {
      return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    async function detect(): Promise<Detection | null> {
      if (!isProblemPage()) return null;
      const title = cleanTitle();

      // (a) explicit LeetCode link in the problem content.
      const anchorSlug = leetcodeAnchor();
      if (anchorSlug) return { key: `lc:${anchorSlug}`, title };

      // (b) resolve the human title against the LeetCode catalog.
      if (title) {
        const resolved = await sendMessage({ type: 'RESOLVE', title });
        if (resolved.problem) {
          return { key: `lc:${resolved.problem.lcSlug}`, title: resolved.problem.title };
        }
      }

      // (c) fall back to a takeuforward-only key (separate counter).
      const segs = location.pathname.split('/').filter(Boolean);
      const last = segs[segs.length - 1] ?? '';
      const slug = slugify(last) || slugify(title);
      if (!slug) return null;
      return { key: `tuf:${slug}`, title: title || slug.replace(/-/g, ' ') };
    }

    function buildSolveRequest(det: Detection): SolveRequest {
      const isLc = det.key.startsWith('lc:');
      return {
        canonicalKey: det.key,
        lcSlug: isLc ? det.key.slice(3) : undefined,
        title: det.title,
        source: 'tuf',
        url: location.href,
        detected: 'manual',
      };
    }

    async function removeBanner() {
      banner?.remove();
      banner = null;
      currentKey = null;
    }

    async function ensureBanner(): Promise<BannerHandle> {
      if (!banner) banner = await createBanner(ctx, { state: { kind: 'queued' } });
      return banner;
    }

    async function check() {
      const det = await detect();
      if (!det) return removeBanner();
      // Avoid needless remounts when the same problem is re-detected.
      if (det.key === currentKey && banner) return;
      currentKey = det.key;

      const isLc = det.key.startsWith('lc:');
      const label = isLc ? 'Unique total' : 'Other total';
      const totalOf = (t: { lcUnique: number; other: number }) =>
        isLc ? t.lcUnique : t.other;

      const res = await sendMessage({ type: 'CHECK_PROBLEM', canonicalKey: det.key });
      const b = await ensureBanner();

      if (res.solved && res.entry) {
        b.update({
          state: {
            kind: 'already-solved',
            title: res.entry.title || det.title,
            source: res.entry.firstSource,
            date: res.entry.firstSolvedAt,
          },
          onClose: () => removeBanner(),
        });
        return;
      }

      const mark = async () => {
        b.update({ state: { kind: 'prompt', title: det.title, busy: true } });
        const payload = buildSolveRequest(det);
        const r = await sendMessage({ type: 'MARK_SOLVED', payload });
        if (r.queued) {
          b.update({ state: { kind: 'queued' }, onClose: () => removeBanner() });
        } else {
          b.update({
            state: { kind: 'recorded', isNew: r.isNew, total: totalOf(r.totals), label },
            onClose: () => removeBanner(),
          });
          ctx.setTimeout(() => removeBanner(), 5000);
        }
      };

      b.update({
        state: { kind: 'prompt', title: det.title },
        onMark: () => void mark(),
        onClose: () => removeBanner(),
      });
    }

    let debounce: ReturnType<typeof setTimeout> | undefined;
    function scheduleCheck() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void check(), 300);
    }

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if ((msg as PageProblemMessage)?.type === 'GET_PAGE_PROBLEM') {
        void detect()
          .then((det) => sendResponse(det ? buildSolveRequest(det) : null))
          .catch(() => sendResponse(null));
        return true;
      }
      if (msg?.type === 'ROUTE_CHANGED') {
        void removeBanner();
        scheduleCheck();
      }
      return false;
    });
    window.addEventListener('popstate', () => {
      void removeBanner();
      scheduleCheck();
    });

    // TUF+ is a client-side app: watch <title> changes as a route/content signal.
    const titleEl = document.querySelector('title');
    if (titleEl) {
      const obs = new MutationObserver(() => scheduleCheck());
      obs.observe(titleEl, { childList: true });
      ctx.onInvalidated(() => obs.disconnect());
    }

    scheduleCheck();
  },
});
