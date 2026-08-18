# Problem-wise active time design

## Goal

Keep the extension popup focused on three useful snapshots—total solved, solved today, and active time today—while attributing focused practice time to individual problems. When the active tab is a recognized problem, the popup also shows that problem's cumulative time in stopwatch notation. A new authenticated `/time` page makes the history searchable and comparable.

## Tracking model

- The existing site/day totals remain unchanged, including time spent on supported-site editorials and lists.
- Problem time is an additional measurement, recorded only while the current page resolves through the existing site adapter to a canonical problem key.
- Aggregate and problem increments share the same attention rule: visible tab, focused window, and interaction within 120 seconds. Opening the popup blurs the page, so the displayed stopwatch is intentionally paused and never invents elapsed time.
- Pending problem increments remain isolated by API-key profile, follow the existing at-least-once retry posture, split at the tracker timezone's midnight, and are merged before database upsert.

## Interfaces and persistence

- `StatsResponse` and the cached popup state carry a tracker-day-stamped `todaySolved` count.
- `ActiveProblemResult` carries an optional `problemTime` snapshot with canonical key, cumulative seconds, pending seconds, and sync state.
- Time segments may include canonical problem identity. The server continues updating `time_daily` for every valid segment and additionally updates a user-scoped, RLS-enabled problem-time table when identity is present.
- `getProblemTimeSummaries(userId)` returns canonical key, title, source, URL, today seconds, total seconds, and last-active timestamp for the authenticated web page.

## User interface

- Popup: replace the LeetCode/Other split with Total and Solved today; keep the existing Today time tile unchanged. The current-problem card shows cumulative time as `HH:MM:SS` above its completion action.
- Web: add Time to the primary navigation and an authenticated `/time` page. Its client table searches title/key, filters by source, sorts by problem/today/total/last-active, and paginates at 25 rows.
- Empty states explain that only focused time on recognized problem pages appears in the problem table. The existing dashboard aggregate-time panel remains the source for all supported-site time.

## Failure and verification

- Time remains decorative: unavailable reads return empty snapshots and writes surface failures so the extension retains its pending increments.
- Verify extension and web typechecks/builds, then manually cover all four sites, SPA navigation between problems, non-problem pages, focus/blur, idle timeout, midnight rollover, offline retry, profile switching, long titles, filtering/sorting/pagination, and popup display at 320 CSS pixels.
