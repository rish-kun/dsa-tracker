# Roadmap v2 — more platforms, and per-user auth

> **Planning document. Nothing here has been built, and no database command in
> this doc has been run.** It describes two initiatives, the concrete work each
> one implies against files that exist today, and the decisions that must be
> made by a human before any of it starts.

Repo root for every path in this doc: `/Users/rishit/Coding/dsa-merged`.

---

## Contents

- [0. Current state](#0-current-state)
- [1. Initiative A — support more DSA platforms](#1-initiative-a--support-more-dsa-platforms)
  - [A.1 Goals / non-goals](#a1-goals--non-goals)
  - [A.2 What the three existing content scripts actually share](#a2-what-the-three-existing-content-scripts-actually-share)
  - [A.3 Design: the `SiteAdapter` contract](#a3-design-the-siteadapter-contract)
  - [A.4 Refactoring `tuf.content` onto the adapter](#a4-refactoring-tufcontent-onto-the-adapter)
  - [A.5 Candidate platforms, in priority order](#a5-candidate-platforms-in-priority-order)
  - [A.6 The hard problem: cross-platform identity and the counter](#a6-the-hard-problem-cross-platform-identity-and-the-counter)
  - [A.7 Contract surface that must change](#a7-contract-surface-that-must-change)
  - [A.8 Phased steps](#a8-phased-steps)
  - [A.9 Risks](#a9-risks)
  - [A.10 Open questions](#a10-open-questions)
- [2. Initiative B — Clerk auth and per-user data](#2-initiative-b--clerk-auth-and-per-user-data)
  - [B.1 Goals / non-goals](#b1-goals--non-goals)
  - [B.2 Schema migration](#b2-schema-migration)
  - [B.3 Every query that becomes wrong without a user filter](#b3-every-query-that-becomes-wrong-without-a-user-filter)
  - [B.4 The extension is the hard part](#b4-the-extension-is-the-hard-part)
  - [B.5 Securing `/api/*` and what happens to CORS](#b5-securing-api-and-what-happens-to-cors)
  - [B.6 Clerk + Next 16 App Router specifics](#b6-clerk--next-16-app-router-specifics)
  - [B.7 RLS: app layer or Postgres?](#b7-rls-app-layer-or-postgres)
  - [B.8 Rollout sequencing](#b8-rollout-sequencing)
  - [B.9 What breaks for the single existing user](#b9-what-breaks-for-the-single-existing-user)
  - [B.10 Risks](#b10-risks)
  - [B.11 Open questions](#b11-open-questions)
- [3. Cross-cutting: extension/web version skew](#3-cross-cutting-extensionweb-version-skew)
- [4. Suggested order of execution](#4-suggested-order-of-execution)
- [5. Decision log to fill in](#5-decision-log-to-fill-in)

---

## 0. Current state

A four-workspace pnpm monorepo (`apps/web`, `apps/extension`, `packages/shared`,
`packages/plan-data`) implementing a **single-user, zero-auth** DSA tracker.

**Identity model.** Everything dedupes on a canonical key. `lc:<titleSlug>` is
the primary counter; `nc:` / `tuf:` / `gfg:` are the "no LeetCode equivalent"
namespaces. The union lives in `packages/shared/src/index.ts` as `CanonicalKey`,
and the server validates with one regex in `apps/web/app/api/solve/route.ts`:

```ts
const KEY_RE = /^(lc|tuf|gfg):[a-z0-9][a-z0-9-]*$|^nc:[A-Za-z0-9][A-Za-z0-9-]*$/;
```

`gfg:` is in both the type and the regex, **but nothing in the codebase ever
produces one** (verified: the only three hits for `gfg` repo-wide are the type,
the regex, and a doc comment). There is no `--pt-src-gfg` token and no entry in
`SourceBadge`'s `CLASS` map or `format.ts`'s `SOURCE_LABEL`.

**Six tables** (`apps/web/src/db/schema.ts`):

| table | PK | scope |
| --- | --- | --- |
| `problems` | `lc_slug` | global reference data (LeetCode catalog, ~4k rows) |
| `solved_problems` | `canonical_key` | **this table is the counter** |
| `solve_events` | `id` bigserial | append-only audit log |
| `plan_checks` | `check_id` | explicit manual overrides only |
| `plan_days` | `date` (text `YYYY-MM-DD`) | one row per plan day |
| `plan_counters` | `id`, always the literal `'singleton'` | manual counters |

Migrations `0000_charming_red_hulk`, `0001_easy_toxin` (the three `plan_*`
tables), `0002_curly_bloodstorm` (index rework) exist in
`apps/web/drizzle/`. Per `docs/RUNBOOK.md`, **none of them has been applied to
any database.**

**Seven API routes**, all `force-dynamic`: `/api/solve`, `/api/solved`,
`/api/resolve`, `/api/backfill`, `/api/import`, `/api/stats`,
`/api/catalog/refresh`. `apps/web/proxy.ts` (Next 16's rename of
`middleware.ts`) sets `Access-Control-Allow-Origin: *` on `/api/:path*`. There
is no authentication anywhere, on any route.

**Plan mutations do not use `/api/*`.** `apps/web/app/plan/actions.ts` is eight
Server Actions wrapping `apps/web/src/lib/plan-state.ts`. Reads there never
throw; writes deliberately do.

**Extension.** WXT/MV3. Content scripts detect, the service worker
(`apps/extension/entrypoints/background.ts`) is the only thing that talks to the
API (host permissions sidestep CORS). It owns a `chrome.storage.local` cache
(`solvedCache`) and an offline write queue (`pendingSolves`). Three per-site
scripts: `leetcode.content/` (+ the MAIN-world interceptor
`leetcode-main.content.ts`), `neetcode.content/`, `tuf.content/`. The API base
URL is user-configurable from the popup (`SET_API_BASE`), defaulting to
`http://localhost:3000`.

**Deployment asymmetry.** `apps/web` deploys to Vercel (root directory
`apps/web`, so `apps/web/vercel.json` is the only one read). The extension is
loaded unpacked or self-zipped — **there is no auto-update channel**. Web and
extension are therefore always potentially version-skewed, and
`packages/shared` is the contract between them.

---

## 1. Initiative A — support more DSA platforms

### A.1 Goals / non-goals

**Goals**

1. Adding a site becomes a bounded, repeatable unit of work — one adapter object
   plus manifest entries — instead of a ~200-line bespoke content script.
2. Produce `gfg:` keys for the first time, closing the namespace that already
   exists in the contract.
3. Extend coverage to platforms with no LeetCode equivalent (Codeforces,
   AtCoder) **without** silently corrupting the meaning of the headline "unique
   solved" number.
4. Prefer bulk import over per-solve detection wherever a platform offers an
   enumerable list of solved problems — it is strictly cheaper and more reliable
   than DOM/network interception.

**Non-goals**

- Auto-detecting a verdict on every platform. Manual "mark as solved" is an
  acceptable v1 for any site (that is what NeetCode and TUF do today).
- Making non-LeetCode platforms feed the `lc:` counter. See [A.6](#a6-the-hard-problem-cross-platform-identity-and-the-counter).
- Touching `packages/plan-data` — the plan's `canonicalKey` values are all `lc:`
  and are unaffected.

### A.2 What the three existing content scripts actually share

Read side by side, `leetcode.content/index.tsx` (214 lines),
`neetcode.content/index.tsx` (168) and `tuf.content/index.tsx` (193) are ~70%
the same program. The genuinely common machinery:

| concern | leetcode | neetcode | tuf |
| --- | --- | --- | --- |
| slug from `location.pathname` | `currentSlug()` regex | `currentSlug()` regex | last path segment |
| clean display title | `cleanTitle()` (strips `- LeetCode`) | `titleFromDom()` (`.problem-title`, rejects shell title) | `cleanTitle()` (strips `take u forward`) |
| wait for a late-rendering title | not needed | `waitForTitle()` 10s poll | implicit |
| resolve identity | slug **is** the LC slug | `RESOLVE` by slug → by title | LC anchor → `RESOLVE` by title |
| fallback namespace | none | `nc:<slug>` | `tuf:<slug>` |
| banner mount/unmount | `ensureBanner` / `removeBanner` | identical | identical |
| already-solved path | `CHECK_PROBLEM` → `already-solved` card | identical | identical |
| mark path | auto only | `MARK_SOLVED` → `recorded`/`queued` | identical |
| stale-run guard | `seenSubmissions` set | `checkRun` token | `currentKey` compare |
| route changes | `ROUTE_CHANGED` | `ROUTE_CHANGED` + `popstate` | `ROUTE_CHANGED` + `popstate` + `<title>` MutationObserver |
| debounce | 300 ms | 300 ms | 300 ms |
| `GET_PAGE_PROBLEM` responder | sync | async | async |
| totals label | `'Unique total'` | `'Unique total'` | `isLc ? 'Unique total' : 'Other total'` |

The only genuinely site-specific parts are: **the slug/title extraction**, **the
resolution order**, **the fallback namespace**, **whether detection is automatic
or manual**, and **which extra route signals to listen for**. Everything else is
boilerplate that has already drifted between the three (the TUF script has a
`currentKey` remount guard the others lack; the NeetCode script has a
`checkRun` invalidation token the others lack — both are bugfixes that were
never backported).

### A.3 Design: the `SiteAdapter` contract

New file `apps/extension/lib/site-adapter.ts`, exporting the type plus a runner.
Nothing about this touches `packages/shared` — it is an internal extension
abstraction.

```ts
// apps/extension/lib/site-adapter.ts
import type { Source, SolveRequest } from '@dsa-tracker/shared';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

/** One resolution attempt. Returns null to fall through to the next strategy. */
export type Resolver = (page: PageContext) => Promise<ResolvedIdentity | null>;

export interface PageContext {
  /** Site-native slug for the current page, or null if this is not a problem page. */
  slug: string | null;
  /** Display title once it has settled, or null if it never did. */
  title: string | null;
  url: string;
}

export interface ResolvedIdentity {
  canonicalKey: string;
  /** Set only when the identity is a real LeetCode catalog hit. */
  lcSlug?: string;
  title: string;
}

export interface SiteAdapter {
  /** Matches the `Source` union in packages/shared. */
  readonly source: Source;

  /** Namespace prefix used when no LeetCode identity can be established.
   *  `null` means "this site is LeetCode-native, there is no fallback". */
  readonly fallbackNamespace: 'nc' | 'tuf' | 'gfg' | 'cf' | 'cc' | 'hr' | 'ac' | null;

  /** 'auto' suppresses the prompt banner (LeetCode); 'manual' shows it. */
  readonly detection: 'auto' | 'manual';

  /** Site-native slug for the current URL, or null if not a problem page. */
  slug(): string | null;

  /** Extra gate for sites whose problem pages are not identifiable by URL alone
   *  (TUF: `isProblemPage()`). Defaults to `() => true`. */
  isProblemPage?(): boolean;

  /** Display title from the DOM, or null if it has not rendered yet. Returning
   *  null makes the runner poll until `titleTimeoutMs`. */
  title(): string | null;
  readonly titleTimeoutMs?: number; // default 0 = do not wait

  /** Ordered resolution strategies. First non-null wins. The runner appends the
   *  `fallbackNamespace` strategy itself — adapters never build that key. */
  readonly resolvers: Resolver[];

  /** Extra route-change signals beyond ROUTE_CHANGED + popstate.
   *  Return a teardown; the runner wires it to ctx.onInvalidated. */
  watchRouteChanges?(ctx: ContentScriptContext, recheck: () => void): () => void;

  /** Optional automatic-verdict wiring (LeetCode's MAIN-world relay). Calls
   *  `record(payload)` when a verdict is confirmed accepted. */
  watchVerdicts?(
    ctx: ContentScriptContext,
    record: (payload: SolveRequest) => Promise<void>,
  ): void;
}

/** Everything the three scripts duplicate today, exactly once. */
export function createSiteContentScript(adapter: SiteAdapter): (ctx: ContentScriptContext) => Promise<void>;
```

The runner owns, once:

- the 300 ms `scheduleCheck` debounce;
- a monotonic `run` token (NeetCode's `checkRun`) so an in-flight resolve on the
  old route can never mark the new one — this is the bug that only one of the
  three scripts currently guards against;
- the `currentKey` remount guard (TUF's);
- `ensureBanner` / `removeBanner` and the `already-solved` / `prompt` /
  `recorded` / `queued` state machine;
- `chrome.runtime.onMessage` for `ROUTE_CHANGED` and `GET_PAGE_PROBLEM`,
  plus `popstate`;
- picking the totals label from `canonicalKey.startsWith('lc:')` — today
  hardcoded to `'Unique total'` in two of three scripts, which is already wrong
  for a NeetCode-only `nc:` problem.

Three reusable resolvers ship with it:

```ts
export const resolvers = {
  /** LeetCode-native: the site slug IS the titleSlug. */
  identitySlug: (): Resolver => ...,
  /** An embedded leetcode.com/problems/<slug> anchor (TUF, GFG article pages). */
  embeddedLeetcodeAnchor: (selector?: string): Resolver => ...,
  /** RESOLVE by site slug, then by display title (NeetCode's two-step). */
  catalogLookup: (opts?: { bySlug?: boolean; byTitle?: boolean }): Resolver => ...,
};
```

**Estimated cost of a new manual-only site after this lands:** an adapter file
of roughly 30–50 lines, a `defineContentScript` wrapper, one `host_permissions`
entry, one `hostEquals` entry in `background.ts`'s
`webNavigation.onHistoryStateUpdated` filter, one `Source` union member, one
`SOURCES` set member server-side, one `KEY_RE` alternation, one badge colour
token, and one label. That list is the real answer to "what does adding a site
cost".

### A.4 Refactoring `tuf.content` onto the adapter

TUF is the best first refactor target: it already has all three resolution
stages, a non-trivial page gate, and the extra `<title>` MutationObserver, so it
exercises every optional hook.

```ts
// apps/extension/entrypoints/tuf.content/index.tsx  (after)
import { createSiteContentScript, resolvers, type SiteAdapter } from '../../lib/site-adapter';

const tuf: SiteAdapter = {
  source: 'tuf',
  fallbackNamespace: 'tuf',
  detection: 'manual',

  slug: () => location.pathname.split('/').filter(Boolean).at(-1) ?? null,

  isProblemPage() {
    if (document.querySelector('a[href*="leetcode.com/problems/"]')) return true;
    if (document.querySelector('.monaco-editor, .ace_editor, [class*="editor"] textarea')) return true;
    const segs = location.pathname.split('/').filter(Boolean);
    return segs[0] === 'plus' && segs.length >= 3;
  },

  title() {
    const raw = document.querySelector('h1')?.textContent?.trim() || document.title;
    return raw.replace(/\s*[-|]\s*take\s*u\s*forward.*$/i, '').trim() || raw;
  },

  resolvers: [
    resolvers.embeddedLeetcodeAnchor(
      'main a[href*="leetcode.com/problems/"], article a[href*="leetcode.com/problems/"], a[href*="leetcode.com/problems/"]',
    ),
    resolvers.catalogLookup({ byTitle: true }),
  ],

  watchRouteChanges(ctx, recheck) {
    const titleEl = document.querySelector('title');
    if (!titleEl) return () => {};
    const obs = new MutationObserver(() => recheck());
    obs.observe(titleEl, { childList: true });
    return () => obs.disconnect();
  },
};

export default defineContentScript({
  matches: ['*://takeuforward.org/*'],
  runAt: 'document_idle',
  main: createSiteContentScript(tuf),
});
```

193 lines → ~45, and the run-token fix arrives for free. Refactor order:
**tuf → neetcode → leetcode**. LeetCode goes last because it is the only user of
`watchVerdicts` and the only `detection: 'auto'` site; getting it wrong silently
stops the auto-detection that is the product's whole point. Its MAIN-world
script `leetcode-main.content.ts` stays exactly as it is — the adapter only
consumes the `window.postMessage` relay and the
`/submissions/detail/<id>/check/` polling loop, which move behind
`watchVerdicts` unchanged.

**Do this refactor before adding any new site.** Adding GFG first and
refactoring later means writing the boilerplate a fourth time and then unpicking
four scripts instead of three.

### A.5 Candidate platforms, in priority order

| # | platform | maps to `lc:`? | auto-detect | bulk import | verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | **GeeksforGeeks** | partially | feasible | feasible | do first |
| 2 | **Codeforces** | never | unnecessary | **free, no auth** | do second |
| 3 | **AtCoder** | never | unnecessary | free (third-party API) | reuses #2's machinery |
| 4 | **HackerRank** | partially | feasible | feasible (session) | medium cost |
| 5 | **CodeChef** | never | hard | scrape-only | low value, high fragility |
| 6 | **InterviewBit** | mostly | hard | none | last |

---

**1. GeeksforGeeks** — `www.geeksforgeeks.org/problems/<slug>/1`

- *LeetCode equivalence:* mixed. A large fraction of the GFG "must-do" set are
  the same problems as LeetCode classics under different titles ("Kadane's
  Algorithm" ≈ `maximum-subarray`), but titles differ enough that
  `resolveCatalogProblem`'s normalized-title match will hit maybe half. The
  other half are genuinely GFG-only. So: **`lc:` when the catalog resolves,
  `gfg:` otherwise** — exactly the NeetCode/TUF pattern, which is why this is
  the cheapest first site.
- *Auto-detect:* feasible. The practice IDE submits over XHR and polls a result
  endpoint, so the `leetcode-main.content.ts` MAIN-world `fetch`/`XHR` wrapper
  technique transfers directly. **Defer it** — ship manual first, add
  `watchVerdicts` later once the endpoint shapes are confirmed against the live
  site.
- *Bulk import:* a signed-in user's public profile page renders their solved
  problem list. Same technique as `handleRunBackfill` /
  `handleRunNcImport`: `chrome.scripting.executeScript` into a
  `geeksforgeeks.org` tab so first-party cookies apply, collect slugs, POST them.
  Would need a `/api/import`-shaped endpoint or a widened `ImportRequest`
  carrying a namespace (see [A.7](#a7-contract-surface-that-must-change)) —
  today `/api/import` hardcodes `firstSource: 'neetcode'` and the `nc:` fallback
  in ~6 places.
- *Why first:* it closes an already-declared namespace, it needs zero new
  identity concepts, and it is the direct analogue of an existing site.
- *Gotcha:* the same GFG "problem" appears under both `practice.geeksforgeeks.org`
  and `www.geeksforgeeks.org/problems/...` historically. Normalize to a single
  host before building the slug, or the same problem gets two `gfg:` rows.

---

**2. Codeforces** — the cheapest platform to support, and the one that forces
the counter decision.

- *LeetCode equivalence:* **none, ever.** Codeforces problems are contest
  problems; there is no LeetCode counterpart to map to. Every solve lands in a
  new `cf:` namespace.
- *Key shape:* `cf:<contestId>-<index>` (e.g. `cf:1352-a`). Lowercased so it
  fits the existing `[a-z0-9][a-z0-9-]*` pattern class in `KEY_RE`.
- *Auto-detect:* **don't bother.** Codeforces has a **public, unauthenticated,
  read-only API**: `https://codeforces.com/api/user.status?handle=<handle>`
  returns every submission with its verdict. One request enumerates the entire
  solve history, filtered to `verdict === 'OK'`. This is dramatically better
  than intercepting a verdict in the page.
- *Consequence — this is an architectural decision, not a detail:* because the
  API needs no session, the import **does not have to run in the extension at
  all**. The server can poll it. That means either
  (a) a new `/api/cron/codeforces` route hit by a Vercel cron with a
  `CRON_SECRET` header, or (b) a Server Action on a settings page, or
  (c) keep it extension-driven for consistency. CLAUDE.md is explicit that
  `/api/*` is the extension's contract and that there are "exactly 7" routes;
  option (a) breaks that invariant deliberately and should be a conscious
  choice. **Recommendation: (b) then (a)** — a Server Action "Sync Codeforces"
  button on a settings page first (no new API surface, no secret to manage),
  promoted to a cron route only if the user wants it hands-off.
- *Storage:* needs a place to put the user's Codeforces handle. Pre-auth that is
  an env var; post-auth it is a `user_settings` row. This is a small but real
  argument for doing Initiative B first, or at least designing the settings
  table now.

---

**3. AtCoder** — structurally identical to Codeforces, so it should be built
immediately after, reusing the same poller.

- *LeetCode equivalence:* none. Namespace `ac:`, key `ac:<contest>-<task>`
  (e.g. `ac:abc300-c`).
- *Bulk import:* AtCoder has no official API, but the widely-used community
  service **AtCoder Problems** (`kenkoooo`) exposes
  `/atcoder/atcoder-api/results?user=<handle>`, returning every submission with
  its result. Same shape as `user.status`. Risk: it is a third-party service
  with its own rate limits and no uptime guarantee — treat a failure as a
  no-op sync, never as data loss.
- *Auto-detect:* not worth it for the same reason as Codeforces.

---

**4. HackerRank**

- *LeetCode equivalence:* partial. The "Interview Preparation Kit" overlaps
  LeetCode heavily by title; the contest/domain problems do not. Same
  resolve-then-fall-back pattern → `hr:` fallback.
- *Auto-detect:* feasible via the MAIN-world interceptor (submissions are
  created and polled over JSON endpoints), but the site is heavily A/B tested
  and the endpoints move. Manual first.
- *Bulk import:* the site exposes JSON submission listings to a logged-in
  session (`/rest/contests/master/submissions/?offset=&limit=`), which is
  exactly the `collectAcSlugs` pattern — paginate inside a hackerrank.com tab
  via `chrome.scripting.executeScript`, dedupe to accepted-only, POST.
- *Cost:* medium. One adapter + one collector, both patterned on existing code.

---

**5. CodeChef**

- *LeetCode equivalence:* none (contest problems). Namespace `cc:`.
- *Auto-detect:* hard; the judge result arrives over a polling endpoint that has
  changed repeatedly.
- *Bulk import:* no dependable public API. The public profile page lists solved
  problem codes in HTML; scraping it inside a codechef.com tab works but is the
  most brittle option in this list.
- *Verdict:* only do this if the user actually uses CodeChef. Otherwise skip.

---

**6. InterviewBit**

- *LeetCode equivalence:* high (its problem set is largely classic interview
  problems), so most solves would resolve to `lc:` — which makes it *valuable
  per problem* but only if detection works.
- *Detection:* an authenticated SPA with no public API and no stable DOM
  contract; the same category of risk CLAUDE.md already flags for TUF+ ("written
  from research, not against the live DOM").
- *Verdict:* lowest priority. If it is wanted, ship it as manual-only with
  title-based catalog resolution and a `ib:` fallback, and accept breakage.

### A.6 The hard problem: cross-platform identity and the counter

Today the product has exactly one headline number, rendered in
`apps/web/src/components/HeroStats.tsx`:

> **Unique LeetCode problems solved** — `totals.lcUnique`
> *Non-LeetCode* — `totals.other` ("Striver A2Z & GFG-only problems, tracked separately")

That works because every supported site is a *view onto LeetCode's problem set*.
`resolveCatalogProblem()` in `apps/web/src/lib/queries.ts` resolves a NeetCode or
TUF page to a catalog row, `recordSolve()` rewrites the key to `lc:`, and
`reconcileAlias()` merges any pre-existing `nc:` row into it. The LeetCode
catalog is the universal coordinate system.

**Codeforces and AtCoder have no coordinates in that system.** `cf:1352-a` is
not a LeetCode problem under a different name; it does not exist there. No
resolver, no fuzzy title match, and no amount of catalog seeding will ever
produce an `lc:` key for it. The moment those platforms are supported, "unique
problems solved" stops being one meaningful number, because it would be summing
two different activities (interview-prep problem coverage vs. competitive
programming volume).

Three candidate models:

**Model 1 — one grand total.** Redefine the headline as "unique problems solved
anywhere" = `count(*)` over `solved_problems`.
*Rejects:* it makes the number non-comparable to a LeetCode profile, it
retroactively changes the meaning of a number the user has been watching, and
100 Codeforces Div2-A solves would swamp the signal the tracker exists to
provide. **Not recommended.**

**Model 2 — per-platform counters only.** Drop the aggregate, show one number per
namespace.
*Rejects:* loses the single motivating number entirely, and `nc:`/`tuf:`/`gfg:`
are *meant* to be a rounding error next to `lc:` — they exist only as a holding
pen for things that could not be mapped. **Not recommended.**

**Model 3 — tiered totals (recommended).** Three numbers with stable meanings:

| tier | namespaces | label | meaning |
| --- | --- | --- | --- |
| 1 | `lc:` | **Unique LeetCode problems solved** | unchanged, forever |
| 2 | `nc:` `tuf:` `gfg:` `hr:` `ib:` | **Other interview problems** | site-native problems with no LeetCode twin |
| 3 | `cf:` `ac:` `cc:` | **Competitive programming** | a different activity, counted separately |

- Tier 1 is the existing `Totals.lcUnique` and **its definition never changes**.
  This is the single most important constraint in this whole initiative: the
  number the user has been growing must keep meaning the same thing.
- Tier 2 is the existing `Totals.other`, minus the competitive namespaces. Note
  that if `cf:` rows ever land while `other` is still defined as
  `not like 'lc:%'`, tier 2 silently absorbs tier 3. So the SQL must change **in
  the same deploy** as the first `cf:` write, not after.
- Tier 3 is new.

Implementation: both `getTotals()` in `apps/web/src/lib/queries.ts` and the
inlined aggregate in `apps/web/src/lib/dashboard-stats.ts` (`loadStats`) compute
totals with `canonical_key like 'lc:%'` / `not like 'lc:%'`. Replace with a
namespace grouping:

```sql
split_part(canonical_key, ':', 1) as ns, count(*)::int
```

and derive all three tiers app-side from one `Record<string, number>`. Both
files must change together — they are two independent copies of the same
predicate today, and `/api/stats` and `/api/solve` would otherwise disagree.

`Totals` grows additively (never rename or remove `lcUnique` / `other` — an old
extension reads them):

```ts
export interface Totals {
  lcUnique: number;
  other: number;
  /** Added v2. Absent when talking to an older server. */
  byNamespace?: Record<string, number>;
  /** Added v2. Tier 3 only. */
  competitive?: number;
}
```

Dashboard changes: `HeroStats` keeps its primary number, its secondary becomes
tier 2 with corrected copy (it currently says "Striver A2Z & GFG-only", which is
already half-fictional since nothing produces `gfg:`), and tier 3 renders as a
third stat only when non-zero. `SourceBadge`'s `CLASS` map, `format.ts`'s
`SOURCE_LABEL`, `Banner.tsx`'s `SOURCE_LABELS`, and the `--pt-src-*` token block
in `globals.css` (lines ~85–89 and ~157–161, **both** the `:root` and `.dark`
blocks) each need one entry per new source.

### A.7 Contract surface that must change

Everything here is in `packages/shared` or is server-side validation, i.e. the
extension/web contract. All of it must be widened **server-first**.

1. **`Source` union** (`packages/shared/src/index.ts:2`) gains `'gfg' | 'cf' |
   'ac' | 'hr' | 'cc'`. Every `Record<Source, ...>` becomes non-exhaustive and
   will fail typecheck until updated — that is a feature; the compiler will
   point at `format.ts`'s `SOURCE_LABEL` for you. Note `Banner.tsx`'s
   `SOURCE_LABELS` is typed `Record<string, string>`, so it will *not* error —
   check it by hand.
2. **`CanonicalKey`** gains the new template literal members.
3. **`SOURCES` set** in `apps/web/app/api/solve/route.ts:7` — a plain
   `new Set([...])`, unrelated to the type. Easy to widen the type and forget
   this; the symptom is a 400 that the extension queues forever (see
   [section 3](#3-cross-cutting-extensionweb-version-skew)).
4. **`KEY_RE`** in the same file. Suggested rewrite that keeps the `nc:`
   camelCase carve-out and stays readable:

   ```ts
   const KEY_RE = /^(?:lc|tuf|gfg|hr|ib|cf|cc|ac):[a-z0-9][a-z0-9-]*$|^nc:[A-Za-z0-9][A-Za-z0-9-]*$/;
   ```

   Codeforces/AtCoder keys must be lowercased at construction time in the
   adapter (`cf:1352-a`, not `cf:1352-A`) or this rejects them.
5. **`ImportRequest`** (`{ ids: string[] }`) is NeetCode-specific by convention:
   `/api/import` hardcodes `firstSource: 'neetcode'`, the `nc:` prefix, and a
   call to NeetCode's own metadata endpoint. For a second bulk-import source it
   should become:

   ```ts
   export interface ImportRequest {
     ids: string[];
     /** Added v2. Absent = 'neetcode', preserving old-extension behaviour. */
     source?: Source;
   }
   ```

   and the route's resolution pipeline should take the namespace + an optional
   name-lookup function as parameters. This is the largest single refactor in
   Initiative A after the adapter.
6. **`manifest.host_permissions`** in `apps/extension/wxt.config.ts` — one entry
   per new site. Adding host permissions to an *already-installed* extension
   triggers a Chrome re-permission prompt and **disables the extension until the
   user accepts**. For an unpacked dev extension this is a reload; for a
   published one it is a real event. Worth batching all new hosts into one
   release rather than dripping them out.
7. **`webNavigation.onHistoryStateUpdated` filter** in
   `apps/extension/entrypoints/background.ts` (the `hostEquals` list at the
   bottom) — a new SPA site that is not listed there gets no `ROUTE_CHANGED`
   and will appear to "work once then stop", which is a confusing failure mode.
8. **`ExtMessage`** gains message types only if new bulk-import runs are
   extension-driven (e.g. `RUN_GFG_IMPORT`). Prefer generalizing to
   `{ type: 'RUN_IMPORT'; site: Source }` rather than adding one variant per
   site — but note that renaming `RUN_BACKFILL` / `RUN_NC_IMPORT` breaks an old
   popup talking to a new SW, which is *within* the extension and therefore
   always ships atomically. Safe.

### A.8 Phased steps

**Phase A0 — prerequisites (no new features)**
1. Apply the existing migrations first (`pnpm db:migrate`, per `docs/RUNBOOK.md`
   step 2) and seed the catalog. Nothing below is verifiable against an empty
   database.
2. Fix the offline-queue head-of-line bug described in
   [section 3](#3-cross-cutting-extensionweb-version-skew) **before** any change
   that can cause a 400. This is a prerequisite, not a nice-to-have: widening
   key namespaces is exactly the change that produces 400s under skew.

**Phase A1 — the adapter**
3. Write `apps/extension/lib/site-adapter.ts` (type + runner + the three shared
   resolvers). No behaviour change.
4. Port `tuf.content` → verify banner, already-solved, mark, TUF+ title-observer
   path by hand on the live site.
5. Port `neetcode.content` → verify the late-title wait and the `nc:` fallback.
6. Port `leetcode.content` → verify auto-detect end to end (submit a solved
   problem, watch the poll, confirm one `solve_event`). The `seenSubmissions` /
   `submissionContexts` maps and `pollVerdict` move into `watchVerdicts`
   verbatim.
7. `cd apps/extension && pnpm wxt prepare && npx tsc --noEmit`, then
   `pnpm build` and load `.output/chrome-mv3/` unpacked.

**Phase A2 — GeeksforGeeks (first new site, manual only)**
8. Server first: widen `Source`, `CanonicalKey`, `SOURCES`, `KEY_RE`; add
   `--pt-src-gfg` to **both** token blocks in `globals.css`; add the
   `SourceBadge` / `SOURCE_LABEL` / `Banner` label entries. Deploy web.
9. Extension second: `gfg` adapter + content script + host permission +
   `hostEquals` entry. Verify a `gfg:` row and an `lc:` row both appear from GFG
   pages (pick one problem that resolves and one that doesn't).

**Phase A3 — the counter model** *(gated on decision D1)*
10. Namespace-grouped totals in `queries.ts` **and** `dashboard-stats.ts`
    together; additive `Totals` fields; tiered `HeroStats`.

**Phase A4 — Codeforces** *(gated on decisions D1 and D2)*
11. Somewhere to store the handle (env var pre-auth, `user_settings` post-auth).
12. `syncCodeforces()` in a new `apps/web/src/lib/platforms/codeforces.ts`:
    fetch `user.status`, filter `verdict === 'OK'`, dedupe to
    `cf:<contest>-<index>`, insert into `solved_problems` + `solve_events` with
    `firstSource: 'cf'`, `detected: 'backfill'`. Model it on `/api/backfill`'s
    chunked `onConflictDoNothing` + event-repair structure.
13. A Server Action button on a settings page. Cron route only if wanted.

**Phase A5 — AtCoder** — same file shape, different fetcher. **Phase A6 —
HackerRank** — adapter + `collectHrSubmissions` collector modelled on
`collectAcSlugs`. **Phases A7/A8 — CodeChef / InterviewBit** — only on demand.

### A.9 Risks

- **The adapter refactor can silently break LeetCode auto-detection**, which is
  the feature with no manual fallback (the LeetCode script deliberately shows no
  prompt banner for unsolved problems). Mitigation: port it last, and verify
  with a real submission rather than a typecheck.
- **`/api/import`'s NeetCode assumptions are load-bearing in ~6 places**
  (hardcoded `firstSource: 'neetcode'`, the `nc:` prefix, the
  `getProblemMetadataFunctionHttp` name lookup, the alias-reconciliation loop,
  the URL-repair pass). A careless generalization will start writing
  `firstSource: 'neetcode'` rows for GFG imports, which is invisible until
  someone looks at the source breakdown.
- **`reconcileNeetcodeAlias` is named for NeetCode but is generic** (the inner
  `reconcileAlias` takes any `aliasKey`). When GFG starts producing keys that
  later resolve to `lc:`, the same alias-merge must run — `recordSolve` currently
  gates it on `req.source === 'neetcode' && canonicalKey.startsWith('nc:')`
  (`queries.ts:219`). That condition must become "the key is in a fallback
  namespace", or GFG will accumulate permanent duplicate rows: one `gfg:` and
  one `lc:` for the same problem, double-counting in tier 1 + tier 2.
- **Third-party dependency for AtCoder** — the kenkoooo API is not operated by
  AtCoder. Treat unavailability as a skipped sync.
- **Host-permission prompts** disable the extension until accepted.

### A.10 Open questions

- **D1.** Does the headline "unique solved" stay one number? (Recommendation:
  tiered — tier 1 keeps its exact current meaning.)
- **D2.** Are Codeforces/AtCoder in scope at all for what is framed as an
  *interview prep* tracker? If not, the entire cross-platform identity problem
  disappears and Initiative A shrinks to "GFG + HackerRank via the existing
  pattern".
- **D3.** Is a server-side poller (an 8th `/api/*` route + Vercel cron)
  acceptable, or must every import stay extension-driven to preserve the "`/api/*`
  is the extension's contract" invariant?
- **D4.** Should a `cf:`/`ac:` solve count toward the `/plan` day's DSA floor
  (`DSA_FLOOR = 4` in `plan-state.ts`)? Today only `plan_checks` rows matching
  `prob:<date>:%` count, and no plan problem has a `cf:` key, so the answer is
  currently "no" by accident rather than by decision.
- **D5.** GFG problems that resolve to LeetCode by title — accept fuzzy title
  matching (risk: false positives inflate tier 1) or require an explicit
  LeetCode anchor on the page (risk: almost nothing resolves)?

---

## 2. Initiative B — Clerk auth and per-user data

> This is the largest change in the app's history. Every table except
> `problems` is currently globally scoped, every write endpoint is
> world-writable with `Access-Control-Allow-Origin: *`, and the plan counters
> live in a row literally keyed `'singleton'`. Nothing in the codebase has ever
> had a concept of "who".

### B.1 Goals / non-goals

**Goals**

1. Every row of user data is owned by a Clerk user id; no query can return
   another user's data.
2. `/api/*` stops being world-writable.
3. The extension keeps working — including its offline queue — across sign-out,
   token expiry, and an old extension talking to a new server.
4. The existing single user's data survives, attributed to their account.

**Non-goals**

- Sharing, teams, public profiles, or read-only shared dashboards.
- Moving the extension off `/api/*` onto Server Actions (explicitly rejected by
  the existing architecture).
- Putting a user id in `packages/shared` request types. **The server derives
  identity from the credential, always.** A client-supplied user id is an
  impersonation primitive and must never exist in the contract.

### B.2 Schema migration

`problems` stays global — it is shared reference data (the public LeetCode
catalog), not user data. Everything else gains `user_id text not null`.

**A NOT NULL column with no default cannot be added to a non-empty table.** So
the migration is three separate deploys, not one. Also note: **drizzle-kit
`generate` will not produce this shape** — it will emit a single `ADD COLUMN ...
NOT NULL` that fails, and for the primary-key changes it may emit something
destructive. Hand-write these SQL files and add the journal entries manually.

**Step 1 — additive, nullable (safe, deployable alone).**

```sql
ALTER TABLE solved_problems ADD COLUMN user_id text;
ALTER TABLE solve_events    ADD COLUMN user_id text;
ALTER TABLE plan_checks     ADD COLUMN user_id text;
ALTER TABLE plan_days       ADD COLUMN user_id text;
ALTER TABLE plan_counters   ADD COLUMN user_id text;
```

At this point the app is unchanged and still works. Deploy Clerk sign-in on the
web app now (sign-in works, but no data is scoped yet) so the user can create
their account and you can read their `user_...` id.

**Step 2 — backfill (one statement, one known id).**

```sql
UPDATE solved_problems SET user_id = 'user_XXXXXXXX' WHERE user_id IS NULL;
-- ... same for the other four tables
```

Put the literal id in the migration SQL, not in application code. Single user,
so this is instantaneous and there is no ambiguity about ownership. Verify with
`SELECT count(*) FROM solved_problems WHERE user_id IS NULL;` returning 0 on
every table before continuing.

**Step 3 — constrain and re-key.**

```sql
ALTER TABLE solved_problems ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE solved_problems DROP CONSTRAINT solved_problems_pkey;
ALTER TABLE solved_problems ADD PRIMARY KEY (user_id, canonical_key);
DROP INDEX solved_first_solved_at_idx;
CREATE INDEX solved_user_first_solved_at_idx ON solved_problems (user_id, first_solved_at);

ALTER TABLE solve_events ALTER COLUMN user_id SET NOT NULL;
DROP INDEX solve_events_key_created_idx;
CREATE INDEX solve_events_user_key_created_idx ON solve_events (user_id, canonical_key, created_at);

ALTER TABLE plan_checks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE plan_checks DROP CONSTRAINT plan_checks_pkey;
ALTER TABLE plan_checks ADD PRIMARY KEY (user_id, check_id);

ALTER TABLE plan_days ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE plan_days DROP CONSTRAINT plan_days_pkey;
ALTER TABLE plan_days ADD PRIMARY KEY (user_id, date);

-- plan_counters loses the 'singleton' design entirely.
ALTER TABLE plan_counters ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE plan_counters DROP CONSTRAINT plan_counters_pkey;
ALTER TABLE plan_counters DROP COLUMN id;
ALTER TABLE plan_counters ADD PRIMARY KEY (user_id);
```

Notes that will bite:

- **`solved_problems.lc_slug` keeps its FK to `problems.lc_slug`.** Unaffected by
  the PK change; do not drop it.
- **`onConflictDoUpdate` targets break.** `plan-state.ts` names single-column
  targets in four places — `planChecks.checkId`, `planDays.date` (×3),
  `planCounters.id`. Postgres raises *"there is no unique or exclusion
  constraint matching the ON CONFLICT specification"* the moment the PK is
  composite. Every one becomes `target: [planChecks.userId, planChecks.checkId]`
  etc. `onConflictDoNothing()` without a target (used in `recordSolve`,
  `/api/backfill`, `/api/import`) keeps working, because it matches any unique
  violation.
- **`COUNTERS_ID = 'singleton'`** in `plan-state.ts:7` is deleted; every
  `where p.id = 'singleton'` becomes `where p.user_id = $userId`, including the
  one embedded in `getPlanState`'s raw SQL and the `.where(eq(planCounters.id,
  COUNTERS_ID))` in `popCounter`.
- **Order matters against the unapplied migrations.** `0001_easy_toxin` has
  never run. Apply `0000`/`0001`/`0002` first, verify, *then* generate the auth
  migrations on top. Generating auth SQL against a schema state that never
  existed in the database will produce a migration chain that cannot be replayed.
- **New table for extension credentials** (see [B.4](#b4-the-extension-is-the-hard-part)):

  ```sql
  CREATE TABLE api_keys (
    id           text PRIMARY KEY,
    user_id      text NOT NULL,
    label        text NOT NULL,
    prefix       text NOT NULL,          -- first 8 chars, for display: "dsa_a1b2…"
    token_hash   text NOT NULL UNIQUE,   -- sha256 of the full token, never the token
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at   timestamptz
  );
  CREATE INDEX api_keys_user_idx ON api_keys (user_id);
  ```

- **Optional `user_settings`** (`user_id` PK, `codeforces_handle`,
  `atcoder_handle`, …) — needed by Initiative A phase A4. Cheap to add here.

### B.3 Every query that becomes wrong without a user filter

This is the checklist that matters most, because several of these are *silent*
cross-user data leaks rather than errors:

| location | what breaks |
| --- | --- |
| `queries.ts` `sourceUrlSql` | the correlated subquery joins `ev.canonical_key = "solved_problems"."canonical_key"` with **no user predicate** — after the migration it will happily surface another user's event URL on your row. Must add `and ev.user_id = "solved_problems"."user_id"`. |
| `queries.ts` `recordSolve` inner subquery | same shape, same fix (it additionally filters on `first_source`). |
| `queries.ts` `getTotals` | counts every row in the table. |
| `queries.ts` `getSolved` / `getAllSolved` / `getRecent` | unscoped `where canonical_key = …` / full scans. |
| `queries.ts` `reconcileAlias` | **the dangerous one.** `update solve_events set canonical_key = … where canonical_key = aliasKey` would retarget *every user's* events for that alias, and `delete from solved_problems where canonical_key = aliasKey` would delete another user's row. |
| `queries.ts` `resolveCatalogProblem` | reads `problems` only — correctly stays global. |
| `dashboard-stats.ts` `loadStats` | one big raw-SQL aggregate over `solved_problems` + `solve_events`; every subquery needs the filter. |
| `plan-state.ts` `getPlanState` | raw SQL with three scalar subqueries (`plan_checks`, `plan_days`, `plan_counters`) — all three need it. |
| `plan-state.ts` `getSolvedKeySet` | full scan of `solved_problems`. |
| `plan-state.ts` `getPlanStreak` | `plan_days` window query. |
| `plan-state.ts` `dsaSolvedOn` | `like 'prob:<date>:%'` over `plan_checks`. |
| `plan-state.ts` all 6 writers | `setCheck`, `setFloor`, `setTrip`, `saveLog`, `bumpCounter`, `popCounter`. |
| `/api/backfill`, `/api/import` | bulk inserts and their event-repair passes. |
| `/api/catalog/refresh`, `lib/catalog.ts` | writes `problems` only — correctly stays global. |

**Enforcement mechanism (recommended):** make `userId` a **required first
parameter** on every function in `queries.ts` and `plan-state.ts`. No default,
no optional, no ambient "current user" read from inside the data layer. Then the
TypeScript compiler enumerates the full call-graph for you and it is impossible
to forget one. A `getCurrentUserId()` helper that functions call internally
looks tidier and is exactly the design that lets an unscoped query survive
review.

### B.4 The extension is the hard part

The extension currently POSTs to `/api/solve` from an MV3 service worker with no
credentials of any kind, against a **user-configurable base URL** that defaults
to `http://localhost:3000` and is typically switched to a `*.vercel.app` origin.
It has no UI concept of an account, and its `chrome.storage.local` cache holds
one global user's solved set.

#### Option 1 — Clerk session token

Approaches, in decreasing viability:

- **`@clerk/chrome-extension`.** Clerk publishes an extension SDK with a
  background-script client and token caching. Real and supported, but it
  requires the extension's origin allowlisted in the Clerk dashboard, a
  publishable key baked into the extension bundle, a "sync host" configuration
  so the extension can reuse the web app's session, and `storage` +
  `cookies`-adjacent permissions. It also assumes one fixed app origin, which
  conflicts directly with the popup's `SET_API_BASE` free-text field.
- **Read the `__session` cookie** from the app origin via `chrome.cookies` and
  forward it as a bearer. Requires a `cookies` permission and host permission on
  the app origin, and depends on Clerk's cookie names — undocumented surface
  that can change under you.

Either way, the fundamental mismatch: **Clerk session tokens are short-lived
JWTs (on the order of a minute), and this extension is explicitly built to work
offline and flush later.** `flushPending()` may run hours after the write was
queued, woken by a `chrome.alarms` tick with no tab open. A credential that
expires in 60 seconds and requires a live refresh path is the wrong shape for
that queue, and every refresh failure turns into a queue stall.

#### Option 2 — long-lived per-user API key (**recommended**)

1. A `/settings` page on the web app (Clerk-protected) with a "Create extension
   key" **Server Action** — no new `/api/*` route, consistent with how
   `app/plan/actions.ts` already works. Generates `dsa_` + 32 random bytes
   base64url, stores only `sha256(token)` in `api_keys`, returns the plaintext
   **once**.
2. The user pastes it into the popup, next to the existing API base field. New
   message `{ type: 'SET_API_KEY'; key: string }` in `ExtMessage`, stored under
   a new `chrome.storage.local` key (`K_API_KEY`).
3. `apiGet` / `apiPost` in `background.ts` attach
   `Authorization: Bearer <key>`. That is a **four-line change** in the only two
   functions that ever touch the network.
4. Server: one helper `requireApiUser(request)` that hashes the presented token,
   looks it up (`revoked_at is null`), returns the `user_id`, and 401s
   otherwise. Optionally bump `last_used_at` (fire-and-forget; do not make it
   block the write path on a `max: 1` client).

**Why this is the right call for a browser extension here:**

- It survives the offline queue by construction — no expiry, so a three-day-old
  queued solve still authenticates.
- It is orthogonal to the configurable API base: the key is the user's, not the
  origin's.
- It is revocable per key, and losing one does not compromise the Clerk account.
- Clerk stays purely a *web session* concern: `auth()` in server components and
  Server Actions, nothing in the extension bundle, no extension origin
  registered with Clerk, no publishable key shipped in the extension.
- It removes any need for the extension to know Clerk exists at all — a
  meaningful reduction in the surface that can break when either side updates.

Trade-off, stated honestly: a long-lived bearer token in `chrome.storage.local`
is readable by anything with access to the extension's storage (i.e. anyone with
access to the machine's browser profile). For a personal tracker whose worst
case is "someone marks problems as solved for you", that is proportionate. If
the threat model ever changes, add key expiry + a rotation prompt rather than
switching to session tokens.

**Optional phase 2 UX:** a "Connect extension" button on `/settings` that hands
the key to the extension directly via `externally_connectable` +
`chrome.runtime.sendMessage`, so the user never copy-pastes. Costs one manifest
entry (`externally_connectable.matches` for the app origins) and must be
restricted to exactly the app origins.

#### Offline queue behaviour — and an existing bug this forces you to fix

`flushPending()` currently does this:

```ts
while (pending.length > 0) {
  const next = pending[0];
  await apiPost<SolveResponse>('/api/solve', next); // throws if API down
  pending = pending.slice(1);
  await writePending(pending);
}
```

`apiPost` throws on **any** non-2xx. `handleMarkSolved` catches **any** failure
and enqueues. So a permanently-rejected item — a 400 from a `canonicalKey` the
deployed server's `KEY_RE` doesn't know, or a 401 after auth ships — **sits at
the head of the queue forever and blocks every later solve from ever being
written.** The user sees a growing "pending" count and silently loses every
subsequent solve. This is a live bug today; auth guarantees it fires.

Required changes before auth ships:

```ts
// classify, don't treat all failures alike
type FlushOutcome = 'ok' | 'retry' | 'unauthorized' | 'poison';
// network error / 5xx / 429  -> retry  (stop flushing, keep the queue, apiOk = false)
// 401 / 403                  -> unauthorized (stop flushing, KEEP the queue, set authState)
// 400 / 422                  -> poison (drop the item, log it, CONTINUE the queue)
```

Plus, per queued item, a `queuedAt` timestamp and an `attempts` counter so a
poison item can be surfaced rather than vanishing.

On **401**: stop flushing, **do not discard the queue**, and set a new
`CachedState.authState: 'ok' | 'missing-key' | 'invalid-key'` so the popup can
say "Sign in / paste your key — 12 solves waiting". The queue drains
automatically on the next successful auth.

On **key change or sign-out**: the `solvedCache` must be **cleared** (it is
another user's solved set, and `handleCheckProblem` would otherwise answer
`solved: true` for the wrong person). The **pending queue must not be**: park it,
or flush it before the key changes. Losing recorded work silently is worse than
a stuck queue.

Also add a `version` field to the cached object. `chrome.storage.local` survives
extension updates, so a v1 cache will still be sitting there when v2 code reads
it.

#### Banner when signed out

`BannerState` in `apps/extension/components/Banner.tsx` gains a variant:

```ts
| { kind: 'needs-auth' }
```

rendering "Connect your tracker" with a button that opens the popup (or the
`/settings` page via `chrome.tabs.create`). Constraints from CLAUDE.md apply
verbatim: it renders in a shadow root, **px units only**, styles inline in the
component, `--pt-*` values are copied literals mirrored from `globals.css`.

Behaviour: on a `needs-auth` state, `check()` should not silently do nothing —
today an unauthenticated `CHECK_PROBLEM` would return `solved: false` from a
stale cache and the LeetCode script (which shows no prompt banner for unsolved
problems) would render nothing at all, making the extension look dead. The
`needs-auth` banner must be shown for **auto-detect sites too**, once, per
session — that is the only feedback channel LeetCode has.

### B.5 Securing `/api/*` and what happens to CORS

Per-route policy:

| route | policy |
| --- | --- |
| `POST /api/solve` | API key required → `user_id` |
| `GET /api/solved` | API key required → scoped list |
| `GET /api/stats` | API key required → scoped stats |
| `POST /api/backfill` | API key required |
| `POST /api/import` | API key required |
| `GET /api/resolve` | reads `problems` only — no user data. Can stay open, but requiring the key costs nothing and removes an unauthenticated DB-touching endpoint. **Recommend: require it.** |
| `POST /api/catalog/refresh` | not a user operation. Protect with a separate `CATALOG_REFRESH_SECRET` header (or a Clerk-session admin check), independent of API keys. It currently lets any stranger trigger a ~4k-row upsert and an outbound fetch to leetcode.com. |

**CORS.** `apps/web/proxy.ts` sets `Access-Control-Allow-Origin: *` on
`/api/:path*`. The important fact: **the extension does not need this and never
did.** Extension service-worker fetches under `host_permissions` are exempt from
CORS entirely — that is exactly why the current design works and why the same
call from a content script would not. The `*` header is only serving hypothetical
page-context callers.

Recommendation: **delete the CORS headers along with the auth change.** They
grant nothing to the extension and would otherwise let any website in the world
issue authenticated-by-nothing requests (and, once auth lands, probe for
behaviour differences). If some page-context caller is discovered later:

- keep the `OPTIONS` 204 branch,
- add `Authorization` to `Access-Control-Allow-Headers` (a bearer header makes
  every request preflighted from a page context — the current header list omits
  it, so page-context auth would silently fail preflight),
- and replace `*` with an explicit origin allowlist.

**`Vary: Authorization`** should be set on any route whose response now depends
on the caller. All seven are already `export const dynamic = 'force-dynamic'`,
so Next will not statically cache them, but any CDN in front should be told.

**`packages/shared` gains no user field.** `SolveRequest`, `ImportRequest`,
`BackfillRequest` stay exactly as they are. Identity is derived server-side from
the credential. Write this down in the type file's doc comment so a future
editor does not "helpfully" add `userId?: string`.

### B.6 Clerk + Next 16 App Router specifics

**The `proxy.ts` question.** Next 16 renamed the `middleware.ts` convention to
`proxy.ts`, and this repo already uses it (`apps/web/proxy.ts`, exporting
`proxy` + `config`). Clerk's documented integration is
`export default clerkMiddleware(...)` in `middleware.ts`. Whether the installed
`@clerk/nextjs` recognizes the `proxy.ts` filename is a version-specific
question that must be verified, not assumed.

**Recommendation: don't put Clerk in `proxy.ts` at all.** `clerkMiddleware` is
not required for Clerk to work; it exists to make `auth()` available in
middleware and to do route-level protection there. This app does not need
either:

- `/api/*` authenticates with API keys, not Clerk sessions — so no Clerk
  middleware is wanted on the one path `proxy.ts` currently matches.
- Pages and Server Actions can call `auth()` directly.

That sidesteps the convention risk entirely and leaves `proxy.ts` free to be
deleted (if CORS goes) or kept for CORS alone. If route-level protection is
wanted later, adopt `clerkMiddleware` deliberately and **merge** the matchers —
the current `matcher: '/api/:path*'` is far narrower than Clerk's recommended
matcher, and replacing one with the other silently drops the CORS behaviour or
silently stops protecting pages, depending on direction.

**Server Actions are a real hole and must be closed explicitly.** The eight
actions in `app/plan/actions.ts` are POST endpoints reachable by anyone who can
discover the action id. Every one needs:

```ts
// apps/web/src/lib/auth.ts
export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  return userId;
}
```

```ts
export async function setCheckAction(checkId: string, done: boolean): Promise<void> {
  const userId = await requireUser();
  await planState.setCheck(userId, checkId, done);
  revalidatePath(PLAN_PATH);
}
```

Because `plan-state.ts` functions take `userId` as a required first parameter
(see [B.3](#b3-every-query-that-becomes-wrong-without-a-user-filter)), forgetting
the `requireUser()` call is a compile error, not a security hole. That is the
whole point of the parameter-threading design.

**Server components.** `app/page.tsx`, `app/plan/page.tsx`, `app/problems/page.tsx`
are all `force-dynamic`, so `auth()` works without any static-render conflict.
The read-path contract in `plan-state.ts` ("reads never throw; render empty
state against an unreachable DB") should be **preserved for DB failure and not
reused for auth failure** — signed-out should `redirect('/sign-in')`, not render
a convincing-looking empty plan. Those are different conditions and must look
different.

**`ClerkProvider` and the theme script.** `app/layout.tsx` has a blocking inline
`<script>` in `<head>` that toggles `.dark` on `<html>` before first paint —
this is what prevents the light-mode flash and CLAUDE.md is emphatic about it.
`<ClerkProvider>` wraps `{children}` (or `<body>`'s contents); **it must not
displace or delay that script**. Additionally, Clerk's components need to follow
the app's theme, which is a **`.dark` class, not a media query** — so the
`appearance`/`baseTheme` prop has to be driven from a client component reading
`useTheme()` in `src/lib/theme.tsx`, not from `prefers-color-scheme`. And Clerk's
default component styling will not match the two-idiom stylesheet; expect to map
`--pt-*` tokens into Clerk's `appearance.variables`.

**Build-time env.** `pnpm build` currently succeeds with no database — an
invariant CLAUDE.md calls out. Adding Clerk means
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must be present at build time for client
components. Add it to Vercel *and* to local `.env` before the first build after
integration, or CI breaks in a way that looks unrelated.

### B.7 RLS: app layer or Postgres?

The database is Supabase Postgres, but **this app does not use Supabase Auth or
PostgREST**. It connects with a single connection string
(`DSA_TRACKER_DATABASE_URL`) through the Supavisor **transaction** pooler, via
postgres.js configured `prepare: false, max: 1` (`apps/web/src/db/index.ts`).
That changes the RLS calculus completely:

1. **RLS is not enforced for the table owner** unless `ALTER TABLE … FORCE ROW
   LEVEL SECURITY` is set. The connection string is almost certainly the owning
   role, so naive policies would be silently inert — the most dangerous possible
   outcome, because it *looks* secured.
2. **`auth.uid()` does not exist in this path.** Policies would have to read
   `current_setting('app.user_id', true)`, set by the app.
3. **Transaction pooling makes a session-scoped `SET` unsafe.** Supavisor can
   hand the same backend to a different request between statements, so a plain
   `SET app.user_id` can leak into another request. Only `SET LOCAL` inside an
   explicit transaction is safe — which means **every read must be wrapped in
   `db.transaction()`**.
4. That directly contradicts the existing performance design. `loadStats` and
   `getPlanState` were each deliberately collapsed into *one* statement / one
   round trip on a `max: 1` client (there are long comments in both files
   explaining why fan-out stalls the pooler). Wrapping each in a transaction
   turns 1 round trip into 3 (BEGIN / SET LOCAL / SELECT / COMMIT), on every
   page render, on a single-connection client.

**Recommendation: enforce at the application layer**, with the compiler as the
enforcement mechanism (required `userId` parameters, no ambient current-user
lookup inside the data layer). This is a personal tracker with a handful of
users at most; the app layer is a single small choke point and the cost is zero.

**If defense-in-depth is later wanted**, the honest version is:

1. Create a dedicated non-owner role for the app and put *that* in the
   connection string.
2. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY`
   on all five user tables.
3. Policies of the form
   `USING (user_id = current_setting('app.user_id', true))`.
4. A `withUser(userId, fn)` helper that opens a transaction, issues
   `SET LOCAL app.user_id = …`, and runs everything inside it — and accept the
   extra round trips, or raise `max` and stop using the transaction pooler.

Do that as a deliberate, measured phase — not as part of the initial auth
rollout, where it would triple the surface being changed at once.

### B.8 Rollout sequencing

Each numbered step is independently deployable and independently revertible.

| # | step | writes? | reversible? |
| --- | --- | --- | --- |
| 0 | Apply migrations `0000`–`0002` (RUNBOOK step 2), seed catalog | **yes, DDL** | forward-only |
| 1 | Fix the offline-queue failure classification in `background.ts`; add `authState` to `CachedState`; ship the extension | no | yes |
| 2 | Add Clerk to `apps/web`: `ClerkProvider`, `/sign-in`, `/settings`. **No data scoping yet.** Sign in once; record the `user_...` id | no | yes |
| 3 | Migration step 1: nullable `user_id` on five tables | **yes, DDL** | yes (drop columns) |
| 4 | Migration step 2: backfill all rows to the recorded user id; verify zero NULLs | **yes, data** | yes |
| 5 | Migration step 3: NOT NULL + composite PKs + reindex + `api_keys` table | **yes, DDL** | hard |
| 6 | Thread `userId` through `queries.ts` + `plan-state.ts` as a required first param; add `requireUser()`; update all `onConflictDoUpdate` targets; scope every query in [B.3](#b3-every-query-that-becomes-wrong-without-a-user-filter). Deploy web with `ALLOW_UNAUTHENTICATED_API=true` — API-key auth is *parsed* but a missing key falls back to the single known user id | **yes, behaviour** | yes (env flip) |
| 7 | `/settings` key generation; extension `SET_API_KEY` + `Authorization` header + `needs-auth` banner. Load the new extension, paste the key, confirm writes land with the key present | no | yes |
| 8 | Flip `ALLOW_UNAUTHENTICATED_API=false`. `/api/*` now 401s without a key | no | yes (env flip) |
| 9 | Remove the CORS headers from `proxy.ts`; protect `/api/catalog/refresh` with its own secret | no | yes |
| 10 | Remove the fallback-user code path entirely | no | yes |

Step 6's env flag is what makes this safe under version skew: the server is
fully user-scoped and key-aware while an **old extension that sends no header
keeps working**, so there is never a window in which solves are being dropped or
poison-queued. Do not skip it.

### B.9 What breaks for the single existing user

- **Between steps 6 and 8: nothing** — that is the point of the flag.
- **At step 8**, an extension that has not been updated and given a key starts
  receiving 401s. With step 1 in place, those writes queue safely and the popup
  says why; without step 1, the first 401 blocks the queue permanently.
- **The `chrome.storage.local` cache** written before step 7 belongs to "no
  user". After the key is set it should be dropped and resynced. If it is not,
  `handleCheckProblem` answers from stale global data — mostly harmless with one
  user, actively wrong the moment there are two.
- **`/plan` behind sign-in.** Today it renders for anyone who has the URL. After
  auth it redirects. That is the intended change but it is a visible one.
- **Local dev** needs two new env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `CLERK_SECRET_KEY`) plus the extension pointed at `http://localhost:3000` with
  a key generated from the local instance — Clerk dev instances issue different
  user ids than production, so a key from one will not work against the other.
  The popup's existing API-base switcher makes this easy to get wrong; consider
  storing the key per API base rather than globally.
- **`scripts/migrate-neon-plan.ts` and `scripts/resolve-plan-keys.ts`** write
  `plan_*` rows directly. After step 5 they must pass a `user_id` or their
  inserts fail on NOT NULL. `plan:migrate` is documented as dry-run-by-default,
  so this surfaces safely — but it must be updated before anyone runs it with
  `--commit` post-migration.

### B.10 Risks

- **Silent cross-user reads.** The two correlated `sourceUrl` subqueries in
  `queries.ts` and the raw-SQL aggregates in `dashboard-stats.ts` /
  `plan-state.ts` will *not* error when unscoped; they will just return the wrong
  data. These are hand-written SQL strings that Drizzle's type system does not
  check. Review them line by line, twice.
- **`reconcileAlias` can delete another user's row** if the alias update/delete
  is left unscoped. Highest-severity item on the list.
- **Composite-PK migration and drizzle-kit.** Do not trust `db:generate` for
  steps 3–5. Hand-write, review, apply against a copy first.
- **`ON CONFLICT` target errors** appear only at runtime, on the *write* path,
  which is exactly the path that has no test coverage (there is no test suite).
  Exercise every plan mutation by hand after step 5.
- **Clerk + `proxy.ts` convention.** Mitigated by not using `clerkMiddleware`.
- **The theme flash.** Careless `ClerkProvider` placement in `layout.tsx`
  reintroduces the light-mode flash the inline script exists to prevent.
- **One-user-shaped bugs stay invisible.** With a single account, an unscoped
  query returns exactly the right answer. Create a second throwaway Clerk user
  and verify isolation on every table before declaring this done — otherwise the
  whole initiative is untested by construction.

### B.11 Open questions

- **D6.** Clerk session token vs. long-lived API key for the extension?
  (Recommendation: **API key.** See [B.4](#b4-the-extension-is-the-hard-part).)
- **D7.** Is this actually multi-user, or is auth just a lock on a public URL? If
  the latter, `api_keys` alone might suffice and Clerk is optional — but Clerk
  gives a real sign-in UI for free and makes the answer to D7 reversible.
- **D8.** Should `/` (the dashboard) stay publicly readable as a shareable
  profile, with only `/plan` and writes gated? That changes the scoping rule
  from "everything" to "everything except an explicitly public projection".
- **D9.** Does `/api/resolve` need auth? It exposes only public LeetCode catalog
  data. (Recommendation: require it anyway.)
- **D10.** Keep the manual `plan_counters` (dsa / dsaExtra + undo stacks) at all
  post-auth, or retire them in favour of derived counts? They are the only
  awkward piece of the schema and the migration is a good moment to decide.
- **D11.** RLS now, later, or never? (Recommendation: later, and only with a
  dedicated role + `FORCE`.)

---

## 3. Cross-cutting: extension/web version skew

The web app deploys on push; the extension is loaded unpacked or self-zipped and
updates only when the user reloads it. **They are never atomic.** Both
initiatives change `packages/shared`, which is the contract between them.

**The rule: the server must accept the new thing before the extension sends it,
and must keep accepting the old thing until every extension has been updated.**

| change | direction | safe? |
| --- | --- | --- |
| widen `KEY_RE` / `SOURCES` | server accepts more | ✅ server first |
| add fields to `Totals` / `SolveResponse` | additive | ✅ (old extension ignores them) |
| rename/remove a `Totals` field | narrowing | ❌ breaks old popup (`r.totals.lcUnique` is read in three content scripts) |
| new `Source` value sent by extension | server must know it first | ❌ if extension ships first → **400 → poison queue** |
| require `Authorization` | narrowing | ❌ without the `ALLOW_UNAUTHENTICATED_API` grace window |
| add `ExtMessage` variants | intra-extension only | ✅ always atomic |
| change `SolvedProblem` shape | affects the cache too | ⚠️ old cached objects persist in `chrome.storage.local` across updates |

**The single most important prerequisite for both initiatives** is the
failure-classification fix in `flushPending()` / `handleMarkSolved`
([B.4](#b4-the-extension-is-the-hard-part)). Today, one permanently-rejected
queued write — a 400 from an unknown key prefix, or a 401 after auth — parks at
the head of the queue and blocks every subsequent solve from ever being
persisted, with no visible error beyond a rising "pending" count. Both
initiatives introduce exactly the conditions that trigger it.

Verification gates (there is no test suite; these are what exists):

```sh
cd apps/web && npx tsc --noEmit
cd apps/extension && pnpm wxt prepare && npx tsc --noEmit
cd apps/extension && pnpm build   # then load .output/chrome-mv3/ unpacked
```

Plus manual verification per site, because every detection heuristic in this
codebase is DOM- or network-shape-dependent and nothing about it is unit
testable.

---

## 4. Suggested order of execution

1. **RUNBOOK step 2–3** — apply `0000`–`0002`, seed the catalog. Nothing else is
   verifiable until the database matches the schema in the repo.
2. **Offline-queue failure classification** (extension). Prerequisite for
   everything downstream in both initiatives.
3. **`SiteAdapter` refactor** (A1). Pure refactor; do it while the codebase is
   still small and the semantics are still one-user.
4. **Decide D1 and D2** (counter model, competitive platforms in scope).
5. **GeeksforGeeks** (A2) — the low-risk proof that the adapter works, and it
   closes the already-declared `gfg:` namespace.
6. **Auth (Initiative B) in full**, steps 0–10.
7. **Everything else in Initiative A** (tiered counters, Codeforces, AtCoder,
   HackerRank) — post-auth, so per-platform handles have a per-user home
   (`user_settings`) instead of an env var that has to be migrated later.

Rationale for putting auth *before* the remaining platforms: Codeforces and
AtCoder need per-user configuration (a handle). Building that pre-auth means
building it twice. GFG needs none, which is why it can jump ahead.

---

## 5. Decision log to fill in

| id | decision | recommendation | chosen |
| --- | --- | --- | --- |
| D1 | Does "unique solved" stay one number? | Tiered: tier 1 = `lc:` and its meaning never changes | |
| D2 | Are Codeforces/AtCoder in scope? | Yes, but as tier 3, clearly separated | |
| D3 | Server-side poller = an 8th `/api/*` route + cron? | Server Action first; cron only if hands-off sync is wanted | |
| D4 | Do `cf:`/`ac:` solves count toward the `/plan` DSA floor? | No | |
| D5 | GFG → LeetCode fuzzy title matching? | Yes, same as NeetCode/TUF; accept some false negatives | |
| D6 | Extension credential: Clerk session token or API key? | **API key** | |
| D7 | Real multi-user, or a lock on a personal app? | | |
| D8 | Public read-only dashboard at `/`? | | |
| D9 | Does `/api/resolve` require auth? | Yes | |
| D10 | Keep `plan_counters` manual counters post-auth? | | |
| D11 | RLS now / later / never? | Later, with a dedicated role + `FORCE` | |
