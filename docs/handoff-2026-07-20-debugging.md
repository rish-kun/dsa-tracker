# Handoff — extension debugging session (2026-07-20)

Context: after loading the extension for the first time, three things failed —
"Sync from LeetCode" returned `POST /api/backfill -> 500`, an Accepted LeetCode
submission produced no toast/record, and no banner ever appeared on
neetcode.io. A fourth request was added: import the already-completed problems
from the user's NeetCode account.

## Root causes found (all reproduced/verified with the real extension loaded in Chrome via puppeteer)

1. **Banner update race (all sites).** `createBanner()` in
   `apps/extension/components/Banner.tsx` captured a `useState` setter during
   React's first render. React commits asynchronously, so `update()` calls made
   right after mount hit a still-`null` setter and were silently dropped — the
   banner stayed stuck on its initial "Saved locally / API unreachable" card
   (or effectively never showed the real state).

2. **NeetCode slugs are NOT LeetCode slugs.** The original design assumed 1:1
   parity. Wrong: NeetCode's in-site editor uses its own ids —
   `duplicate-integer` is LeetCode's `contains-duplicate`, `dynamicArray` is a
   NeetCode-only problem, `string-encode-and-decode` is LC's
   `encode-and-decode-strings`. So even a working banner checked/recorded the
   wrong canonical key.

3. **LeetCode interceptor was fragile.** It was injected with a `<script>` tag
   (`injectScript`) — subject to page CSP and a startup race — and on the live
   site something restores `XMLHttpRequest.prototype.open` to native, undoing
   the XHR wrap. Detection relied entirely on passively observing the page's
   own network calls.

4. **Backfill 500 was opaque.** The route had no try/catch (any DB hiccup →
   bare 500) and the popup only showed the status code. Could NOT reproduce the
   500 itself afterwards — the API route handles 1/17/250-slug payloads fine —
   so it was most likely a transient DB/dev-server issue right after the server
   start at 12:41. The GraphQL collection query (`questionList`) was re-verified
   as still valid against leetcode.com.

5. **Content-script CSS denied.** Chrome logged `Denying load of
   content-scripts/*.css` on every page — WXT's `createShadowRootUi` fetches
   the content script's CSS from the page context, and it wasn't listed in
   `web_accessible_resources`.

## Fixes implemented

### Extension (`apps/extension`)

- **`components/Banner.tsx`** — rewrote to render imperatively from a stored
  view (`root.render(<Card view={current}/>)` on every `update()`); no more
  dropped updates.
- **`entrypoints/leetcode-main.content.ts`** (new, replaces deleted
  `entrypoints/leetcode-interceptor.ts`) — MAIN-world **registered content
  script** (`world: 'MAIN'`, `document_start`): guaranteed to run before page
  scripts, immune to page CSP. Watches for:
  - `POST /problems/<slug>/submit/` responses → posts `submitted` +
    `submission_id` + the submitted slug (primary signal, LeetHub-3.0 style),
  - the old passive `check/` + GraphQL `submissionDetails` "accepted" signals
    (secondary).
- **`entrypoints/leetcode.content/index.tsx`** — on `submitted`, the isolated
  content script now **polls
  `https://leetcode.com/submissions/detail/<id>/check/` itself** (same-origin,
  session cookies apply; 1.2 s interval, 90 s deadline, per-id dedup) and
  records on `state:"SUCCESS" && status_msg:"Accepted"`. Detection no longer
  depends on how the page transports its own verdict. Submission ids retain
  their captured slug/title/URL, so navigating before the verdict cannot
  record the Accepted result against the next problem.
- **`entrypoints/neetcode.content/index.tsx`** — identity now resolved
  properly: wait for the problem title to render (Angular is late), then
  RESOLVE by URL slug (in case it's a real LC slug), then **by title** against
  the catalog → `lc:<slug>`; fall back to `nc:<ncSlug>` (new namespace,
  counts in the "other" counter). Also guards against stale async checks on
  SPA route changes (`checkRun` counter).
- **Content scripts / `wxt.config.ts`** — removed `cssInjectionMode: 'ui'`
  because the banner already embeds its styles in the shadow root and WXT was
  requesting nonexistent per-site CSS assets; removed the obsolete CSS web
  resource rule and the old interceptor entry.
- **`entrypoints/background.ts`**
  - API errors now include the server's error body text, not just the status
    (`httpError()` helper) — the popup will show *why* a 500 happened.
  - New `RUN_NC_IMPORT` handler: opens/reuses a neetcode.io tab,
    `chrome.scripting.executeScript` runs `collectNcCompleted()` inside it:
    reads the Firebase session from IndexedDB (`firebaseLocalStorageDb` →
    `firebase:authUser:*`), refreshes the ID token via
    `securetoken.googleapis.com` if stale, calls NeetCode's own
    `POST /api/callableFunctionHttp {functionId:"getCompletedProblems"}` with
    `Authorization: Bearer <idToken>`, recursively normalizes nested callable
    response shapes into a validated id list, then POSTs the ids to our
    `/api/import`.
  - LeetCode and NeetCode sync results now distinguish import success from a
    failed local cache refresh and surface the latter as a non-fatal warning.
  - `ensureLeetCodeTab` generalized to `ensureSiteTab(pattern, createUrl)`.
- **`entrypoints/popup/App.tsx` + `style.css`** — added a **"Sync from
  NeetCode"** button (shares status line with the LeetCode sync).
- **`lib/messaging.ts`** — `RUN_NC_IMPORT` response type.

### Web app (`apps/web`)

- **`app/api/import/route.ts`** (new) — accepts `{ids: string[]}` from the
  NeetCode collector. Per id: (1) exact catalog slug match → `lc:<id>`;
  (2) else fetch the problem's display name from NeetCode's **public**
  `getProblemMetadataFunctionHttp` (6-way concurrency) and match the
  normalized title against the catalog → `lc:<catalog slug>`; (3) else import
  as `nc:<id>` with the NeetCode display name. Dedupes ids resolving to the
  same key, inserts with `onConflictDoNothing` + `solve_events`
  (source `neetcode`, detected `backfill`), returns
  `{imported, skipped, unmapped, totals}`.
- **`app/api/backfill/route.ts`** — wrapped in try/catch; 500s now return
  `{error: <message>}` and log server-side.
- **`app/api/solve/route.ts`** — `KEY_RE` accepts the new `nc:` namespace
  (camelCase allowed — NeetCode ids like `dynamicArray` aren't kebab-case).
- **`src/lib/queries.ts` + solve/import routes** — NeetCode identity is now
  server-authoritative. Any catalog match is rewritten to `lc:` before it is
  stored; older `nc:` aliases are transactionally merged into the LC row,
  their events are retargeted, and the earliest first-solve metadata wins.
  The solve response returns the final canonical entry so the extension cache
  also drops the client-side alias.

### Shared (`packages/shared/src/index.ts`)

- `CanonicalKey` gains `nc:<slug>`; new `ImportRequest`/`ImportResponse`;
  new `RUN_NC_IMPORT` message; `BackfillRunResult` includes cache-refresh
  status and warnings (shared by both sync buttons).

## Verification status

Done and passing:

- Web + extension typecheck clean; extension builds; built manifest verified
  (MAIN-world script registered; no nonexistent content-script CSS assets or
  obsolete CSS web-accessible resources).
- `scratchpad/verify-final.mjs` passed against the production build: the
  NeetCode banner showed "Contains Duplicate", recorded
  `lc:contains-duplicate`, updated to total `1`, then showed "Valid Anagram"
  after navigation. There were no extension console errors. The LeetCode
  MAIN-world fetch wrapper was present; the site still replaces the passive
  XHR wrapper, so active verdict polling remains the primary path.
- Runtime testing found and fixed two additional NeetCode issues: modal `<h1>`
  elements could be mistaken for the problem title, and the generic Angular
  shell title could end the title wait too early.
- `/api/backfill` imported `two-sum` + `valid-anagram`, then skipped both on a
  repeat request.
- `/api/import` mapped `duplicate-integer` and
  `string-encode-and-decode` to their LeetCode keys, kept `dynamicArray` as
  `nc:dynamicArray`, then skipped all three on repeat.
- Server-authoritative canonicalization was tested with a raw
  `nc:duplicate-integer` solve: the response and extension cache contained
  only `lc:contains-duplicate`. Legacy alias repair was tested through both
  `/api/solve` and `/api/import`, including an existing LC row; events moved to
  the LC key and the earlier solve timestamp/source were preserved.
- **DB is clean**: 0 solves and 0 events after deleting the exact test keys.

NOT yet run:

- Real logged-in tests: LeetCode submit → toast; "Sync from LeetCode"; and
  "Sync from NeetCode". The connected Chrome control session was unavailable,
  and the isolated automation profile has no user login.
- takeuforward.org pages — still completely untested against the live DOM.

## To hand the user

- Rebuild + reload: `cd apps/extension && pnpm build`, then `chrome://extensions`
  → reload the unpacked extension (`.output/chrome-mv3/`).
- Dev server must be running (`pnpm dev`); popup → both sync buttons.
- If backfill 500s again, the popup message will now include the server error
  text — that's the lead to chase.

## Environment notes

- Dev server on :3000 was (re)started by the user at 12:41 local; DB is
  Supabase via `DSA_TRACKER_DATABASE_URL` in `apps/web/.env` (never bare
  `DATABASE_URL` — shell profile exports a Neon one; see CLAUDE.md).
- Puppeteer repro note: branded Google Chrome ≥137 ignores
  `--load-extension`; use puppeteer's `enableExtensions: true` +
  `browser.installExtension(path)` (that mistake produced one invalid
  "extension not loading" repro before being caught).
