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
| `/plan` | 26-day study plan — daily tasks, per-day log, C++ phase milestones, resume checklist, hybrid counters, streak. **LeetCode problems in the plan tick themselves** after the extension records a solve; an already-open plan refreshes when its tab regains focus |
| `/problems` | Full solved-problem table — every canonical key with its title, difficulty, source, and first-solve date |

### Workspaces

- `apps/extension` — WXT (Manifest V3) browser extension for Chrome / Helium
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
**Accepted submission is auto-detected**; on neetcode.io and takeuforward.org
the extension shows a **"Mark as completed?"** prompt.

## Setup

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Dashboard → **Connect** → copy the **Transaction pooler** URI
   (`...pooler.supabase.com:6543/postgres`).
3. `cp apps/web/.env.example apps/web/.env` and paste it as
   `DSA_TRACKER_DATABASE_URL` (URL-encode special characters in the password).
   The project-specific name is deliberate: a generic `DATABASE_URL` exported
   in your shell profile would silently win over `.env` otherwise.

```sh
cd /path/to/dsa-merged   # repo root
pnpm install
pnpm db:migrate   # creates the tables
pnpm db:seed      # imports the full LeetCode problem catalog (~3,700 problems)
```

> **All three migrations are applied** to the project Supabase database:
> `0000_charming_red_hulk`, `0001_easy_toxin`, and `0002_curly_bloodstorm`.
> A fresh database still needs `pnpm db:migrate`; `/plan` reads degrade to an
> empty state when its database is unavailable so builds can run offline.
> To carry over state from the old standalone plan app, see
> [`docs/plan-migration.md`](docs/plan-migration.md) (`pnpm plan:migrate`,
> dry run by default, writes require `--commit`).

### 2. Web app

```sh
pnpm dev          # http://localhost:3000
```

To ship it, see **[Deployment](#deployment-vercel)** below.

### 3. Extension (Chrome / Helium)

```sh
cd apps/extension
pnpm build        # outputs .output/chrome-mv3/
```

1. Open `chrome://extensions` (same in Helium) → enable **Developer mode** →
   **Load unpacked** → select `apps/extension/.output/chrome-mv3/`.
2. Click the extension icon → set the **API base URL** (default
   `http://localhost:3000`; set your Vercel URL once deployed).
3. Click **Sync from LeetCode** with a logged-in leetcode.com tab open to import
   your existing solve history.

During development, `pnpm dev:ext` runs WXT dev mode with hot reload.
Step-by-step walkthrough: [`docs/load-extension.md`](docs/load-extension.md).

## Deployment (Vercel)

Only `apps/web` is deployed. The extension is loaded unpacked from a local
build and is **not** part of the Vercel deploy — see
[Extension vs. web app](#extension-vs-web-app-they-ship-separately).

Repo root for every command below: the repository checkout
(`/Users/rishit/Coding/dsa-merged` on this machine).

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

One variable. Add it in **Project → Settings → Environment Variables** for
Production (and Preview, if you want previews to hit the same database):

| Variable | Value |
|---|---|
| `DSA_TRACKER_DATABASE_URL` | `postgres://postgres.<ref>:<password>@aws-<region>.pooler.supabase.com:6543/postgres` |

Get it from the Supabase dashboard → **Connect** → **Transaction pooler**.
URL-encode special characters in the password.

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

There is no environment variable for the extension's API base URL; the
extension stores that in `chrome.storage` and it is set in the popup (step 5).

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
cd /Users/rishit/Coding/dsa-merged
pnpm install
pnpm db:migrate   # applies 0001_easy_toxin + 0002_curly_bloodstorm
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
curl -X POST https://<your-app>.vercel.app/api/catalog/refresh
# -> {"refreshed": <N>}
```

That route runs the identical routine server-side. There is **no** equivalent
API route for migrations — `pnpm db:migrate` is the only way to apply schema.

### 5. Point the extension at production

```sh
cd /Users/rishit/Coding/dsa-merged/apps/extension
pnpm build        # outputs .output/chrome-mv3/
```

`chrome://extensions` → **Developer mode** → **Load unpacked** →
`apps/extension/.output/chrome-mv3/`. Then open the popup and set **API base
URL** to `https://<your-app>.vercel.app` (no trailing path). Full walkthrough,
including the one-time history syncs:
[`docs/load-extension.md`](docs/load-extension.md).

The manifest's `host_permissions` include `https://*.vercel.app/*`
(`apps/extension/wxt.config.ts`), which is what lets the service worker reach
the deployed API. **A custom domain would not be covered** — you would have to
add it to `host_permissions` and rebuild/reload the extension.

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
| `curl https://<app>.vercel.app/api/stats` | `200` with a JSON body containing totals and the difficulty/source breakdown |
| `curl 'https://<app>.vercel.app/api/resolve?slug=two-sum'` | `{"problem":{"lcSlug":"two-sum",…}}`. `{"problem":null}` means the catalog was never seeded (step 4) |

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

The extension is not deployed by Vercel and is not versioned with it. It is
built locally and loaded unpacked, so **the two halves can drift out of sync**:
an old unpacked extension keeps talking to a freshly deployed API.

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

Those seven are the complete set. No auth — the API is open by design for a
single-user personal deployment. Don't put anything sensitive in it.

`/api/*` is the **extension's** contract, versioned by `packages/shared`. The
`/plan` page writes through Next.js Server Actions (`apps/web/app/plan/actions.ts`)
instead, so it deliberately adds no routes here.

CORS headers for `/api/*` come from `apps/web/proxy.ts`. The app runs
**Next.js 16.2.11** (upgraded from 15), which renamed the `middleware` file
convention to `proxy` — same Node-runtime interceptor, same `matcher`, new
filename and exported function name. There is no `middleware.ts` any more; do
not add one back.

## Docs

| Doc | What's in it |
|---|---|
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | The full ordered bring-up: which commands write what, the `DATABASE_URL` shadowing trap, per-step verification, the end-to-end auto-tick check, and troubleshooting. Start here for anything operational |
| [`docs/plan-migration.md`](docs/plan-migration.md) | Moving the old standalone plan app's Neon `tracker_state` blob into `plan_checks` / `plan_days` / `plan_counters` — `pnpm plan:migrate`, every flag, and how to read the dry-run report |
| [`docs/load-extension.md`](docs/load-extension.md) | Building and loading the unpacked extension in Chrome / Helium, setting the API base URL, and the one-time LeetCode / NeetCode history syncs |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) | Architecture and invariants for coding agents (identical twins — edit both) |

## Future ideas (not built yet)

Topic-coverage breakdown, solve frequency, per-sheet progress bars
(NeetCode 150/250 %, A2Z %), GFG solve detection.

(Streaks shipped with `/plan` — a day counts when it is a trip day or all three
daily floors are met, walking back up to 60 days.)
