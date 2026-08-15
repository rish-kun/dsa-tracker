# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Multi-user DSA tracker: a WXT (Manifest V3) browser extension detects problems
being solved on leetcode.com / neetcode.io / takeuforward.org /
geeksforgeeks.org and records them through a Next.js API backed by Supabase
Postgres. Everything dedupes on a **canonical key**: `lc:<leetcode-titleSlug>`
for LeetCode-mappable problems (the main "unique solved" counter),
`nc:<ncSlug>`/`tuf:<slug>`/`gfg:<slug>` for problems with no LeetCode
equivalent (separate counter). **Everything is authenticated.** Clerk gates
every page via `apps/web/proxy.ts`; `/api/*` authenticates opaque **scoped**
bearer API keys minted at `/settings`; every user-owned table is
`user_id`-scoped with RLS enabled. Never write a new route, query or table that
skips this — see **Auth model** below. A merged-in second app adds a `/plan`
route: a hardcoded 34-day study plan whose LeetCode items auto-tick from the
same `solved_problems` table. `/plan` is the one surface additionally
restricted to a single account (`PLAN_OWNER_EMAIL`); the rest of the app is
per-user.

## Commands

```sh
pnpm install               # workspace install (pnpm only — never npm/yarn)
pnpm dev                   # Next.js web app + API on http://localhost:3000
pnpm dev:ext               # WXT dev mode (launches browser with extension)
pnpm build                 # build all workspaces
pnpm db:generate           # drizzle-kit: generate migration from schema changes
pnpm db:migrate            # apply migrations (all 7 are applied; guarded — see below)
pnpm auth:backfill         # assign user_id to pre-auth rows (DRY RUN unless --commit)
pnpm db:seed               # import LeetCode catalog (~4k rows) into `problems`
pnpm plan:keys             # re-resolve canonicalKey in packages/plan-data
pnpm plan:migrate          # legacy Neon plan blob -> plan_* (DRY RUN unless --commit)

# typecheck (no test suite exists)
# NOTE: bare `npx tsc` resolves to an unrelated `tsc@2.0.4` npm package here —
# there is no root node_modules/.bin. Always use the workspace-local binary.
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/extension && pnpm wxt prepare && ./node_modules/.bin/tsc --noEmit

# extension production build (then load .output/chrome-mv3/ unpacked)
cd apps/extension && pnpm build
```

`pnpm db:migrate` is **guarded**: `apps/web/scripts/migrate.ts` refuses to run
and tells you to run `pnpm auth:backfill -- --user-id user_xxx --commit` first
whenever legacy rows exist without `user_id` (0005 makes that column NOT NULL,
so an unbackfilled DB would break). `auth:backfill`
(`scripts/backfill-user-ownership.ts`) applies migrations only through `0004`
and transactionally assigns ownership; the staged production sequence is in
`docs/auth-rollout.md`.

`apps/web/.env` needs `DSA_TRACKER_DATABASE_URL` (Supabase Postgres URI).
**The project-specific name is load-bearing**: the user's shell profile exports
a generic `DATABASE_URL` pointing at an unrelated Neon database, and both
dotenv and Next.js let pre-existing env vars win over `.env`. Never read bare
`DATABASE_URL` first, and never assume a DB operation hit the right database —
`src/db/index.ts` checks `DSA_TRACKER_DATABASE_URL` before falling back.

## Architecture

Four workspaces (`pnpm-workspace.yaml` globs `apps/*` + `packages/*`, so new
packages need no config change): `apps/web` (Next.js 16 App Router — `/`
dashboard (`app/page.tsx`), `/plan` tracker (`app/plan/page.tsx`), `/problems`
table (`app/problems/page.tsx`), `/settings` (`app/settings/page.tsx`,
extension API key management), `/setup` (`app/setup/page.tsx`, the extension
install walkthrough) and the Clerk catch-alls
`/sign-in/[[...sign-in]]` + `/sign-up/[[...sign-up]]` — plus all 7 API routes
and the Drizzle schema), `apps/extension` (WXT +

**Onboarding.** `<SignUp forceRedirectUrl="/setup">` sends every new account to
the walkthrough instead of an empty dashboard. The dashboard renders
`ExtensionSetupNotice` until the extension has actually called the API once.
**A web page cannot detect this extension** — no `web_accessible_resources`, not
in `externally_connectable` — so `src/lib/extension-status.ts` uses the only
observable proxy: a scoped Clerk key that exists but has a null `lastUsedAt`
means minted-but-never-connected. Like the `/plan` reads it never throws; on a
Clerk error it reports `connected`, which renders nothing (a missing nudge beats
a false one).
React), `packages/shared` (pure TS types exported as raw source, transpiled by
each consumer — it is the API contract *and* the extension's internal message
protocol; change shapes here first), and `packages/plan-data` (the hardcoded
34-day curriculum — see below).

Data flow (extension side): content script detects the current problem →
`chrome.runtime.sendMessage` → **service worker** → Next.js API → Postgres.
This indirection is an MV3 constraint, not a style choice: content scripts are
CORS-bound to the host page's origin, only the service worker (via
`host_permissions`) may call the API. The service worker
(`entrypoints/background.ts`) also owns a `chrome.storage.local` cache of the
solved-key set (so banners render without network) and an offline write queue
flushed on the next successful sync.

**The extension's backend URL is hardcoded, deliberately.**
`DEFAULT_API_BASE` at `apps/extension/entrypoints/background.ts:29` is the
single source; `normalizeBase()` at `:112` **ignores its argument and returns
that constant**, so the `SET_API_BASE` message survives in the union only as a
no-op compatibility shim for older popups. The matching single fixed origin is
in `apps/extension/wxt.config.ts:19` `host_permissions` — one literal
`https://…vercel.app/*`, **not** a `*.vercel.app` wildcard. Changing the
backend means editing **both** files and rebuilding. **Do not reintroduce a
settings field for it** — commit `71b204e` removed it on purpose. The popup's
only credential input is the API key; it lives in `chrome.storage.local` and is
never returned to popup callers, which see `hasApiKey: boolean` only.

Per-site detection (`apps/extension/entrypoints/*.content/`):
- **leetcode**: slug from URL; Accepted is auto-detected in two halves.
  `entrypoints/leetcode-main.content.ts` is a **manifest-registered MAIN-world
  content script** (`world: 'MAIN'`, `runAt: 'document_start'`) — *not* an
  injected `<script>` and *not* a web-accessible resource; there are **no
  `web_accessible_resources` in this extension at all**. It wraps `fetch`/XHR
  to capture `POST /problems/<slug>/submit/` (→ `submitted` + `submission_id`)
  plus the passive `check/` and GraphQL `submissionDetails` "accepted" signals,
  and relays them over `window.postMessage` because MAIN-world code has no
  `chrome.runtime`. The isolated script (`entrypoints/leetcode.content/`) then
  **polls `/submissions/detail/<id>/check/` itself** (same-origin, session
  cookies apply) and records on `SUCCESS`/`Accepted`; each submission id keeps
  the slug captured at submit time, so navigating away mid-judge cannot record
  the verdict against the next problem.
- **neetcode**: NeetCode's URL slug is **NOT** the LeetCode titleSlug — there
  is no 1:1 parity (`duplicate-integer` is LC `contains-duplicate`,
  `string-encode-and-decode` is LC `encode-and-decode-strings`, `dynamicArray`
  is NeetCode-only). Identity is resolved **server-side against the catalog**:
  the content script waits for the real problem title to render (Angular is
  late; the generic shell title and modal `<h1>`s are rejected), then asks
  `/api/resolve` **by URL slug**, then **by title**. A catalog hit becomes
  `lc:<lcSlug>`; otherwise it falls back to the `nc:<ncSlug>` namespace, which
  counts in the "other" bucket. `nc:` ids may be camelCase, so `KEY_RE` in
  `/api/solve` allows it. Resolution is **server-authoritative**: any catalog
  match is rewritten to `lc:` before storage, and pre-existing `nc:` aliases
  are transactionally **merged into the `lc:` row** (events retargeted,
  earliest first-solve metadata wins — `reconcileNeetcodeAlias` in
  `src/lib/queries.ts`). The solve response returns the final canonical entry
  so the extension's local cache drops the alias too. Manual "mark as
  completed" only; bulk history comes from `POST /api/import`.
- **takeuforward**: three-step resolution — embedded `leetcode.com/problems/`
  anchor → title match via `/api/resolve` → fall back to a `tuf:` key. Banner
  only activates on problem-looking pages (see `isProblemPage()`).

All three sites are SPAs: route changes come from
`webNavigation.onHistoryStateUpdated` in the service worker (→ `ROUTE_CHANGED`
message), not page loads.

DB tables (`apps/web/src/db/schema.ts`): `problems` (LeetCode catalog, seeded
from leetcode.com/api/problems/all/), `solved_problems` (one row per unique
key — this table IS the counter), `solve_events` (append-only audit log; a
repeat solve writes an event but not a solved_problems row). `POST /api/solve`
returns `isNew: false` + the existing entry for repeats — that's the dedup
signal the banner relies on.

The LeetCode history backfill runs `chrome.scripting.executeScript` inside a
leetcode.com tab (first-party session cookies apply there) paginating GraphQL
`problemsetQuestionList` with `filters:{status:"AC"}`, then posts slugs to
`/api/backfill`. The NeetCode import (`RUN_NC_IMPORT`) does the equivalent
inside a neetcode.io tab — reads the Firebase session from IndexedDB, calls
NeetCode's `getCompletedProblems` callable, and POSTs the ids to `/api/import`.

## Auth model

**`apps/web/src/lib/auth.ts` is the only place auth policy lives.** Do not
re-implement any of it inline in a route, page or action:

- `requireUser()` / `isPlanUser()` / `requirePlanUser()` for pages and Server
  Actions; `requireApiUser(request)` for `/api/*` route handlers.
- `requireApiUser` parses `Authorization: Bearer <secret>`, calls
  `clerkClient().apiKeys.verify()`, and rejects unless the key carries
  `EXTENSION_SCOPE = 'dsa-tracker:extension'`. It also rejects org subjects
  (`org_` prefix), revoked keys and expired keys. **A generic Clerk user API
  key does NOT work** — only keys minted with that scope.
- On failure use `unauthorizedApiResponse()`. The 401 body is exactly
  `{"error":"A valid extension API key is required"}` with `Cache-Control:
  no-store` and `Vary: Authorization`. That is the contract the extension
  parses; don't change the shape.
- `PLAN_OWNER_EMAIL` is a hardcoded constant compared only against **verified**
  Clerk email addresses (`verification?.status === 'verified'`) — never trust a
  client-supplied claim.
- `POST /api/catalog/refresh` is the **one** route that does not use Clerk: it
  compares header `x-catalog-refresh-secret` against env
  `CATALOG_REFRESH_SECRET`, and 401s when that env var is unset (so an
  unconfigured deploy fails closed).
- `ALLOW_UNAUTHENTICATED_API=true` + `LEGACY_OWNER_USER_ID` is a **migration
  bridge**, not a fallback: `legacyApiUser()` fires **only when the
  `Authorization` header is entirely absent**. An invalid or unscoped key is
  always a 401. Do not extend this path, and do not reach for it to "make the
  extension work".
- Keys are minted and revoked in `app/settings/actions.ts`;
  `createExtensionKey` returns the secret **only on the creating invocation**
  (Clerk never hands it back), so the UI shows it once.
- Env vars auth adds: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `CATALOG_REFRESH_SECRET` (plus the two bridge vars). See
  `apps/web/.env.example`.
- RLS is enabled on `solved_problems`, `solve_events`, `plan_checks`,
  `plan_days`, `plan_counters` by `drizzle/0006_enable_user_table_rls.sql` (no
  policies — the server connects as the DB role, so direct Data API access is
  denied). **Any new user-owned table must get `user_id` + RLS the same way.**

## The merged plan tracker (`/plan`)

This repo is a merge of the tracker above with a separate 26-day study-plan
app. The plan half adds:

**`packages/plan-data`** (`src/index.ts`, one file, no build step — `main`/
`types` point straight at the source) — the entire curriculum as hardcoded
TypeScript. There is no DB seed and no CMS for it; editing the plan means
editing that file. It exports:

- `DAYS` (34 `DayEntry`), `PHASES` (7 `PhaseEntry`), `WEEKS` (8 groupings that
  index into `DAYS`), `RESUME_ITEMS` (10 strings), `TAG_LABELS`
- `PHASE_COUNT = PHASES.length` — use it instead of hardcoding `7`
- `checkId`, `slugify`, `localDateKey`, `NEETCODE_150_KEYS`, `CORE_SET`
- types `Tag`, `DsaCategory`, `DayTask`, `DsaProblem`, `DayEntry`, `PhaseEntry`

`DAYS` carries **150 problems total; 145 have a `canonicalKey`** (`lc:<slug>`,
populated by `scripts/resolve-plan-keys.ts`). The 5 exceptions are the
`(Striver)` entries — they have no LeetCode equivalent, so they can never
auto-tick and are hand-tick only. `CORE_SET` is a separate 20-problem fallback
list ("if a day collapses, do these in order") — also canonical-keyed and
auto-ticking, but under its own id family (`checkId.core`, i.e. `core:<slug>`),
distinct from any day's `prob:` rows. `canonicalKey` is the *only* link between
the plan and `solved_problems`.

**The Google-prep block (appended 2026-08-14).** `DAYS[26..33]` are
`2026-08-14`..`2026-08-21`: a 7-day interview run-up plus the interview day
itself (Google, Fri 21 Aug 2026). That append also **repurposed two constants
wholesale**, which orphaned their old `plan_checks` rows rather than migrating
them:

- `PHASES` was the 7 finished C++ semantic-cache project phases; it is now the
  7 prep days. `checkId.phase` is a name slug, so the old `phase:*` rows still
  exist in the DB but match nothing.
- `RESUME_ITEMS` was 6 resume-editing chores (the resume froze Jul 30); it is
  now 10 interview-day logistics items. Same orphaning via `resume:*`.
- `apps/web/scripts/migrate-neon-plan.ts` remaps legacy ids **positionally**
  (`p${i}` → `PHASES[i]`, `r${i}` → `RESUME_ITEMS[i]`). Those two remaps are
  invalid after this swap — do not re-run them.
- The `cpp` tag now means "C++ written in a plain doc with no compiler", not
  the cache project. `TAG_LABELS.cpp` is still `"C++"`, so no UI change.
- **`WEEKS` must partition every `DAYS` index exactly once**: `schedule.tsx`
  and `plan-rail.tsx` iterate `WEEKS`, so a day belonging to no group renders
  nowhere at all. Appending days without adding a group silently hides them.
- `OA_DATE_KEY` in `app/plan/page.tsx` is the rail's countdown target and is
  now `2026-08-21`. `daysUntil` floors at 0, so a past date there renders
  `0.0 q/day · 0d left` forever rather than failing.

**`checkId` is the SOLE constructor of check ids.** `packages/plan-data`
exports `checkId.task/problem/core/coreKey/googleRevision/googleRevisionKey/
phase/resume`; nothing else in the codebase may build one — **never a
template literal**, or the id space silently forks between writer and reader:

```ts
checkId.task(date, i)     // `task:${date}:${i}`  — i = index in that day's tasks[]
checkId.problem(date, p)  // `prob:${date}:${p.canonicalKey ?? slugify(p.name)}`
checkId.core(p)           // `core:${p.canonicalKey ?? slugify(p.name)}` — CORE_SET rows
checkId.coreKey(key)      // `core:${key}` — same id from the canonical key alone
checkId.googleRevision(p) // `grev:${p.canonicalKey}` — GOOGLE_REVISION_ALL rows
checkId.googleRevisionKey(key) // `grev:${key}`
checkId.phase(p)          // `phase:${slugify(p.name)}`
checkId.resume(text)      // `resume:${slugify(text).slice(0, 48)}`
```

**Problem, phase and resume ids are stable slugs, not array indices** — so
reordering `PHASES`, `RESUME_ITEMS`, or a day's `problems[]` does *not* orphan
existing rows. **Task ids are the exception: they ARE positional** (`i` is the
index in that day's `tasks[]`). Inserting or reordering a task inside a day
silently re-points every later task's id at a different label. Append to the
end of a day's `tasks[]`; if you must reorder, accept that the ticks shift.

The `*Key` variants exist for `recordSolve`, which holds only a canonical key,
not the problem object. **All three auto-ticking families — `prob:`, `core:`
and `grev:` — must be cleared together** when a live solve arrives, or an untick
in one family becomes permanently sticky while the same untick in another does
not. `GOOGLE_REVISION_*` entries require `canonicalKey` (no slugify fallback),
and every `CORE_SET` entry has one, so the key-only variants cannot fork the id
space.

The only legal raw `prob:` strings are SQL `LIKE` patterns: the
`dsaSolvedOn` date prefix in `src/lib/plan-state.ts` and `recordSolve`'s
canonical-key suffix cleanup in `src/lib/queries.ts`. Neither constructs a
check id; all actual ids still come from `checkId.problem`.

`slugify` is lowercase → non-alphanumerics to `-` → collapse → trim.
`PLAN_TZ` is `Asia/Kolkata`, and `localDateKey` gives the plan owner's
`YYYY-MM-DD` in that zone regardless of the browser/server runtime — use it,
never `toISOString()`, which is UTC and rolls the day over at the wrong local
time.

**Three new tables** (`apps/web/src/db/schema.ts`, migration
`apps/web/drizzle/0001_easy_toxin.sql`), real column names:

- `plan_checks` — `check_id` text PK, `done` boolean NOT NULL, `updated_at`
  timestamptz default `now()`. **Explicit overrides only.**
- `plan_days` — `date` text PK (a local `YYYY-MM-DD` key, *not* a date type),
  `log` text nullable, `floor_dsa` / `floor_cpp` / `floor_log` / `trip`
  booleans NOT NULL default false.
- `plan_counters` — `id` text PK (always the literal `'singleton'`), `dsa` /
  `dsa_extra` integers default 0, `dsa_hist` / `dsa_extra_hist` jsonb default
  `'[]'` (undo stacks of raw increments).

All seven migrations (`0000_charming_red_hulk` … `0006_enable_user_table_rls`)
are applied to the Supabase database. The defensive `/plan` read fallbacks
still matter for builds and temporary DB outages, but writes are expected to
work without further migration setup.

**Trap: `apps/web/drizzle/meta/` has snapshots for `0000`–`0003` and `0006`
but NOT `0004`/`0005`** — those two were hand-authored (`0004_user_ownership`,
`0005_finalize_user_ownership`) rather than generated. A future
`drizzle-kit generate` diffs against the snapshot chain, so it can emit a
migration that re-adds or re-alters columns those two already changed. Inspect
generated SQL before committing it, and prefer hand-authoring a follow-up
migration over trusting the diff.

**Auto-tick rule** (`app/plan/page.tsx`, `resolveChecks`):

```ts
checks[id] = manual[id] ?? autoSolved[id] ?? false
```

`manual` is the `plan_checks` rows; `autoSolved` is derived by walking `DAYS`
and setting `checkId.problem(day.date, p) → true` for every problem whose
`canonicalKey` is in the `solved_problems` key set — it only ever holds `true`,
never `false`.

**It must stay `??`, never `||`.** `??` is what lets a manual explicit `false`
survive and untick something the extension detected; `||` would let the derived
`true` win and make an untick impossible. A later live solve of that same
canonical key clears matching false overrides inside `recordSolve`, so the
fresh solve becomes authoritative; backfills never clear them.

`plan_checks` holds **explicit overrides only** — absence of a row is not
"unchecked", it means "derive it". So an unticked LeetCode problem shows as
done the moment the extension records that key in `solved_problems`, with no
write to `plan_checks`; a row is only inserted when the user manually ticks or
unticks. Never backfill `plan_checks` from `solved_problems` — that would
freeze the derivation and break future auto-ticks. The page hands the client
all three maps (`checks` resolved, plus `manual` and `autoSolved`) purely so
the UI can show *why* a row is ticked; components never re-derive.

The NeetCode ring is the intersection of `solved_problems` with the exact 150
keys in `NEETCODE_150_KEYS`; off-list solves stay in the DB but never affect
that ring, and the legacy `plan_counters.dsa` value is not used by the UI.
Today's activity and the daily DSA floor derive from distinct
`solve_events.canonical_key` values where `detected <> 'backfill'`; import
timestamps are not solve dates. Events are bucketed in `PLAN_TZ`. A day reaches
its DSA floor when its manual flag is true or it has at least 4 live solves. An
open plan refreshes these server-derived values when its tab regains focus.

**Mutations use Server Actions.** Plan writes (ticks, floors, trip, day logs,
counters) go through `app/plan/actions.ts` — thin wrappers that call
`src/lib/plan-state.ts` and `revalidatePath('/plan')`. **No new `/api/*` route
was added for the plan; there are still exactly 7.** `/api/*` stays the
**extension's** open contract, versioned by `packages/shared`, and was
deliberately not widened — do not add plan endpoints there, and do not route
extension traffic through Server Actions.

**`apps/web/proxy.ts` is `clerkMiddleware`.** It sets **no CORS headers** —
there are zero `Access-Control-*` headers anywhere in this repo; do not claim
otherwise or "restore" them. What it does: returns `NextResponse.next()` for
`/api/*` so route handlers own their own JSON 401 contract instead of being
redirected into an HTML sign-in page, and redirects unauthenticated **page**
requests to `/sign-in?redirect_url=<path+search>`. Public prefixes are
`/sign-in`, `/sign-up`, `/__clerk`. That file was `middleware.ts` until Next 16
renamed the convention to `proxy`; it is the same interceptor, Node-runtime
only. Its `matcher` now covers the whole app (non-asset paths + `/(api|trpc)`
+ `/__clerk/`), not just `/api/:path*`.

Read/write split in `src/lib/plan-state.ts`: reads (`getPlanState`,
`getSolvedKeySet`, `getPlanStreak`) **never throw** — they log and return empty
state so `/plan` renders against an unreachable or un-migrated DB. Writes
deliberately **do not catch**, so a failed mutation surfaces instead of
silently no-opping. All DB reads on the page are sequential, never
`Promise.all`: the postgres.js client is `max: 1` and a fan-out stalls the
Supabase transaction pooler.

## Styling — two coexisting idioms in one stylesheet

`apps/web/app/globals.css` deliberately contains **two** styling systems, both
on the same `--pt-*` token set. A future editor will get this wrong, so:

1. **The original dashboard's 87 semantic classes** (`.nav`, `.page`,
   `.page-title`, `.filter-chip`, …) — the hand-written vanilla stylesheet,
   restored verbatim in structure and metrics with raw colours retokenized onto
   `--pt-*`. It lives inside **`@layer components`** specifically so Tailwind
   utilities always win on the same element. **The user explicitly likes this
   design; it was deliberately NOT rewritten into utilities.** Do not "migrate"
   it.
2. **Tailwind v4 utilities** — used by the newer `src/components/plan/*`
   components (and arbitrary-value bridges like
   `text-[var(--pt-text-3)]`).

Mixing them on one element is fine and intended; the layer ordering resolves it.

Token gotchas:

- **`--pt-surface-2` is DARKER than `--pt-surface`**, in *both* modes
  (light `#fafaf9` vs `#ffffff`; dark `#141312` vs `#1c1917`). For a raised /
  hover / table-header / tooltip fill you want **`--pt-surface-raised`**, which
  lifts *off* surface in both modes. Reaching for `--pt-surface-2` for a hover
  state is the single most likely mistake here.
- **`--pt-blue-ink` is the contrasting ink for text on a filled blue
  background** (`--pt-blue-bg`) — never `--pt-blue`, which is blue-on-blue. It
  flips per mode (light `#0d3a6e`, dark `#eaf1fd`).
- All five accent families (`blue`/`green`/`amber`/`rose`/`violet`) ship
  `--pt-X`, `--pt-X-bg` and `--pt-X-ink`. Blue is the only one with a `-ring`.
  Use `-ink` for text on a filled `-bg` tint, and reserve it for *selected*
  controls — plain badges stay `-bg` + `-X`.
- Domain tokens exist and should be used rather than re-picking colours:
  `--pt-src-{leetcode,neetcode,tuf,backfill,other}` and
  `--pt-diff-{easy,medium,hard}`.
- Also defined: shadcn compat aliases (`--background`, `--card`, `--muted`, …)
  mapped onto `--pt-*`. Change the `--pt-*` value, not the alias.
- `@layer base` sets `body { font-size: 15px }` — the vanilla stylesheet's base
  scale, which every dashboard class is sized relative to. Tailwind's `rem`
  utilities resolve against `<html>` and are unaffected. Don't "fix" this.

**Dark mode is a `.dark` CLASS on `<html>`, not a media query.** A blocking
inline `<script>` in `app/layout.tsx` reads `localStorage['pt_theme']` (falling
back to `prefers-color-scheme`) and toggles the class **before first paint** —
that is what prevents the light-mode flash. `src/lib/theme.tsx` only reads the
already-resolved class back on mount; it must never re-resolve or re-apply the
theme. Tailwind's dark variant is wired to it via
`@custom-variant dark (&:is(.dark *))`, so `dark:` utilities and the `.dark`
token block stay in sync. Never write a `@media (prefers-color-scheme: dark)`
block in this stylesheet.

## The plan merge did not touch the extension — but the extension has moved on

**About the merge specifically:** the plan half is entirely web-side.
`apps/extension` was byte-for-byte unchanged *by that merge*, and nothing about
the plan needs the extension to change — it already writes `solved_problems`,
which is the only thing `/plan` derives from. Keep it that way: plan features
belong in `apps/web`.

**This does not mean the extension is frozen.** Since the merge it has gained
the API-key auth flow (popup key entry, `Authorization: Bearer` on every
backend call, `authState` in storage), a GeeksforGeeks adapter
(`entrypoints/gfg.content/`), and the unified site-adapter refactor —
`apps/extension/lib/site-adapter.ts` now owns the shared detect → resolve →
banner → record loop, and each per-site entrypoint supplies a `SiteAdapter`
(`isProblemPage?`, `detect`, `mode: 'auto' | 'manual'`). Add a new site by
writing an adapter, not by copying an entrypoint. `git status --short
apps/extension` being empty is a statement about your working tree, not about
the extension's history.

## Releasing the extension

`.github/workflows/release-extension.yml` builds the Chromium bundle and
attaches `dsa-tracker-extension-<tag>-chrome.zip` to a GitHub Release on a
`v*` tag push (or `workflow_dispatch` with an existing tag). It **hard-fails
when the tag version does not match `apps/extension/package.json` `version`**
— a mismatched bundle is one Chrome refuses to treat as an update. So: bump
that version, **commit**, then tag. `wxt zip` builds first, so there is no
separate build step; the raw artifact is
`apps/extension/.output/extension-<version>-chrome.zip` and is **renamed at
upload time** rather than by overriding `zip.name` in `wxt.config.ts` (the
extension source stays untouched). Chromium only — **do not add a Firefox
leg**: the code uses `chrome.*` MV3 APIs, a `world: 'MAIN'` content script, and
there is no `browser_specific_settings` gecko id.

## Gotchas

- `apps/extension/tsconfig.json` adds `jsx: react-jsx` on top of the generated
  `.wxt/tsconfig.json`; run `pnpm wxt prepare` before `tsc` on a fresh clone.
- Web pages that touch the DB must stay `force-dynamic` and tolerate an
  empty/unreachable DB (build runs without one).
- The in-page banner renders in a shadow root: px units only (`rem` resolves
  against the host page), and styles live inside the component.
- Selectors/heuristics for takeuforward (especially TUF+ premium pages) were
  written from research, not against the live DOM — treat them as the first
  suspect if detection misbehaves there.
- **`vercel.json` lives at `apps/web/vercel.json`, not the repo root.** The
  Vercel project's Root Directory is `apps/web`, so that is the only
  `vercel.json` Vercel reads, and every path in it (`outputDirectory`,
  `functions` keys) is relative to `apps/web`. A root-level `vercel.json` is
  dead config — its `maxDuration` overrides silently never applied. The 60 s
  limits are also declared in code (`export const maxDuration = 60`) in the
  backfill and catalog-refresh routes as a backstop.
- `_source-dsa-track/` was the read-only source copy of the merged-in app. It
  has been **deleted** now that the port is complete. Several comments still say
  "ported from `_source-dsa-track/lib/store.ts`" (`plan-state.ts`,
  `migrate-neon-plan.ts`) — those paths no longer resolve; treat them as
  historical attribution, not as something to go read.
- Root `package.json` passthroughs: `pnpm plan:keys`
  (`scripts/resolve-plan-keys.ts`, repopulates `canonicalKey`) and
  `pnpm plan:migrate` (`scripts/migrate-neon-plan.ts`, legacy Neon → `plan_*`;
  **dry run by default, writes need `--commit`**).
