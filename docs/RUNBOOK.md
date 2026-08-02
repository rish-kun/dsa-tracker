# Operator runbook — bringing the merged repo up

> **Roadmap v2 note:** an existing pre-auth database must follow
> [`docs/auth-rollout.md`](./auth-rollout.md) before running `pnpm db:migrate`.
> The guarded migrator will refuse to finalize legacy rows without ownership.

> ## NOTHING HAS BEEN APPLIED TO ANY DATABASE YET.
>
> No migration has been run, no catalog seeded, no plan progress migrated. The
> merge exists only as source in the working tree. **[Step 2](#2-apply-the-schema)
> (`pnpm db:migrate`) is the first command in this document that writes
> anything anywhere.** Steps 0–1 are read-only.
>
> Every step below that mutates state is flagged **WRITES**. Everything else is
> safe to run and re-run.

Repo root for every command in this doc: `/Users/rishit/Coding/dsa-merged`.

| Step | Command | Writes? |
| --- | --- | --- |
| 1. Prerequisites | `pnpm install` | local `node_modules` only |
| 2. Schema | `pnpm db:migrate` | **WRITES — Supabase DDL** |
| 3. Catalog | `pnpm db:seed` | **WRITES — `problems` rows** |
| 4. Plan progress | `pnpm plan:migrate … --commit` | **WRITES — `plan_*` rows** |
| 5. Run | `pnpm dev`, `pnpm dev:ext` | no |
| 6. Verify end-to-end | manual | **WRITES — real solve rows** |
| 7. Deploy | Vercel | **WRITES — production** |

---

## 0. The one trap that will silently ruin everything

Your shell profile exports a generic `DATABASE_URL` **pointing at an unrelated
Neon database**. Both `dotenv` (used by the scripts and `drizzle.config.ts`) and
Next.js let a pre-existing process env var win over `.env`. That is why every
piece of this repo reads **`DSA_TRACKER_DATABASE_URL` first** and only falls back
to `DATABASE_URL` (`apps/web/src/db/index.ts`, `apps/web/drizzle.config.ts`).

Before you run **anything** in step 2 or later, confirm which database you are
about to talk to:

```sh
cd /Users/rishit/Coding/dsa-merged
echo "shell DATABASE_URL      : ${DATABASE_URL:-<unset>}" | sed -E 's#:[^:@/]*@#:****@#'
grep -E '^DSA_TRACKER_DATABASE_URL=' apps/web/.env | sed -E 's#:[^:@/]*@#:****@#'
```

The second line is the one that must be your Supabase host. If
`DSA_TRACKER_DATABASE_URL` is unset in `.env`, the fallback kicks in and
**`pnpm db:migrate` will create the plan tables inside the unrelated Neon
database.** That is the single most damaging mistake available here, and it is
not detectable after the fact without inspecting both databases.

Three validation rules are enforced in `apps/web/src/db/index.ts` — know them so
the error messages make sense:

1. The value must be the URI **only**. A value that itself starts with
   `DSA_TRACKER_DATABASE_URL=` or `DATABASE_URL=` is rejected (a common
   copy-paste error out of `vercel env pull` output).
2. It must begin with `postgres://` or `postgresql://`.
3. **On Vercel only** (`process.env.VERCEL` set), the direct Supabase endpoint
   `db.<ref>.supabase.co` (port 5432) is hard-rejected. Production must use the
   transaction pooler, `…pooler.supabase.com:6543`. See [step 7](#7-deploy).

---

## 1. Prerequisites

### Toolchain

**pnpm only — never `npm` or `yarn`.** The repo is a pnpm workspace
(`pnpm-workspace.yaml` globs `apps/*` and `packages/*`) and uses
`workspace:*` dependency protocol, which npm/yarn cannot resolve. `package.json`
pins `"packageManager": "pnpm@11.7.0"`.

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm install
```

Verified present locally: Node v26.5.0, pnpm 11.7.0.

This also runs `wxt prepare` for the extension via its `postinstall`, and pulls
in `@neondatabase/serverless` (an `apps/web` devDependency needed only by
[step 4](#4-migrate-old-plan-progress-from-neon), and only when reading the
legacy database live).

### Environment

All env vars live in **`apps/web/.env`** (gitignored;
`apps/web/.env.example` is the template).

| Variable | Required for | Notes |
| --- | --- | --- |
| `DSA_TRACKER_DATABASE_URL` | steps 2, 3, 4, 5 | Supabase Postgres URI. Use the transaction pooler form: `postgres://postgres.<ref>:<password>@aws-<region>.pooler.supabase.com:6543/postgres`. |
| `NEON_LEGACY_DATABASE_URL` | step 4 only, and only without `--from-file` | The **old** `dsa-track` Neon database. The migration reads this name and *only* this name — it never falls back to `DATABASE_URL`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | authenticated web app | Clerk frontend and server credentials. |
| `CATALOG_REFRESH_SECRET` | catalog refresh | Required as `x-catalog-refresh-secret`. |
| `LEGACY_OWNER_USER_ID`, `ALLOW_UNAUTHENTICATED_API` | temporary auth rollout only | See [`auth-rollout.md`](./auth-rollout.md); remove/disable after the extension is keyed. |

The `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` keys already present in
`apps/web/.env` are not read by any code path in this runbook — the app connects
over raw Postgres via `postgres.js`, not `supabase-js`.

Verify without printing secrets:

```sh
cd /Users/rishit/Coding/dsa-merged/apps/web
grep -E '^(DSA_TRACKER_DATABASE_URL|NEON_LEGACY_DATABASE_URL)=' .env | sed -E 's#:[^:@/]*@#:****@#'
```

---

## 2. Apply the schema — **WRITES (DDL, first write of the whole sequence)**

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm db:migrate
```

(`pnpm db:migrate` → `pnpm --filter web db:migrate` → the guarded Drizzle
migrator in `apps/web/scripts/migrate.ts`.) Existing databases with pre-auth
rows must complete the staged ownership backfill first.

### What is in the migration folder

`apps/web/drizzle/` holds three migrations, all applied to the project database:

| File | Contents | State |
| --- | --- | --- |
| `0000_charming_red_hulk.sql` | `problems`, `solved_problems`, `solve_events` + their FK and indexes | **applied** |
| `0001_easy_toxin.sql` | `plan_checks`, `plan_days`, `plan_counters` | **applied** |
| `0002_curly_bloodstorm.sql` | catalog-resolution and solve-event index changes | **applied** |

drizzle-kit tracks applied migrations in its own `drizzle.__drizzle_migrations`
table, so applied migrations are skipped automatically and re-running the
command is a no-op.

### What `0001` does and does not do

Creates, all `CREATE TABLE` only:

- `plan_checks` — `check_id` (PK, text), `done` (bool), `updated_at`
- `plan_days` — `date` (PK, text `YYYY-MM-DD`), `log`, `floor_dsa`, `floor_cpp`, `floor_log`, `trip`
- `plan_counters` — `id` (PK), `dsa`, `dsa_extra`, `dsa_hist` (jsonb), `dsa_extra_hist` (jsonb)

It contains **no `ALTER`, no `DROP`, and no `INSERT`.** It does not touch
`problems`, `solved_problems`, or `solve_events` in any way — your existing
solve history is not read, modified, or dropped by this step.

### Verify

```sh
cd /Users/rishit/Coding/dsa-merged/apps/web
psql "$(grep -E '^DSA_TRACKER_DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')" \
  -c "\dt public.*"
```

Expect six tables: `plan_checks`, `plan_counters`, `plan_days`, `problems`,
`solve_events`, `solved_problems`.

If you would rather not shell out a connection string, the equivalent check in
the Supabase dashboard is **Table Editor** → confirm the three `plan_*` tables
exist and are empty.

---

## 3. Seed the LeetCode catalog — **WRITES (`problems` rows)**

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm db:seed
```

(`apps/web/scripts/seed-catalog.ts` → `refreshCatalog()` in
`apps/web/src/lib/catalog.ts`.) It fetches `https://leetcode.com/api/problems/all/`
— a public, unauthenticated endpoint — and upserts roughly **3,700–4,000 rows**
into `problems` in chunks of 500. Expected output: `Catalog refreshed: <N> problems`.

Idempotent: every row is an upsert keyed on `lc_slug`. Re-run it whenever
LeetCode adds problems.

### Why this matters, and why it is not optional

The catalog is the **identity resolution table** for the entire system. Without
it:

- `POST /api/resolve` cannot map a NeetCode URL slug or a problem title to a
  LeetCode slug, so a NeetCode/TUF solve falls back to the `nc:` / `tuf:`
  namespace and lands in the "other" counter instead of deduping against the
  LeetCode key.
- A detected solve therefore never resolves to the same `lc:<slug>` that
  `packages/plan-data` carries as `canonicalKey`, and **`/plan` will never
  auto-tick** — which is the whole point of the merge (see [step 6](#6-verify-the-merge-actually-worked)).
- `solved_problems.lc_slug` has an FK to `problems.lc_slug`.

### In production

The same routine is exposed as an API route:

```sh
curl -X POST https://<your-vercel-url>/api/catalog/refresh
```

(`apps/web/app/api/catalog/refresh/route.ts`, `maxDuration = 60`.) Returns
`{"refreshed": <N>}`.

---

## 4. Migrate old plan progress from Neon — **WRITES on `--commit` only**

This step moves the old `dsa-track` app's single `tracker_state` jsonb blob out
of the legacy **Neon** database into `plan_checks` / `plan_days` /
`plan_counters`. It is fully documented — including how to obtain the legacy
connection string, how to read the report, and every flag:

### → **[`docs/plan-migration.md`](./plan-migration.md)** — follow it end to end.

Where it fits and what not to get wrong:

- It **must run after [step 2](#2-apply-the-schema)**. The target tables come
  from `0001_easy_toxin.sql`; without them `--commit` fails with
  `relation "plan_checks" does not exist`.
- It is **independent of [step 3](#3-seed-the-leetcode-catalog)** — order between
  them does not matter.
- **Do the offline dry run first.** `pnpm plan:migrate -- --from-file
  ~/legacy-state.json` opens **no database connection at all** — not to Neon,
  not to Supabase — and needs no env var set. Use an **absolute** path: the
  script's working directory is `apps/web`, not where you typed the command.
- **PASS means zero unmapped keys.** The run must end with
  `RESULT: PASS — 0 unmapped keys.` and exit `0`. Anything under `UNMAPPED` is a
  key the rewrite could not place — committing past it is silent data loss.
  `--commit` refuses to write while anything is unmapped (`--allow-unmapped`
  overrides that and accepts the loss; do not use it casually).
- Read the `COLLISIONS` section before committing. It is the only place the
  migration makes a judgement call (old `d{i}_t{j}` and `d{i}_{j}` both fold onto
  one new id, resolved with OR — `true` wins).
- Every write is an upsert, so `--commit` is safe to re-run. It **never
  deletes**: rows written by an earlier run that a later run no longer produces
  are left behind and must be removed by hand.

**Skip this step entirely** if you have no old Neon progress worth keeping — the
plan simply starts empty, and LeetCode items still auto-tick from real solves.

### Not part of this sequence: `pnpm plan:keys`

`apps/web/scripts/resolve-plan-keys.ts` (`pnpm plan:keys`) is a **one-off
codegen that has already been run.** It populated `canonicalKey` on 67 of the 72
plan problems in `packages/plan-data/src/index.ts`, and those values are
committed as source. The remaining 5 are Striver-sheet entries with no LeetCode
number; they can only ever be ticked by hand.

It touches no database (no `db` import, no `DATABASE_URL`) — it rewrites a
source file. **Only re-run it if you edit the curriculum** in
`packages/plan-data`. Dry run first:

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm plan:keys -- --dry-run
```

Note it asserts `EXPECTED_TOTAL = 72` / `EXPECTED_RESOLVED = 67`, so it will
fail loudly until you update those constants alongside a curriculum change.

---

## 5. Run it

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm dev
```

Serves the Next.js app and API on <http://localhost:3000>. Check all three
routes:

| Route | File | Expect |
| --- | --- | --- |
| <http://localhost:3000/plan> | `apps/web/app/plan/page.tsx` | 26-day plan, day cards, counters, phase rings |
| <http://localhost:3000/> | `apps/web/app/page.tsx` | dashboard — unique-solved total, difficulty/source breakdown, recent activity |
| <http://localhost:3000/problems> | `apps/web/app/problems/page.tsx` | full solved table |

All three are `force-dynamic` and every DB read is wrapped to degrade to empty
state — **a page that renders is not proof the database is connected.** An empty
`/problems` after [step 3](#3-seed-the-leetcode-catalog) means either no solves
yet (fine) or a broken connection (check the dev-server console for
`getPlanState failed, rendering empty state:` / equivalent).

### The extension

Build and load per **[`docs/load-extension.md`](./load-extension.md)** — build,
`chrome://extensions` → Developer mode → Load unpacked, then point the popup's
**API base URL** at `http://localhost:3000`.

For live-reload development instead of a static unpacked build:

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm dev:ext
```

If you have not imported history before, do the one-time **Sync from LeetCode**
(and **Sync from NeetCode**) from the popup — see step 4 of that doc.

---

## 6. Verify the merge actually worked

This is the check the entire merge exists for. Everything above can succeed
while this still fails.

**Pick a problem that (a) is in the 26-day curriculum, (b) has a `canonicalKey`
in `packages/plan-data/src/index.ts` — i.e. an `LC <number>` entry, not one of
the 5 Striver-only ones, and (c) you have not already solved** (an already-solved
key produces `isNew: false` and no dashboard increment). Then, with `pnpm dev`
running and the extension loaded and pointed at it:

1. **Solve it on leetcode.com** — submit and get Accepted.
2. **Extension records it.** The in-page banner/toast (bottom-right) confirms
   the solve. If it says *Already solved*, the key was already in
   `solved_problems` — pick a different problem.
3. **Dashboard increments.** Reload <http://localhost:3000/> — the unique-solved
   count goes up by one, and the problem appears in recent activity and on
   `/problems`.
4. **`/plan` auto-ticks.** Reload <http://localhost:3000/plan> and find that
   problem on its day. **Its checkbox is now ticked, and you never clicked it.**

All four must hold. If 1–3 pass but 4 fails, the likely cause is a
`canonicalKey` mismatch — the recorded key is not `lc:<the same slug>` (check
`/problems` for the key actually stored, and re-run [step 3](#3-seed-the-leetcode-catalog)
if a NeetCode/TUF solve fell back to an `nc:` / `tuf:` key).

### The precedence rule — read this before you touch a checkbox

```ts
checked = manual[checkId] ?? autoSolved[checkId] ?? false
```

(`resolveChecks` in `apps/web/app/plan/page.tsx`.)

- **`plan_checks` stores explicit overrides only.** The absence of a row does
  **not** mean "unchecked" — it means "derive this from `solved_problems`".
- A **manual toggle always wins**, and that includes an explicit **untick**: a
  `plan_checks` row with `done = false` keeps an item unticked even though the
  extension has recorded the solve. The `??` (not `||`) is what makes that
  `false` survive.
- Auto-ticking writes **nothing** to `plan_checks`. Rows appear only when you
  click.
- Consequence: **never backfill `plan_checks` from `solved_problems`.** That
  would convert every derived tick into a frozen override and permanently break
  future auto-ticks. (The step-4 migration writing `done = false` rows is
  correct and different — each of those was a deliberate click in the old app.)

---

## 7. Deploy — **WRITES (production)**

- **Vercel project Root Directory is `apps/web`.**
- **Config lives at `apps/web/vercel.json`.** It was *moved there from the repo
  root during the merge*: Vercel only reads the `vercel.json` at the project
  root directory, so the old root-level file was dead config and its function
  `maxDuration` overrides **silently never applied**. The root file is deleted;
  do not recreate it. Every path inside `apps/web/vercel.json`
  (`outputDirectory`, the `functions` keys) is relative to `apps/web`.
- Current contents set `framework: nextjs`, `regions: ["hnd1"]` (Tokyo — chosen
  to sit near the Supabase project), `installCommand: pnpm install
  --frozen-lockfile`, `buildCommand: pnpm --filter web build`,
  `outputDirectory: .next`, and `maxDuration: 60` for
  `app/api/backfill/route.ts` and `app/api/catalog/refresh/route.ts`. Those two
  routes also declare `export const maxDuration = 60` in code as a backstop.
- **`DSA_TRACKER_DATABASE_URL` in the Vercel project must be the transaction
  pooler URL** — `…pooler.supabase.com:6543`. `apps/web/src/db/index.ts` hard-rejects
  a direct `db.<ref>.supabase.co` endpoint whenever `process.env.VERCEL` is set,
  at runtime, with:
  `DSA_TRACKER_DATABASE_URL must use the Supabase Transaction pooler on Vercel (pooler.supabase.com, port 6543), not the direct database endpoint.`
  Paste the URI only — no `DSA_TRACKER_DATABASE_URL=` prefix inside the value.
- After deploying, seed the catalog in production if you haven't:
  `curl -X POST https://<your-vercel-url>/api/catalog/refresh`.
- Then update the extension popup's **API base URL** to the Vercel URL.

Note the client is configured for transaction-mode Supavisor: `prepare: false`
(named prepared statements are unsafe there) and `max: 1` per function instance.
Do not raise `max` — the shared pool lives in Supavisor, and every server read
is deliberately sequential rather than `Promise.all` for the same reason.

---

## 8. Troubleshooting

**`DATABASE_URL` shadowing — check this first, every time.**
Your shell exports a generic `DATABASE_URL` pointing at an unrelated Neon
database, and both dotenv and Next.js let a pre-existing env var win over
`.env`. Any DB command that "succeeded" but produced no visible effect probably
hit the wrong database. Always set and verify `DSA_TRACKER_DATABASE_URL`; never
assume an operation landed where you meant. See [step 0](#0-the-one-trap-that-will-silently-ruin-everything).

**`DSA_TRACKER_DATABASE_URL must contain only the PostgreSQL connection URI`** —
the value itself begins with `DSA_TRACKER_DATABASE_URL=` or `DATABASE_URL=`.
Strip the variable-name prefix from the value.

**`DSA_TRACKER_DATABASE_URL is not set`** — neither it nor `DATABASE_URL` is
present. Add it to `apps/web/.env`.

**Extension typecheck fails on a fresh clone.**
`apps/extension/tsconfig.json` extends the *generated* `.wxt/tsconfig.json`, so
it must be generated first:

```sh
cd /Users/rishit/Coding/dsa-merged/apps/extension
pnpm wxt prepare
node_modules/.bin/tsc --noEmit
```

**`npx tsc` resolves to the wrong compiler.**
In this repo a bare `npx tsc` misresolves to the unrelated npm package
`tsc@2.0.4` and produces nonsense errors. Always use the workspace binary:

```sh
cd /Users/rishit/Coding/dsa-merged/apps/web
node_modules/.bin/tsc --noEmit          # /Users/rishit/Coding/dsa-merged/apps/web/node_modules/.bin/tsc
```

```sh
cd /Users/rishit/Coding/dsa-merged/apps/extension
node_modules/.bin/tsc --noEmit
```

(There is no test suite; typecheck is the check.)

**"The build passed, so the database must be fine."** It doesn't and it isn't.
Every DB-touching page is `force-dynamic` and every read is wrapped to return
empty state on failure (`getPlanState` logs
`getPlanState failed, rendering empty state: …` and returns zeros). `pnpm build`
runs without a database on purpose. **A successful build proves nothing about DB
connectivity** — only [step 2's verify](#verify) and
[step 6](#6-verify-the-merge-actually-worked) do.

**`/plan` renders but everything is empty/zero.** Either the plan tables are
genuinely empty (expected before step 4) or the reads are failing silently.
Check the server console for the `rendering empty state` log line.

**`relation "plan_checks" does not exist`** — [step 2](#2-apply-the-schema) was
not run, or was run against the wrong database.

**A solve records but `/plan` doesn't tick.** Confirm the stored key on
`/problems` is `lc:<slug>` and matches the `canonicalKey` in
`packages/plan-data/src/index.ts` for that problem. An `nc:` / `tuf:` key means
catalog resolution failed — re-run [step 3](#3-seed-the-leetcode-catalog).

**A `/plan` item stays unticked despite a recorded solve.** You may have an
explicit `plan_checks` row with `done = false` overriding the derivation — click
it manually, or delete that one row.

**Nothing detected on takeuforward.** The TUF/TUF+ selectors were written from
research rather than against the live DOM; treat them as the first suspect.

---

## Appendix — every script, verified against `package.json`

Root passthroughs (`/Users/rishit/Coding/dsa-merged/package.json`) and their
`apps/web` targets (`/Users/rishit/Coding/dsa-merged/apps/web/package.json`):

| Root command | Runs |
| --- | --- |
| `pnpm dev` | `pnpm --filter web dev` → `next dev` |
| `pnpm dev:ext` | `pnpm --filter extension dev` → `wxt` |
| `pnpm build` | `pnpm -r build` (all workspaces) |
| `pnpm db:generate` | `drizzle-kit generate` — authoring only, after editing `src/db/schema.ts` |
| `pnpm db:migrate` | `drizzle-kit migrate` |
| `pnpm db:seed` | `tsx scripts/seed-catalog.ts` |
| `pnpm plan:keys` | `tsx scripts/resolve-plan-keys.ts` — already run; codegen, no DB |
| `pnpm plan:migrate` | `tsx scripts/migrate-neon-plan.ts` — dry run by default |

`apps/web` also has `build` (`next build`) and `start` (`next start`);
`apps/extension` has `dev` (`wxt`), `build` (`wxt build`), `zip` (`wxt zip`) and
a `postinstall` of `wxt prepare`. There is **no `test`, `lint`, or `typecheck`
script anywhere in this repo** — typecheck by invoking the workspace `tsc`
directly as shown above.

Flags are passed through pnpm with `--`, e.g.
`pnpm plan:migrate -- --from-file ~/legacy-state.json`.
