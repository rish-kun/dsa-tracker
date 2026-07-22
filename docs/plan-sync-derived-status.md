# Sync /plan status with the tracker (auto-derive ring + daily floor)

## Context

The point of merging the planner and the extension tracker was to stop manually updating the plan. Investigation (read-only DB queries against Supabase) shows the **per-problem auto-tick data pipeline works**: all 3 migrations are applied and recent extension solves exactly match their plan `canonicalKey` values. The remaining auto-tick bug is client freshness: an already-open `/plan` page does not rerun its server reads after an external extension write, so the tick appears only after reload. (Side note: the docs' "migration 0001 unapplied" warnings were stale — all 3 migrations were applied Jul 19–22.)

What is still manual, and confirmed by the user as the remaining desync:

1. **The "DSA solved" stat ring** reads `plan_counters.dsa` — a hand-entered `147` (single history entry `[147]`), not derived from real solves. User chose **hybrid**: auto-derive the base from live solves since plan start (Jul 7), keep manual `+N` for untracked extras.
2. **The daily DSA floor (4/day)** is a manual toggle; solving 4+ problems on tracked sites doesn't claim it.
3. Sync stays **one-way** (tracker → plan). Manual plan ticks never write `solved_problems`.
4. An already-open plan must refresh derived tracker state when its tab regains focus; no polling is required.

Key data facts that shape the design:

- The entire 163-row history was bulk-loaded on Jul 20 (`first_solved_at` is import time), so `solved_problems.first_solved_at >= '2026-07-07'` matches everything and is useless for "solves since plan start".
- `solve_events.detected` cleanly separates genuine solves from bulk: live detections are `'auto'`/`'manual'`; the LC backfill AND the NeetCode import both write `'backfill'`. **Derived metrics must count `solve_events` where `detected <> 'backfill'`**, and count `distinct canonical_key` (repeat solves append events).
- **Timezone bug**: `localDateKey()` (packages/plan-data) uses the runtime's local zone. Vercel region is `hnd1` (JST, UTC+9); the user is IST (UTC+5:30). From 20:30 IST onward the deployed server thinks it's tomorrow — wrong `todayKey`, wrong floor bucketing, wrong streak. Must pin to `Asia/Kolkata`.
- A stale manual-false override exists (`prob:2026-07-22:lc:maximum-score-from-removing-substrings`, done=false). Under the `manual ?? auto` rule it permanently blocks the auto-tick even after the user actually solves the problem — a footgun to defuse at solve-record time.

## Changes

### 1. Pin plan dates to IST — `packages/plan-data/src/index.ts`

- Add `export const PLAN_TZ = 'Asia/Kolkata'`.
- Reimplement `localDateKey(d = new Date())` to format in `PLAN_TZ` via `Intl.DateTimeFormat('en-CA', { timeZone: PLAN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })` (en-CA yields `YYYY-MM-DD`). Same output on the user's IST machine; fixes the JST drift on Vercel for `todayKey`, streak, and `addDsa`'s floor claim. Keep the doc comment's warning about `toISOString()`.
- plan-data is web-only (extension untouched), no build step — edit in place.

### 2. New derived-stats read — `apps/web/src/lib/plan-state.ts`

Add a read (never-throws contract, same as the others):

```ts
export type LiveSolveStats = { liveSolvedTotal: number; solvedPerDay: Record<string, number> };
export async function getLiveSolveStats(): Promise<LiveSolveStats>
```

One SQL statement (single round trip on the max:1 client), two scalar subqueries, mirroring the `getPlanState` pattern:

- `liveSolvedTotal`: `count(distinct canonical_key)` from `solve_events` where `detected <> 'backfill'` and `created_at at time zone 'Asia/Kolkata' >= '<DAYS[0].date>'` (plan start comes from `DAYS[0].date`, not a new hardcode).
- `solvedPerDay`: `json_object_agg(day, n)` over `to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, `count(distinct canonical_key)`, same `detected` filter (no start-date filter — the schedule shows past days too).

On error: log + return `{ liveSolvedTotal: 0, solvedPerDay: {} }`.

### 3. Derive on the page — `apps/web/app/plan/page.tsx`

- Fetch `getLiveSolveStats()` **sequentially** after the existing reads (never `Promise.all` — max:1 client).
- Extend `PlanViewState` (`src/components/plan/types.ts`) with `liveSolvedTotal: number` and `solvedPerDay: Record<string, number>`.

### 4. Hybrid ring — `stat-rings.tsx` + `plan-client.tsx`

- Ring numerator becomes `liveSolvedTotal + counters.dsa` (derived base + manual adjustment). Manual `+N`/undo buttons and their optimistic reducer cases stay exactly as they are — they now mean "solves done off-tracker".
- Keep `DSA_TARGET = 150`; fraction already clamps at 1 so overflow is safe.
- Keep the existing total-only ring presentation; do not add an auto/manual split sublabel.
- **No data migration**: the seeded 147 stays. The user can calibrate in the UI — one "undo" pops the entire `[147]` history entry to 0, then `+N` sets the true off-tracker base. Mention this in the handoff notes.

### 5. Auto-claim the daily DSA floor — `page.tsx` + `today-hero.tsx` + `schedule.tsx`

- Effective floor for a date: `manualDay.floorDsa || (solvedPerDay[date] ?? 0) >= 4`. **`||`, not `??`, deliberately** — `plan_days.floor_dsa` is `boolean NOT NULL default false`, so "explicitly false" and "never set" are indistinguishable; treating the derived true as un-overridable avoids a nullable-column migration, and un-claiming a floor on a day you demonstrably solved 4+ problems has no use case. (This is the opposite precedence from `plan_checks` — do NOT touch `resolveChecks`, which must stay `??`.)
- Compute where the day state is consumed: derive in `page.tsx` when building `PlanViewState.days` (patch each day's `floorDsa` before handing to the client, keeping a `floorDsaAuto` set/map alongside so the UI can badge it "auto" like `autoSolved` does for checks), or compute in the two components from `solvedPerDay` — prefer the page-side derivation to keep components dumb, matching the existing `checks`/`manual`/`autoSolved` pattern.
- The optimistic `floor` toggle path stays; toggling off an auto-claimed floor simply won't stick visually (render recomputes with `||`) — acceptable and consistent with the semantics above. TodayHero can show `n/4` progress from `solvedPerDay[todayKey]`.
- The streak (`getPlanStreak`) still reads `plan_days` rows only. To keep the streak honest with derived floors, apply the same `||` inside `getPlanStreak`: reuse the per-day counts (pass them in or query within) so a day with 4+ live solves counts toward `floorDsa` there too. Keep it one extra scalar subquery/parameter, not a second round trip.

### 6. Defuse stale manual-false overrides — `apps/web/src/lib/queries.ts` (`recordSolve`)

When a **live** solve is recorded (the `/api/solve` path; not backfill/import), after the event insert: delete `plan_checks` rows where `done = false` and `check_id LIKE 'prob:%:' || <canonicalKey>` (this is the second legal prefix-pattern use of a raw `prob:` string — add it to the comment in CLAUDE.md if touched). Semantics: a manual untick survives until you actually solve the problem again, then the fresh solve wins. Runs for both new and repeat solves. `reconcileNeetcodeAlias` merges `nc:` → `lc:` before this point, so the final canonical key is the one to match.

### 7. Refresh derived state on tab focus — `plan-client.tsx`

- Listen for `window.focus` and `document.visibilitychange`; when the plan is visible, call `router.refresh()` so the existing server component reads pick up extension writes.
- Coalesce the focus/visibility pair into one refresh. Do not poll and do not add a client-side Supabase subscription or API route.

## Files touched

- `packages/plan-data/src/index.ts` — `PLAN_TZ`, IST-pinned `localDateKey`
- `apps/web/src/lib/plan-state.ts` — `getLiveSolveStats`, streak floor derivation
- `apps/web/app/plan/page.tsx` — fetch stats, derive floors, extend view state
- `apps/web/src/components/plan/types.ts` — `PlanViewState` fields
- `apps/web/src/components/plan/plan-client.tsx` — hybrid ring numerator and focus refresh
- `apps/web/src/components/plan/today-hero.tsx`, `schedule.tsx` — floor badge/auto display, `n/4` progress
- `apps/web/src/lib/queries.ts` — stale-false cleanup in `recordSolve`
- (docs) `CLAUDE.md` — drop the stale "0001 unapplied" warning; note the new derived metrics + `detected <> 'backfill'` rule

No new API routes (stays at 7), no schema migration, extension untouched.

## Verification

1. Typecheck: `cd apps/web && ./node_modules/.bin/tsc --noEmit` (workspace-local binary, never bare `npx tsc`).
2. Scratchpad SQL sanity (read-only, pattern already in `/private/tmp/.../scratchpad/*.mjs`): run the new stats query raw against Supabase; expected today: `liveSolvedTotal` ≈ 10 (6 lc + 1 nc-manual + 3 tuf distinct keys), `solvedPerDay['2026-07-21'] = 4`.
3. `pnpm dev`, open `http://localhost:3000/plan`:
   - Ring shows the total `liveSolvedTotal + 147` without a split sublabel.
   - Jul 21 in the schedule shows the DSA floor claimed (4 distinct live solves that day) with an auto badge; a manual toggle on another day still works.
   - `+N` / undo on the counter still adjusts the manual part only.
   - Leave `/plan` open, record a solve through the extension, switch away and back; the matching problem ticks without a manual reload.
4. Stale-override test: `POST http://localhost:3000/api/solve` with `{"key":"lc:maximum-score-from-removing-substrings", ...}` (matching the extension's payload shape) → the `done=false` row for `prob:2026-07-22:lc:maximum-score-from-removing-substrings` is deleted and the problem ticks on reload.
5. TZ check: temporarily run with `TZ=Asia/Tokyo pnpm dev` after 20:30 IST-equivalent — `todayKey` must still be the IST date.

## Handoff notes for the user

- The ring will initially read `147 + ~10`. To recalibrate: hit undo once (pops the whole 147), then `+N` your true count of problems solved outside the tracked sites.
- Striver/TUF-only entries (5 keyless problems) remain hand-tick by design; TUF solves that resolve to a LeetCode problem already auto-tick.
