import type { SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createSiteAdapterRunner, resolveCatalog } from '../../lib/site-adapter';

function currentSlug(): string | null {
  return location.pathname.match(/\/problems\/([^/?#]+)/)?.[1] ?? null;
}

function titleFromDom(): string | null {
  // Angular leaves modal h1s mounted, so only trust its problem heading.
  const heading = document.querySelector('.problem-title')?.textContent?.trim();
  if (heading) return heading;
  const fromTitle = document.title.match(/^(.+?)\s*[-|·]\s*NeetCode(?:\s.*)?$/i)?.[1]?.trim();
  return fromTitle && !/^neetcode\b/i.test(fromTitle) ? fromTitle : null;
}

async function waitForTitle(ctx: ContentScriptContext, timeoutMs = 10_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (ctx.isValid && Date.now() < deadline) {
    const title = titleFromDom();
    if (title) return title;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

export default defineContentScript({
  // Register across the site so navigating from /practice to /problems does
  // not require a document reload before the adapter can respond.
  matches: ['*://neetcode.io/*'],
  runAt: 'document_idle',
  async main(ctx: ContentScriptContext) {
    const runner = createSiteAdapterRunner(ctx, {
      mode: 'manual',
      isProblemPage: () => currentSlug() !== null,
      totalFor(payload, totals) {
        return payload.canonicalKey.startsWith('lc:')
          ? { label: 'Unique total', total: totals.lcUnique }
          : { label: 'Other total', total: totals.other };
      },
      async detect(): Promise<SolveRequest | null> {
        const slug = currentSlug();
        if (!slug) return null;

        const title = (await waitForTitle(ctx)) ?? titleFromDom();
        const bySlug = await resolveCatalog({ slug });
        // NeetCode slugs are not reliably LeetCode slugs, so title is the
        // second, authoritative lookup path (e.g. duplicate-integer).
        const resolved = bySlug.kind === 'match' || !title ? bySlug : await resolveCatalog({ title });
        if (resolved.kind === 'unavailable') return null;
        if (resolved.kind === 'match') {
          return {
            canonicalKey: `lc:${resolved.lcSlug}`,
            lcSlug: resolved.lcSlug,
            title: resolved.title,
            source: 'neetcode',
            url: location.href,
            detected: 'manual',
          };
        }
        return {
          canonicalKey: `nc:${slug}`,
          title: title ?? slug.replace(/-/g, ' '),
          source: 'neetcode',
          url: location.href,
          detected: 'manual',
        };
      },
    });

    runner.registerMessages();
    runner.scheduleCheck();
  },
});
