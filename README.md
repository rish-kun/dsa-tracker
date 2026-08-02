# DSA Tracker

Tracks the number of **unique** DSA questions you've solved across
[LeetCode](https://leetcode.com), [NeetCode](https://neetcode.io), and
[Striver's A2Z sheet / TUF+](https://takeuforward.org) — deduped by LeetCode
problem. Solving the same question on two sites counts once. Opening a question
you've already solved shows an in-page banner. A browser extension does the
detection; a Next.js app does the counting, the reporting, and a day-by-day
study plan that ticks itself off as you solve.

### Routes

| Route | What it is |
|---|---|
| `/` | Dashboard — totals, difficulty/source breakdown, solves over time, recent activity |
| `/plan` | **Owner-only.** 26-day study plan — daily tasks, per-day log, exact NeetCode 150 progress, today's automatic solve count, C++ phases, and streak. **LeetCode problems in the plan tick themselves** after the extension records a solve; an already-open plan refreshes when its tab regains focus |
| `/problems` | Full solved-problem table — every canonical key with its title, difficulty, source, and first-solve date |
| `/settings` | Mint and revoke the extension API keys that authenticate `/api/*` |
| `/sign-in`, `/sign-up` | Clerk auth. Every other route redirects here (`?redirect_url=<path>`) when signed out |

**Everything is per-account.** Sign-in is Clerk; every user-owned table is
`user_id`-scoped, so two accounts never see each other's solves. The one
exception is `/plan`, which is gated on a single hardcoded verified email
(`PLAN_OWNER_EMAIL` in [`apps/web/src/lib/auth.ts`](apps/web/src/lib/auth.ts)) —
see [Install the extension](#install-the-extension).

### Workspaces

- `apps/extension` — WXT (Manifest V3) browser extension, Chromium only
  (Chrome / Edge / Brave / Helium)
- `apps/web` — Next.js 16 (App Router, React 19) web app: the three routes above
  + the API, on Vercel. Drizzle ORM over `postgres.js` against Supabase Postgres
- `packages/shared` — TypeScript types shared by the app and the extension
- `packages/plan-data` — the 26-day curriculum, hardcoded in TypeScript
  (editing the plan means editing this package): 26 days, 7 C++ phases,
  6 week groupings, 6 resume items, 72 problems — 67 of which carry an
  `lc:<slug>` canonical key and can auto-tick. The 5 `(Striver)` entries have
  no LeetCode equivalent and are hand-ticked only.

**How counting works:** every problem gets a canonical key — `lc:<slug>` when it
maps to a LeetCode problem, or a site-specific key such as `nc:<id>`,
`tuf:<slug>`, or `gfg:<slug>` when no LeetCode equivalent can be resolved. The
server resolves NeetCode IDs and titles against the LeetCode catalog and merges
older `nc:` aliases into the canonical `lc:` entry. The main counter is unique
`lc:` keys; non-LC problems get their own smaller counter. On leetcode.com an
**Accepted submission is auto-detected**; on neetcode.io, takeuforward.org and
geeksforgeeks.org the extension shows a **"Mark as completed?"** prompt.

## Install the extension

This is the path if you just want to use the tracker against the hosted
backend — no clone, no build. (To build from source instead, skip to
[Setup](#setup).)

1. **Create an account** at
   [dsa-tracker-final-web.vercel.app/sign-up](https://dsa-tracker-final-web.vercel.app/sign-up).
2. **Mint an extension API key** at
   [/settings](https://dsa-tracker-final-web.vercel.app/settings) — give it a
   name, click **Create key**, then **copy the secret immediately** — the page
   says so too ("Copy this key now — it cannot be shown again"). Clerk returns
   the secret only on the call that creates it; nothing can retrieve it
   afterwards. Lost it → **Revoke** and mint a new one.
3. **Download** the latest `dsa-tracker-extension-*-chrome.zip` from
   [Releases](https://github.com/rish-kun/dsa-tracker-final/releases/latest)
   and unzip it. **`manifest.json` sits at the root of the unzipped folder** —
   WXT zips the *contents* of its output directory, not a wrapper directory.
   Pointing "Load unpacked" at the parent folder is the single most common
   failure here; Chrome will say the manifest is missing.
4. **Load it:** `chrome://extensions` → toggle **Developer mode** (top right) →
   **Load unpacked** → select the unzipped folder → pin "DSA Tracker" from the
   puzzle-piece menu. **Chromium only** — Chrome, Edge, Brave, Helium. There is
   no Firefox build: the code calls `chrome.*` MV3 APIs directly
   (`chrome.action.openPopup`, a `world: 'MAIN'` content script) and the
   manifest declares no `browser_specific_settings` gecko id.
5. **Connect it:** open the popup, paste the key into **Extension API key**,
   click **Connect**. Until a key is stored, both sync buttons are disabled and
   the in-page banner shows a **"Connect your tracker"** state with an **Open
   connection settings** button instead of tracking anything.
6. **Import your history (once):** click **Sync from LeetCode** with a
   logged-in leetcode.com tab open, then **Sync from NeetCode** with a
   logged-in neetcode.io tab open. Each collector is injected into that site's
   own tab (`chrome.scripting.executeScript`) precisely so the site's
   first-party session cookies apply — the extension never sees or stores your
   LeetCode/NeetCode credentials, and neither sync can work from the popup
   alone.
7. **Daily use:** on leetcode.com an Accepted submission is recorded
   automatically; on neetcode.io, takeuforward.org and geeksforgeeks.org a
   **"Mark as completed?"** banner appears and you confirm. Re-opening
   something you have already solved shows the "already tracked" banner
   instead.

### Updating

Download the new zip from Releases, unzip it **over** (or in place of) the
folder you loaded, then click the ↻ **Reload** icon on the DSA Tracker card at
`chrome://extensions`. Chrome loads unpacked extensions from that path on disk,
so replacing the contents and reloading is the whole update. Your API key and
cached solve set live in `chrome.storage.local` and survive the reload.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "This extension key was rejected or revoked. Replace it to resume sync." | The key was revoked, expired, or lacks the `dsa-tracker:extension` scope. Mint a fresh one at `/settings` and paste it over the old one (the button reads **Replace** once a key is stored) |
| "Add an extension API key to connect your tracker." | No key stored yet — step 5. Sync buttons stay disabled and **Mark current problem complete** reads "Connect an API key to record" |
| Sync says to open leetcode.com / neetcode.io and log in first | The collector runs inside a tab on that site. Open the site, confirm you are logged in there, leave the tab open, and re-run the sync |
| No banner on a takeuforward page | Banners only activate on problem-looking pages (`isProblemPage()`); article, playlist and index pages are deliberately skipped. TUF+ premium selectors were written from research rather than the live DOM — suspect them first if a genuine problem page stays silent |
| Marked something while offline / backend down | Nothing is lost. The service worker queues the write in `chrome.storage.local` and flushes it on the next successful sync; the popup shows "N write(s) are safely waiting" |
| Popup shows "Backend unreachable — showing cached data" | The solved-key cache renders without network. Writes queue as above |

### A note on `/plan`

`/plan` is **not** multi-tenant. It is gated on one hardcoded verified email —
`PLAN_OWNER_EMAIL` in [`apps/web/src/lib/auth.ts`](apps/web/src/lib/auth.ts) —
so on the hosted instance it is the maintainer's private workspace and any
other signed-in account is rejected. **Everything else works for any account:**
`/`, `/problems`, `/settings`, and all extension tracking are `user_id`-scoped
per user. If you self-host, change that one constant to your own email and
`/plan` is yours.

## Prerequisites

For the self-hosting / contributor path below:

- **Node 22+** (the release workflow builds on 22). There is no `.nvmrc` and no
  `engines` field — 22 is a floor, not an enforced pin.
- **`corepack enable`.** The root `package.json` pins
  `packageManager: pnpm@11.7.0`, and corepack is what makes that pin
  authoritative. **pnpm only** — npm or yarn will not resolve the workspace.
- A **Supabase** project (Postgres).
- A **Clerk** application **with the API Keys feature enabled** — without it,
  `/settings` cannot mint extension keys and nothing can authenticate `/api/*`.

## Setup

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Dashboard → **Connect** → copy the **Transaction pooler** URI
   (`...pooler.supabase.com:6543/postgres`).
3. `cp apps/web/.env.example apps/web/.env` and paste it as
   `DSA_TRACKER_DATABASE_URL` (URL-encode special characters in the password).
   The project-specific name is deliberate: a generic `DATABASE_URL` exported
   in your shell profile would silently win over `.env` otherwise.
4. Fill in `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and
   `CATALOG_REFRESH_SECRET` in the same file — see the
   [environment variables table](#2-environment-variables) for what each does.
   Without the Clerk pair, every page redirects to `/sign-in` and every API
   route 401s.

```sh
# from the repo root
pnpm install
pnpm db:migrate   # creates the tables
pnpm db:seed      # imports the full LeetCode problem catalog (~3,700 problems)
```

> **Seven migrations, `0000_charming_red_hulk` … `0006_enable_user_table_rls`**,
> all applied to the project Supabase database. `0004`/`0005` add and then
> enforce the `user_id` column on every user-owned table and `0006` enables RLS
> on them. A fresh database still needs `pnpm db:migrate`; `/plan` reads degrade
> to an empty state when its database is unavailable so builds can run offline.
>
> **`pnpm db:migrate` refuses to run on a pre-auth database that still has
> rows.** `apps/web/scripts/migrate.ts` checks for user tables that exist
> without a `user_id` column and aborts with *"Legacy rows detected. Run
> `pnpm auth:backfill -- --user-id user_xxx --commit` before db:migrate."* —
> because `0005` would otherwise try to make `user_id` NOT NULL over rows that
> have none. **Irrelevant on a fresh database**, where the guard never fires.
> See [`docs/auth-rollout.md`](docs/auth-rollout.md).
>
> To carry over state from the old standalone plan app, see
> [`docs/plan-migration.md`](docs/plan-migration.md) (`pnpm plan:migrate`,
> dry run by default, writes require `--commit`).

### 2. Web app

```sh
pnpm dev          # http://localhost:3000
```

To ship it, see **[Deployment](#deployment-vercel)** below.

### 3. Extension — building from source

Only needed if you are changing extension code or self-hosting the backend.
To *use* the tracker, take the released zip instead:
[Install the extension](#install-the-extension).

```sh
cd apps/extension
pnpm build        # outputs .output/chrome-mv3/
pnpm zip          # outputs .output/extension-<version>-chrome.zip
```

1. Open `chrome://extensions` (same in Edge / Brave / Helium) → enable
   **Developer mode** → **Load unpacked** → select
   `apps/extension/.output/chrome-mv3/` (the folder containing
   `manifest.json`).
2. Open the popup → paste an extension API key minted at `/settings` into
   **Extension API key** → **Connect**.
3. Click **Sync from LeetCode** with a logged-in leetcode.com tab open to import
   your existing solve history.

> **The backend URL is compiled in — there is no popup field for it.**
> `DEFAULT_API_BASE` is a constant at
> `apps/extension/entrypoints/background.ts:29`, and `normalizeBase()` (`:112`)
> ignores its argument and always returns it, so a stale `SET_API_BASE` message
> from an old popup cannot redirect authenticated traffic elsewhere. **To point
> the extension at your own deployment you must edit two files and rebuild:**
> that constant, *and* the matching origin in the manifest's `host_permissions`
> (`apps/extension/wxt.config.ts:19`) — the service worker cannot fetch an
> origin the manifest does not grant. Changing one without the other fails
> silently at the network layer.

During development, `pnpm dev:ext` runs WXT dev mode with hot reload.
Step-by-step walkthrough: [`docs/load-extension.md`](docs/load-extension.md).

## Deployment (Vercel)

Only `apps/web` is deployed. The extension is loaded unpacked from a local
build and is **not** part of the Vercel deploy — see
[Extension vs. web app](#extension-vs-web-app-they-ship-separately).

Every command below runs from the repository checkout root unless stated
otherwise; paths are relative to it.

### 1. Create the Vercel project

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. **Set Root Directory to `apps/web`.** This is the step that is easy to miss
   and that everything else depends on. Vercel reads only the `vercel.json`
   found at the project's Root Directory, so with anything else set, the config
   below is never read.
3. **Leave Framework Preset, Install Command, Build Command and Output
   Directory on their defaults / unset.** They are already declared in
   [`apps/web/vercel.json`](apps/web/vercel.json), and a value typed into the
   dashboard overrides the file:

   ```json
   {
     "framework": "nextjs",
     "regions": ["hnd1"],
     "installCommand": "pnpm install --frozen-lockfile",
     "buildCommand": "pnpm --filter web build",
     "outputDirectory": ".next",
     "functions": {
       "app/api/backfill/route.ts": { "maxDuration": 60 },
       "app/api/catalog/refresh/route.ts": { "maxDuration": 60 }
     }
   }
   ```

   Every path inside that file (`outputDirectory`, the `functions` keys) is
   relative to `apps/web`.

> **There is deliberately no `vercel.json` at the repo root.** One used to exist
> and was deleted during the merge: because the Root Directory is `apps/web`,
> Vercel never read it, so its `maxDuration` overrides silently never applied.
> Do not recreate it — a root file will look like it is configuring the deploy
> and will do nothing.

### 2. Environment variables

Add these in **Project → Settings → Environment Variables** for Production (and
Preview, if you want previews to hit the same database). The same set lives in
[`apps/web/.env.example`](apps/web/.env.example) for local development.

| Variable | Required | What it is |
|---|---|---|
| `DSA_TRACKER_DATABASE_URL` | yes | `postgres://postgres.<ref>:<password>@aws-<region>.pooler.supabase.com:6543/postgres`. Supabase dashboard → **Connect** → **Transaction pooler**. URL-encode special characters in the password |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk → API keys. Client-side, so it is public by design |
| `CLERK_SECRET_KEY` | yes | Clerk → API keys. Server-only; this is what verifies extension API keys |
| `CATALOG_REFRESH_SECRET` | yes | Shared secret for `POST /api/catalog/refresh`, sent as the `x-catalog-refresh-secret` header. **Leaving it unset does not open the route — it 401s unconditionally**, so catalog refresh over HTTP becomes impossible |
| `LEGACY_OWNER_USER_ID` | no | Clerk user id that unauthenticated API calls are attributed to while `ALLOW_UNAUTHENTICATED_API` is on. Migration bridge only |
| `ALLOW_UNAUTHENTICATED_API` | no | Defaults to `false`. **Leave it that way.** See the warning below |

> **`ALLOW_UNAUTHENTICATED_API=true` makes `/api/*` writable by anyone who
> knows the URL** — it attributes any request *with no `Authorization` header
> at all* to `LEGACY_OWNER_USER_ID`. It is deliberately **not** a fallback for
> a bad key: a present-but-invalid `Bearer` token still 401s, so it can never
> mask a revoked key. It exists solely to keep an old un-keyed extension
> working during the cutover. Set both values back to empty / `false` once your
> extension is connected with a real key.

**The transaction pooler is mandatory in production, and this is enforced in
code.** `apps/web/src/db/index.ts` validates the value on first use and throws
on three things:

1. A value that still carries its own variable-name prefix (`DSA_TRACKER_DATABASE_URL=postgres://…`)
   — a common copy-paste artifact. Paste the URI only.
2. Anything not beginning with `postgres://` or `postgresql://`.
3. **When `process.env.VERCEL` is set** (i.e. only on Vercel), a direct
   `db.<ref>.supabase.co` endpoint, with:
   `DSA_TRACKER_DATABASE_URL must use the Supabase Transaction pooler on Vercel (pooler.supabase.com, port 6543), not the direct database endpoint.`

Why: each serverless function instance gets its own `postgres.js` client,
configured `max: 1` and `prepare: false` (transaction-mode Supavisor cannot
safely use named prepared statements). The shared database-side pool lives in
Supavisor. Direct connections from a scaling-out serverless deploy exhaust
Postgres connection slots, which is why rule 3 exists rather than being left to
convention. Don't raise `max`, and don't `Promise.all` server reads.

The project-specific variable name is also deliberate: the code reads
`DSA_TRACKER_DATABASE_URL` first and only falls back to `DATABASE_URL`, because
locally a generic `DATABASE_URL` exported in the shell profile (pointing at an
unrelated database) wins over `.env`. **Do not set a bare `DATABASE_URL` on
Vercel.**

**Do not copy the `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` keys** that may be
sitting in your local `apps/web/.env` (`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). They are
dead config: nothing in this repo uses `supabase-js` or the Supabase REST/auth
APIs — the app talks raw Postgres over `postgres.js`. Copying them to Vercel
puts a service-role secret in a deployment that reads it never.

There is no environment variable for the extension's API base URL — it is a
compile-time constant in the extension source (step 5).

### 3. Region

`apps/web/vercel.json` pins `"regions": ["hnd1"]` (Tokyo), chosen to sit close
to the Supabase instance. Every page is server-rendered and DB-bound, so
function↔database round-trip time dominates the response. **Changing the region
without moving the Supabase project adds latency to every request** — move both
or neither.

### 4. First deploy: set up the database

Migrations do **not** run during the Vercel build — `buildCommand` is only
`next build`. Run them yourself, from a local shell, against the remote
database, in this order:

```sh
# from the repo root
pnpm install
pnpm db:migrate   # applies 0000 … 0006
pnpm db:seed      # imports the LeetCode catalog (~3,700–4,000 rows)
```

Both read `DSA_TRACKER_DATABASE_URL` from `apps/web/.env` — the same Supabase
database Vercel points at, so this configures production from your laptop.
Confirm which database you are about to write to before running either
([`docs/RUNBOOK.md` step 0](docs/RUNBOOK.md)).

Order matters: `db:seed` upserts into `problems`, which `db:migrate` creates,
and `solved_problems.lc_slug` has an FK to `problems.lc_slug`. Both are
idempotent and safe to re-run.

The catalog step can be done against the deployed app instead of locally:

```sh
curl -X POST https://<your-app>.vercel.app/api/catalog/refresh \
  -H "x-catalog-refresh-secret: $CATALOG_REFRESH_SECRET"
# -> {"refreshed": <N>}
```

That route is the one API endpoint that does **not** take an extension bearer
key — it is machine-to-machine, so it matches its own header against
`CATALOG_REFRESH_SECRET`. If that variable is unset in the deployment, the
route 401s no matter what you send.

That route runs the identical routine server-side. There is **no** equivalent
API route for migrations — `pnpm db:migrate` is the only way to apply schema.

### 5. Point the extension at your deployment

**The backend URL is not runtime configuration.** The popup has exactly one
input — the API key — and no API-base field; it was removed in `71b204e`. Two
places hold the origin, and both must change together:

| File | What to change |
|---|---|
| `apps/extension/entrypoints/background.ts:29` | `DEFAULT_API_BASE` — the only value `normalizeBase()` ever returns |
| `apps/extension/wxt.config.ts:19` | the `host_permissions` entry `https://dsa-tracker-final-web.vercel.app/*` |

The manifest lists that **one fixed origin**, not a wildcard — there is no
`https://*.vercel.app/*` grant, so your preview URLs and any custom domain are
*not* covered. The content scripts are CORS-bound to their host page, which is
why every backend fetch goes through the service worker, and the service worker
can only reach origins the manifest grants. Change one file without the other
and requests fail at the network layer with no UI error.

```sh
cd apps/extension
pnpm build        # outputs .output/chrome-mv3/
```

`chrome://extensions` → **Developer mode** → **Load unpacked** →
`apps/extension/.output/chrome-mv3/`. Then open the popup, paste a key minted
at `https://<your-app>.vercel.app/settings`, and click **Connect**. Full
walkthrough, including the one-time history syncs:
[`docs/load-extension.md`](docs/load-extension.md).

### 6. Verify the deploy

**A green build proves nothing about the database.** All three pages are
`export const dynamic = 'force-dynamic'` and every read is wrapped to log and
return empty state, so a completely unreachable database still produces a
successful build and three rendering pages. Check the data, not the status
badge.

| Check | Healthy result |
|---|---|
| `https://<app>.vercel.app/` | Dashboard renders with your **non-zero** unique-solved total and recent activity |
| `https://<app>.vercel.app/plan` | 26 day cards, phase rings, counters. Empty/zero counters are expected before any plan writes; day cards always render |
| `https://<app>.vercel.app/problems` | Full solved table. Empty here after `db:seed` + a history sync means a broken connection, not "no data" |
| `curl -H "Authorization: Bearer $KEY" https://<app>.vercel.app/api/stats` | `200` with a JSON body containing totals and the difficulty/source breakdown |
| `curl -H "Authorization: Bearer $KEY" 'https://<app>.vercel.app/api/resolve?slug=two-sum'` | `{"problem":{"lcSlug":"two-sum",…}}`. `{"problem":null}` means the catalog was never seeded (step 4) |

The three page checks assume a signed-in browser session — hit signed out, each
one redirects to `/sign-in?redirect_url=…`, which is correct behaviour, not a
failure. `$KEY` is an extension API key from `/settings`; without it those two
routes return `401 {"error":"A valid extension API key is required"}`.

If a page renders empty, look at the Vercel function logs for
`rendering empty state` / `[api/…]` lines — that is where a rejected
`DSA_TRACKER_DATABASE_URL` surfaces.

Then do the end-to-end check: solve a plan problem on leetcode.com with the
extension pointed at production and confirm it ticks itself on `/plan`
([`docs/RUNBOOK.md` step 6](docs/RUNBOOK.md)).

### 7. Function timeouts

Two routes do bulk work and are given 60 seconds:

- `POST /api/backfill` — bulk-imports LeetCode slugs from a history sync
- `POST /api/catalog/refresh` — re-fetches the whole LeetCode catalog

Each is declared **twice**, on purpose: in the `functions` block of
`apps/web/vercel.json`, and in code as `export const maxDuration = 60` in the
route file. The in-code declaration is the backstop that survives the
`vercel.json` being misplaced (as the root-level file historically was). Every
other route runs on the account default.

### 8. Redeploying and rolling back

- **Redeploy:** push to the tracked branch, or **Deployments → ⋯ → Redeploy**
  in the dashboard. A code-only change needs nothing else.
- **Rollback:** promote a previous deployment from **Deployments**. This rolls
  back *code only* — Vercel does not touch the database, and none of the
  migrations here are reversible (`0002_curly_bloodstorm` drops an index).
  Rolling code back past a schema change means reverting the schema by hand.
- **Schema changes:** run `pnpm db:migrate` **before** promoting a deploy that
  depends on the new tables, since the running functions will start querying
  them immediately.

#### Extension vs. web app: they ship separately

The extension is not deployed by Vercel and is not versioned with it. It ships
as a zip on GitHub Releases (or a local build) and is loaded unpacked, so **the
two halves can drift out of sync**: an old unpacked extension keeps talking to
a freshly deployed API until the user reloads it.

`packages/shared` is the contract between them — request/response shapes for
all seven `/api/*` routes. A backwards-compatible change (a new optional field)
can ship web-first. **A breaking change there means shipping both**: deploy the
web app and rebuild + reload the extension, or the extension will silently send
or expect the wrong shape. The `/plan` half writes through Server Actions
instead and is never version-skewed, because it deploys as one unit with the
page.

## API

| Route | Purpose |
|---|---|
| `GET /api/solved` | Full solved list + canonical keys + totals |
| `POST /api/solve` | Record a solve (no-op if already solved; always logs an event) |
| `POST /api/backfill` | Bulk-import LeetCode slugs from history sync |
| `POST /api/import` | Bulk-import NeetCode problem ids from the NeetCode sync — resolves each to `lc:` via the catalog (by slug, then by title) or keeps it as `nc:` |
| `GET /api/stats` | Totals, difficulty/source breakdown, solves over time |
| `GET /api/resolve?slug=&title=` | Map a slug or title to a catalog problem |
| `POST /api/catalog/refresh` | Re-fetch the LeetCode catalog |

Those seven are the complete set.

### Auth

The **first six** take an opaque extension key as a bearer token:

```
Authorization: Bearer <secret minted at /settings>
```

`requireApiUser()` ([`apps/web/src/lib/auth.ts`](apps/web/src/lib/auth.ts))
hands the secret to `clerkClient().apiKeys.verify()` and returns the owning
Clerk user id — but **only** after rejecting keys that are revoked, expired,
belong to an organization subject (`org_` prefix), or lack the
`dsa-tracker:extension` scope. A generic Clerk user key therefore does not
work; the key must have been minted by `/settings`, which sets that scope.
Anything else gets:

```
401  {"error":"A valid extension API key is required"}
Cache-Control: no-store
Vary: Authorization
```

The seventh, `POST /api/catalog/refresh`, is machine-to-machine and instead
matches an `x-catalog-refresh-secret` header against `CATALOG_REFRESH_SECRET`.

Every returned user id scopes the query: `solved_problems`, `solve_events`,
`plan_checks`, `plan_days` and `plan_counters` all carry a `user_id` column and
have RLS enabled
([`apps/web/drizzle/0006_enable_user_table_rls.sql`](apps/web/drizzle/0006_enable_user_table_rls.sql)).

Keys are managed at [`/settings`](apps/web/app/settings/page.tsx). **A created
key's secret is returned once, on the creating call, and is never retrievable
afterwards** — `createExtensionKey` in
[`apps/web/app/settings/actions.ts`](apps/web/app/settings/actions.ts) passes it
straight to the client for a one-time display. Lost keys get revoked and
replaced, not recovered.

### Middleware

`/api/*` is the **extension's** contract, versioned by `packages/shared`. The
`/plan` page writes through Next.js Server Actions (`apps/web/app/plan/actions.ts`)
instead, so it deliberately adds no routes here.

`apps/web/proxy.ts` is `clerkMiddleware`. It redirects unauthenticated *page*
requests to `/sign-in?redirect_url=<path>`, but returns early for `/api/*` so
route handlers own their own JSON 401 contract instead of being redirected into
an HTML sign-in page — an extension parsing JSON must never receive a 307 to
HTML.

**It sets no CORS headers, and neither does anything else in this repo** —
there is no `Access-Control-*` anywhere. None is needed: the extension's
requests originate in the service worker under `host_permissions`, not in a
page, so no preflight is involved. Adding CORS headers would only make the API
reachable from arbitrary websites.

The app runs **Next.js 16.2.11** (upgraded from 15), which renamed the
`middleware` file convention to `proxy` — same Node-runtime interceptor, same
`matcher`, new filename and exported function name. There is no `middleware.ts`
any more; do not add one back.

## Docs

| Doc | What's in it |
|---|---|
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | The full ordered bring-up: which commands write what, the `DATABASE_URL` shadowing trap, per-step verification, the end-to-end auto-tick check, and troubleshooting. Start here for anything operational |
| [`docs/plan-migration.md`](docs/plan-migration.md) | Moving the old standalone plan app's Neon `tracker_state` blob into `plan_checks` / `plan_days` / `plan_counters` — `pnpm plan:migrate`, every flag, and how to read the dry-run report |
| [`docs/load-extension.md`](docs/load-extension.md) | Two paths, in order: **A.** install the released build (download the zip, load unpacked, connect an API key) and **B.** build from source. Plus the one-time LeetCode / NeetCode history syncs |
| [`docs/auth-rollout.md`](docs/auth-rollout.md) | The Clerk cutover: `pnpm auth:backfill`, `ALLOW_UNAUTHENTICATED_API`, and the ordering the `0004`/`0005` migrations require |
| [`.github/workflows/release-extension.yml`](.github/workflows/release-extension.yml) | Release automation — see below |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) | Architecture and invariants for coding agents (identical twins — edit both) |

### Releasing the extension

Pushing a `v*` tag (or running the workflow manually against an existing tag)
builds the extension on Node 22 with `pnpm --filter extension zip`, renames the
archive from WXT's `extension-<version>-chrome.zip` to
`dsa-tracker-extension-<tag>-chrome.zip`, and attaches it to a GitHub Release
with generated notes plus install instructions.

**Bump `apps/extension/package.json` `version` and commit it *before* tagging.**
The workflow's first real step compares the tag (minus its `v`) against that
field and fails the build if they differ — a mismatched pair would ship a
bundle Chrome refuses to treat as an update, so it fails loudly instead of
publishing. Non-`v<semver>` refs are rejected outright. Renaming happens at
upload time rather than via `zip.name` in `wxt.config.ts`, so the extension
source stays untouched.

```sh
# after bumping apps/extension/package.json to 0.2.0 and committing
git tag v0.2.0 && git push origin v0.2.0
```

## Future ideas (not built yet)

Topic-coverage breakdown, solve frequency, per-sheet progress bars
(NeetCode 150/250 %, A2Z %), GFG solve detection.

(Streaks shipped with `/plan` — a day counts when it is a trip day or all three
daily floors are met, walking back up to 60 days.)
