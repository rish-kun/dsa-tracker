# Migrating the old prep-tracker into `/plan`

> **NOTHING HAS BEEN APPLIED TO ANY DATABASE YET.**
> The script and this document are all that exist. No connection has been opened
> to the legacy Neon database or to Supabase. Every step below is one *you* run,
> and the only step that writes anything is the very last one.

Moves the old `dsa-track` app's single `tracker_state` jsonb blob (Neon Postgres)
into this app's `plan_checks` / `plan_days` / `plan_counters` tables.

- Script: `apps/web/scripts/migrate-neon-plan.ts`
- Command: `pnpm plan:migrate` (root passthrough) or `pnpm --filter web plan:migrate`
- **Dry run is the default.** Writes require an explicit `--commit`.
- Every write is an upsert, so re-running is safe and idempotent.

---

## 0. Prerequisites

### The target tables must exist

The migration writes to `plan_checks` / `plan_days` / `plan_counters`, created by
`apps/web/drizzle/0001_easy_toxin.sql`. If you have not applied that migration to
the Supabase database yet, do it **before** `--commit`:

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm db:migrate
```

### The legacy Neon driver

`@neondatabase/serverless@^1.1.0` was added to `apps/web` **devDependencies**. No
installer was run deliberately, but `pnpm run` auto-reconciled the workspace on
the first `pnpm plan:migrate` invocation, so it is most likely already present —
`pnpm-lock.yaml` and `node_modules` picked it up along with several other entries
that were already stale. Confirm, and install if not:

```sh
cd /Users/rishit/Coding/dsa-merged
ls apps/web/node_modules/@neondatabase/serverless || pnpm install
```

You can skip this entirely if you use `--from-file` (step 2): the driver is
imported lazily and an offline run never loads it.

---

## 1. Get the legacy Neon connection string

The old app read a bare `DATABASE_URL`. **This script will not.** Per the repo's
`CLAUDE.md`, your shell profile exports a generic `DATABASE_URL` that points at an
unrelated Neon database and would silently win. The migration reads
`NEON_LEGACY_DATABASE_URL` and *only* that name; if it is unset the script fails
with an explanation instead of guessing.

### Option A — pull it from the old Vercel project

```sh
cd /tmp
mkdir -p dsa-track-env && cd dsa-track-env
vercel link            # select the OLD project: dsa-track
vercel env pull .env.legacy
grep '^DATABASE_URL=' .env.legacy
```

### Option B — copy it from the Neon console

1. Open <https://console.neon.tech> and select the old `dsa-track` project.
2. **Dashboard → Connection Details**.
3. Role `neondb_owner`, database `neondb`, **Pooled connection** is fine.
4. Copy the `postgresql://...` URI (click *Show password* first).

### Put it in the environment under the right name

Append to `apps/web/.env` (the value is the URI only — no `DATABASE_URL=` prefix
inside the value):

```sh
NEON_LEGACY_DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require"
```

Sanity check that it is not accidentally the same database as the target:

```sh
cd /Users/rishit/Coding/dsa-merged/apps/web
grep -E '^(NEON_LEGACY_DATABASE_URL|DSA_TRACKER_DATABASE_URL)=' .env | sed 's/:[^:@]*@/:****@/'
```

They must be different hosts. The script aborts if the two values are identical.

---

## 2. (Recommended) Export the blob and validate offline

The safest path: pull the jsonb out once by hand, then run the entire rewrite
against a local file with **zero database access**.

### Export with `psql`

```sh
psql "$NEON_LEGACY_DATABASE_URL" -At \
  -c "SELECT state FROM tracker_state WHERE id = 'singleton'" \
  > ~/legacy-state.json
```

### Or export from the Neon SQL Editor

Run this in the console's SQL Editor, then copy the single result cell into
`~/legacy-state.json`:

```sql
SELECT state FROM tracker_state WHERE id = 'singleton';
```

Either way, verify it looks right before continuing:

```sh
head -c 300 ~/legacy-state.json; echo
python3 -m json.tool ~/legacy-state.json > /dev/null && echo "valid JSON"
```

The file may be the bare `TrackerState` object, a `{"state": {...}}` wrapper, or a
one-row array like `[{"state": {...}}]` — the script unwraps all three.

### Run the offline dry run

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm plan:migrate -- --from-file ~/legacy-state.json
```

Add `--show-mapping` to print every old-id → new-id pair:

```sh
pnpm plan:migrate -- --from-file ~/legacy-state.json --show-mapping
```

This touches no database at all — not the legacy one, not Supabase. It does not
even need `NEON_LEGACY_DATABASE_URL` or `DSA_TRACKER_DATABASE_URL` to be set.

> Use an **absolute** path for `--from-file`. `pnpm --filter web` runs the script
> with `apps/web` as the working directory, so a relative path resolves against
> `apps/web/`, not the directory you typed the command in.

---

## 3. Dry run against the live legacy database

Equivalent to step 2, but reads the blob directly (still **read-only**, still no
writes anywhere):

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm plan:migrate
```

---

## 4. Reading the report

### What the rewrite is doing

Old check IDs were **array-positional**; the new ones are stable slugs built by
`checkId` in `packages/plan-data`. Because `packages/plan-data` ports the old
arrays unchanged, the old indices still resolve:

| old id       | new id                                                |
| ------------ | ----------------------------------------------------- |
| `d{i}_t{j}`  | `checkId.task(DAYS[i].date, j)`                       |
| `d{i}_{j}`   | `checkId.task(DAYS[i].date, j)` — **same target**     |
| `d{i}_p{k}`  | `checkId.problem(DAYS[i].date, DAYS[i].problems[k])`  |
| `p{i}`       | `checkId.phase(PHASES[i])`                            |
| `r{i}`       | `checkId.resume(RESUME_ITEMS[i])`                     |

### `UNMAPPED` — this is the pass/fail signal

**A PASS is zero unmapped keys.** The section reads:

```
── UNMAPPED (pass/fail signal — must be 0) ─────────────────────────────
none — every source key resolved to a stable id.
```

and the run ends with:

```
RESULT: PASS — 0 unmapped keys. Re-run with --commit to apply.
Nothing was written. This was a dry run.
```

with exit code `0`.

Anything listed under UNMAPPED is a key the rewrite could **not** place — silent
data loss if ignored. It means one of two things:

- **out-of-range index** (`day index 26 out of range (DAYS.length=26)`) — the
  arrays in `packages/plan-data` have drifted from the ones the old app indexed
  against. Reconcile `packages/plan-data/src/index.ts` against
  `_source-dsa-track/lib/data.ts` before migrating.
- **unrecognised key shape** — a key the old UI never produced (hand-edited blob,
  or a scheme that predates both).

A dry run with unmapped keys prints `RESULT: FAIL` and exits `1`, and `--commit`
refuses to write at all.

### `COLLISIONS` — the bug being fixed

The old app wrote day tasks under **two** schemes that rendered the *same*
checkbox: `d{i}_t{j}` (`components/schedule.tsx`) and `d{i}_{j}`
(`components/today-hero.tsx`), read back with `a || b`. They can hold
contradictory values. Both fold onto one new id, resolved with **OR — `true`
wins**, matching what the old UI actually displayed. Every disagreement is listed:

```
  disagreeing pairs — eyeball these:
    task:2026-07-07:0
        d0_0=false  vs  d0_t0=true   ->  done=true
```

Read that list. It is the only place the migration makes a judgement call.

### Everything else

- **`rewritten (unique ids)` will be lower than `source check keys`** whenever
  collisions occurred. That is expected — two old keys, one new row.
- **`plan_checks` rows include `done=false` entries.** That is intentional: these
  are **explicit overrides**, and every old key was a deliberate manual click. An
  unticked LeetCode problem with no row still auto-ticks from `solved_problems`.
- **`plan_days`** is the union of the `logs`, `floors` and `trips` key sets —
  one row per date, carrying whatever each source had. Non-`YYYY-MM-DD` keys are
  dropped and reported under `INVALID DATE KEYS` (and also fail the run).
- **`plan_counters`** carries the counters across as-is. `dsa` will be **non-zero
  even on a barely-used blob** — the old `DEFAULT_STATE` seeded `dsa: 83`. That is
  correct, not a bug.

---

## 5. Apply it

Only after a dry run that says `RESULT: PASS`:

```sh
cd /Users/rishit/Coding/dsa-merged

# from the exported file (recommended — you already validated this exact blob)
pnpm plan:migrate -- --from-file ~/legacy-state.json --commit

# or straight from the legacy database
pnpm plan:migrate -- --commit
```

Expected tail:

```
plan_checks   : upserted N row(s)
plan_days     : upserted N row(s)
plan_counters : upserted 1 row ('singleton')
Done. Re-running is safe — every statement is an upsert.
```

Writes go to `DSA_TRACKER_DATABASE_URL` via the app's own client (`@/db`) — the
same connection `/plan` uses.

Then open <http://localhost:3000/plan> (`pnpm dev`) and spot-check a few of the
disagreeing collisions from the report.

---

## Flags

| flag                 | effect                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| *(none)*             | dry run against `NEON_LEGACY_DATABASE_URL`; reads only                 |
| `--from-file <path>` | read the blob from JSON; **no database access whatsoever**             |
| `--commit`           | apply the writes (refuses if anything is unmapped)                     |
| `--allow-unmapped`   | permit `--commit` despite unmapped keys — **accepts the data loss**    |
| `--show-mapping`     | print the full old-id → new-id mapping                                 |
| `-h`, `--help`       | usage                                                                  |

Exit codes: `0` = PASS, `1` = unmapped/invalid keys present, or a failure.

---

## If something goes wrong

- **`NEON_LEGACY_DATABASE_URL is not set`** — by design; the script never falls
  back to `DATABASE_URL`. See step 1, or use `--from-file`.
- **`Cannot load @neondatabase/serverless`** — run `pnpm install` (step 0), or use
  `--from-file`.
- **`tracker_state has no row with id = 'singleton'`** — you are connected to the
  wrong Neon database, or the old app never persisted. Check with
  `psql "$NEON_LEGACY_DATABASE_URL" -c "\dt"`.
- **`relation "plan_checks" does not exist`** — run `pnpm db:migrate` first.
- **Committed the wrong thing** — the migration is a pure upsert and never
  deletes. Fix the source blob and re-run `--commit`; the affected rows are
  overwritten. Rows written by a previous run that the new run no longer produces
  are *not* removed, so delete those by hand if that ever matters.
