# Active time tracking — design

**Date:** 2026-08-16 · **Status:** implemented; migration `0008` applied 2026-08-16

## What this adds

Time spent on the four practice sites, measured only while the tab is genuinely
active, aggregated per day and per site, and shown on the dashboard as a
"Time on task" panel.

## What "active" means

All three must hold, checked every 5 s in the content script:

| Signal | Covers |
| --- | --- |
| `document.visibilityState === 'visible'` | the foreground tab of its window |
| `document.hasFocus()` | that window is the focused one |
| last user interaction < 120 s ago | the user did not walk away |

This trio was chosen because it needs **no new manifest permission**.
`chrome.idle` would give the third signal more cheaply but costs the `idle`
permission, and the permission list is a user-visible install prompt. The
permission set is unchanged: `storage`, `alarms`, `webNavigation`, `scripting`,
`tabs`.

Two windows side by side cannot both be focused, and content scripts do not run
in sub-frames (`all_frames` is unset), so **no arrangement of tabs
double-counts** a second of wall clock.

## Why a separate content script

`entrypoints/activity.content.ts` is deliberately **not** a `SiteAdapter`. The
solve entrypoints are scoped to each site's `/problems/*` routes, but time spent
on an editorial, a course page, or a problem list is still practice time — so
this one matches the four hosts site-wide and shares nothing with the
detect → resolve → banner loop. It is the one entrypoint that is about the
*user*, not about a problem.

## Data flow

```
activity.content.ts          background.ts                 apps/web
  every 5s: accrue      →   K_TIME buckets, per profile  →  POST /api/time
  every 30s: report          flush at 60s pending             time_daily
                             or 5min since last success       (increments)
```

- The content script accumulates into a `Map<dateKey, seconds>` and **resolves
  the day key at accrual time**, so a session crossing midnight splits across
  both days instead of landing wholly on the day it happened to flush.
- It reports on a 30 s accrual and immediately on `visibilitychange`→hidden,
  `blur`, and `pagehide`, so backgrounding a tab does not sit on unreported
  time. A failed send puts the seconds **back** into the accumulator.
- The service worker owns the network, as it must: content scripts are
  CORS-bound to the host origin. Buckets live under their own storage key
  (`timeBucketsV1`), **not** on `ExtensionState`, so time tracking never drags
  the solve queue's `STORAGE_VERSION` migration path along with it.
- Buckets are keyed by **profile id**, so time accrued under one API key is
  never posted with another.

## Day keys

`trackerDateKey()` in `packages/shared` returns `YYYY-MM-DD` in `TRACKER_TZ`
(`Asia/Kolkata`), matching what `PLAN_TZ`/`localDateKey` do for `/plan`. It is
hardcoded rather than "the browser's local zone" so a day boundary means the
same thing in the extension, the API and the dashboard — including while
travelling. **Never `toISOString()`**: that is UTC and rolls the day at the
wrong local time.

`time_daily.date` is `text`, not `date` — the same convention as
`plan_days.date`, so no driver or pooler can reinterpret the value into a
neighbouring day.

## Increments, not totals

`POST /api/time` segments are **added** to whatever the server already holds for
that `(user, day, site)`:

```sql
on conflict (user_id, date, site)
do update set seconds = time_daily.seconds + excluded.seconds
```

This is what lets two devices on one account simply add up, and means the
extension never has to know the server's total. The posture is **at-least-once**
(the same as the solve queue): a batch is cleared only after a 2xx, so a lost
response over-counts by at most one flush interval, which is preferred to
losing real time.

`recordTime` **merges duplicate `(date, site)` pairs before inserting** — this
is not optional. Postgres rejects an `ON CONFLICT DO UPDATE` whose `VALUES`
list hits the same primary key twice ("cannot affect row a second time"), and a
batch can legitimately carry two segments for the same day and site.

On success the service worker **subtracts exactly the segments it sent** rather
than clearing the bucket map, so `ACTIVITY` messages that land mid-POST are not
swallowed.

## Bounds

A client is not trusted input. Both ends validate.

| Bound | Value | Why |
| --- | --- | --- |
| Segment seconds | > 0, ≤ 6 h | a stuck clock cannot inflate a day |
| Backdate | 14 days | older is a clock problem, not practice |
| Future | ≤ tomorrow | a client slightly ahead of `TRACKER_TZ` is normal |
| Segments/request | 200 | a malformed body cannot become an unbounded statement |
| Retained buckets | 14 days, 6 h each | an unauthenticated user cannot grow `chrome.storage` unboundedly |
| POST floor | 60 s between attempts | a failing backend is retried, not hammered |

The 6 h bucket cap applies to **un-flushed pending** seconds, not the day total,
so a genuine 10-hour day records fine as long as flushes succeed.

## Failure posture

Time tracking is decoration and must never cost a solve. Every layer swallows:
`handleActivity` and `flushTime` catch and warn without touching `authState`;
`getDailyTime`/`getDayTotal` never throw, so the dashboard renders empty rather
than 500ing against an unreachable or un-migrated DB. `recordTime` deliberately
*does* propagate, so a genuinely failed write surfaces as a 5xx and the
extension retains the batch and retries.

## Why `/api/time` is a route (and `nextUp` is not)

`/api/*` is the **extension's** contract. A route earns its place there only
when the extension is the thing that needs it. Time data can only be produced by
the extension — nothing else can see tab focus — so it gets a route, taking the
count from 7 to 8. `nextUp`, by contrast, is consumed by the extension but
computed during an existing call, so it rides on the `/api/solve` response
instead. First-party page mutations still use Server Actions.

## Pieces

| Piece | Where |
| --- | --- |
| `TRACKER_TZ`, `trackerDateKey`, `TimeSite`, `TIME_SITES`, `TimeSegment`, `TimeRequest`, `TimeResponse`, `DailyTime`, `ACTIVITY` message | `packages/shared/src/index.ts` |
| `time_daily` table, PK `(user_id, date, site)`, RLS on | `apps/web/src/db/schema.ts`, `drizzle/0008_time_daily.sql` (+ journal + hand-extended `0008_snapshot.json`) |
| `recordTime` / `getDailyTime` / `getDayTotal` / `formatDuration` | `apps/web/src/lib/time-tracking.ts` |
| `POST /api/time` | `apps/web/app/api/time/route.ts` |
| Activity meter | `apps/extension/entrypoints/activity.content.ts` |
| Bucket store + flush | `apps/extension/entrypoints/background.ts` (`K_TIME`, `withTimeStore`, `flushTime`, `handleActivity`) |
| "Time on task" panel + `.time-*` classes | `apps/web/src/components/TimeSpentPanel.tsx`, `app/globals.css`, wired in `app/page.tsx` |

## Showing it in the popup

The popup's third stat tile is today's total, fetched with `GET_TIME`.

Reading the local bucket store alone would be wrong twice over: it holds only
*un-flushed* seconds, so the figure would drop to zero the instant a flush
succeeded, and it cannot know about time recorded on another device. Asking the
API on every popup open would be a wasted round trip.

So the service worker caches `todaySeconds` from each flush response — the
existing `TimeResponse` already carries it, which is why no `GET /api/time`
route was needed — stamped with the day it describes. `GET_TIME` flushes
(best effort), then returns **cached server total + still-pending seconds for
today**. That sum is monotonic across a flush, and a stamp from an earlier day
is discarded rather than shown against today.

When no flush has ever succeeded for the current day the tile is labelled
`today · local`, because the figure is then this device's view only.
`formatDuration` lives in `packages/shared` so the tile and the dashboard panel
cannot drift into formatting the same number differently.

## Known gaps

- **No backfill.** Time before this shipped does not exist and cannot be
  reconstructed; the panel's window fills in from first use.
- **No per-site split in the popup.** `TimeResponse` carries only the day
  total; the dashboard panel is where the per-site breakdown lives.
