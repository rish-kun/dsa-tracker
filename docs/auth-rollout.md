# Auth and ownership rollout

This release deliberately separates ownership preparation from primary-key
finalization. Do not apply `0005` before every legacy row has a Clerk owner.

## Prerequisites

1. Back up the production database and verify Drizzle's
   `drizzle.__drizzle_migrations` table.
2. Configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
   `CATALOG_REFRESH_SECRET`.
3. Create the legacy owner's Clerk account with the verified email
   `f20240606@pilani.bits-pilani.ac.in` and record its exact `user_...` ID.
4. Temporarily disable public sign-up in the Clerk Dashboard until migration
   `0005` is complete. This prevents a second user from colliding with the
   legacy global primary keys during the transition.

## Staged production sequence

From the repository root:

```sh
# Read-only report. If 0004 is absent, every existing user row is reported as
# unowned; no migration or data update is performed.
pnpm auth:backfill -- --user-id user_REPLACE_ME

# WRITES: applies migrations only through 0004 and transactionally assigns all
# null user_id values. It does not apply 0005 or 0006.
pnpm auth:backfill -- --user-id user_REPLACE_ME --commit
```

Deploy the user-aware application with:

```dotenv
LEGACY_OWNER_USER_ID=user_REPLACE_ME
ALLOW_UNAUTHENTICATED_API=true
```

Keep sign-up disabled during this short compatibility window. Re-run the
committed backfill immediately before finalization to catch any writes made by
the old deployment, then run:

```sh
pnpm auth:backfill -- --user-id user_REPLACE_ME --commit
pnpm db:migrate
```

The guarded migrator refuses to finalize while any ownership value is null.
It then applies `0005` (non-null ownership and composite primary keys) and
`0006` (RLS enabled with no Data API policies on user tables).

Connect the extension using an API key created on `/settings`, confirm reads
and a solve, and then set `ALLOW_UNAUTHENTICATED_API=false`. Remove
`LEGACY_OWNER_USER_ID` after the compatibility deployment is gone. Finally,
re-enable public Clerk sign-up.

## Verification

Verify each user table has no null owner and that the expected keys exist:

```sql
select 'solved_problems' as table_name, count(*) filter (where user_id is null) from solved_problems
union all select 'solve_events', count(*) filter (where user_id is null) from solve_events
union all select 'plan_checks', count(*) filter (where user_id is null) from plan_checks
union all select 'plan_days', count(*) filter (where user_id is null) from plan_days
union all select 'plan_counters', count(*) filter (where user_id is null) from plan_counters;
```

Use two Clerk users to record the same canonical key. Both rows must coexist,
and each dashboard, problems list, statistics response, and extension cache
must show only the current owner's data. An ordinary user must be redirected
from `/plan`; only the verified allowlisted email may read or mutate it.
