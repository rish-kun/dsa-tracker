# NeetCode sync and banner repair

## Problem

NeetCode sync reports no completed problems even when the account has progress,
and the tracking banner does not appear when a user opens a problem from a
practice page.

The sync collector calls a private `getCompletedProblems` callable that the
current NeetCode frontend no longer uses. NeetCode stores progress in
`localStorage` under `completed-problem-list` as problem-ID arrays grouped by
list or course.

The banner content script matches only `/problems/*`. NeetCode is an SPA, so a
user who starts on `/practice/*` and opens a problem stays in the same document.
Chrome does not inject a newly matching content script after a history-state
route change, leaving the background route notification with no receiver.

## Design

The NeetCode collector will run in a NeetCode tab and read
`completed-problem-list` directly. It will validate that the value is a JSON
object, recursively collect valid problem IDs from every list/course array,
deduplicate them, and send the resulting IDs through the existing `/api/import`
route. The server remains responsible for mapping NeetCode IDs to canonical
LeetCode keys and for retaining unmapped NeetCode-only problems.

The NeetCode content script will match every `neetcode.io` page. Its existing
`currentSlug()` route guard will remove or avoid the banner on non-problem
pages. Because the script is present on the initial practice page, existing
`webNavigation.onHistoryStateUpdated` notifications can trigger a check after
SPA navigation to a problem.

The collector will distinguish missing progress, malformed stored data, and a
valid store with no completed IDs. It will not read Firebase IndexedDB state or
call the obsolete private endpoint.

## Verification

- Exercise the collector logic against grouped arrays, duplicate IDs, malformed
  JSON, empty data, and invalid values.
- Run the extension TypeScript check.
- Build the production extension and verify the manifest registers the
  NeetCode content script for all NeetCode pages.
- Confirm the built collector references `completed-problem-list` and no longer
  references `getCompletedProblems` or Firebase token storage.

## Review links

The solved-problems API will expose the earliest non-null solve-event URL as
`sourceUrl`. This reuses the existing audit data instead of duplicating URLs in
`solved_problems` or requiring a schema migration. NeetCode and LeetCode import
events will now persist stable problem URLs instead of null.

The dashboard will show an **Original** link when `sourceUrl` exists and a
separate **LeetCode** link whenever `lcSlug` exists. Both remain visible even
when they point to the same page, matching the requested distinction between
solve origin and canonical LeetCode review.

## Popup action for the active problem

The popup will request the active problem context from the service worker. The
service worker will ask the active tab's content script for a `SolveRequest`,
then check the canonical key against the local solved cache. Each site content
script will build this request with the same detection and canonicalization
logic used by its banner.

When a supported problem page is active, the popup will show its title and
either **Mark current problem complete** or an already-tracked state. Marking
uses the existing `MARK_SOLVED` path, including offline queuing and cache
updates. Non-problem and unsupported pages will omit the control.
