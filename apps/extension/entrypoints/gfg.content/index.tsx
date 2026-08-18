import type { SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createSiteAdapterRunner,
  leetcodeSlugFromAnchor,
  resolveCatalog,
  slugify,
} from '../../lib/site-adapter';

function currentSlug(): string | null {
  return location.pathname.match(/^\/problems\/([^/?#]+)/)?.[1] ?? null;
}

function problemTitle(): string {
  const heading = document.querySelector('main h1, article h1, h1')?.textContent?.trim();
  const raw = heading || document.title;
  return raw
    .replace(/\s*[-|]\s*geeks(?:for)?geeks.*$/i, '')
    .replace(/^practice\s*[|:-]\s*/i, '')
    .trim() || raw;
}

export default defineContentScript({
  // Site-wide on each GFG host so SPA entry into /problems/<slug>/ can publish
  // problem-time context without requiring a document reload.
  matches: [
    '*://geeksforgeeks.org/*',
    '*://www.geeksforgeeks.org/*',
    '*://practice.geeksforgeeks.org/*',
  ],
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
        const title = problemTitle();
        const anchorSlug = leetcodeSlugFromAnchor(
          document,
          'main a[href*="leetcode.com/problems/"], article a[href*="leetcode.com/problems/"], [class*="problem"] a[href*="leetcode.com/problems/"]',
        );
        if (anchorSlug) {
          return {
            canonicalKey: `lc:${anchorSlug}`,
            lcSlug: anchorSlug,
            title,
            source: 'gfg',
            url: location.href,
            detected: 'manual',
          };
        }

        const resolved = await resolveCatalog({ title });
        // A lookup outage is not a catalog miss: avoid recording a gfg: key
        // that the next successful lookup would have upgraded to lc:.
        if (resolved.kind === 'unavailable') return null;
        if (resolved.kind === 'match') {
          return {
            canonicalKey: `lc:${resolved.lcSlug}`,
            lcSlug: resolved.lcSlug,
            title: resolved.title,
            source: 'gfg',
            url: location.href,
            detected: 'manual',
          };
        }

        const fallback = slugify(slug);
        if (!fallback) return null;
        return {
          canonicalKey: `gfg:${fallback}`,
          title: title || fallback.replace(/-/g, ' '),
          source: 'gfg',
          url: location.href,
          detected: 'manual',
        };
      },
    });

    runner.registerMessages();
    runner.scheduleCheck();
  },
});
