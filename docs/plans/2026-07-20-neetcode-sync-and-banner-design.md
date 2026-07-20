# NeetCode sync and banner repair

## Problem

NeetCode sync reports no completed problems even when the account has progress,
and the tracking banner does not appear when a user opens a problem from a
practice page.

The sync collector calls NeetCode's authenticated `getCompletedProblems`
callable. The response contains full LeetCode problem URLs grouped by pattern,
while the collector currently accepts only bare problem IDs. It therefore
discards every completed problem even though the request succeeds.

The banner content script matches only `/problems/*`. NeetCode is an SPA, so a
user who starts on `/practice/*` and opens a problem stays in the same document.
Chrome does not inject a newly matching content script after a history-state
route change, leaving the background route notification with no receiver.

## Design

The NeetCode collector will run in a NeetCode tab, use the Firebase session in
IndexedDB, and call the same `getCompletedProblems` endpoint as the signed-in
site. It will normalize each supported value before import: a LeetCode problem
URL becomes its pathname slug, while an already-bare slug remains unchanged.
Unrelated URLs and malformed values are rejected. The normalized IDs are
deduplicated and sent through the existing `/api/import` route. The server
remains responsible for canonical mapping and persistence.

`completed-problem-list` remains a fallback for anonymous/local progress, using
the same normalizer so both legacy bare IDs and current URL values work.

The NeetCode content script will match every `neetcode.io` page. Its existing
`currentSlug()` route guard will remove or avoid the banner on non-problem
pages. Because the script is present on the initial practice page, existing
`webNavigation.onHistoryStateUpdated` notifications can trigger a check after
SPA navigation to a problem.

The collector will distinguish missing authentication, failed progress
requests, malformed local data, and a valid account with no completed IDs.

## Verification

- Exercise normalization against LeetCode URLs, trailing slashes, bare slugs,
  duplicates, unrelated URLs, malformed values, and grouped API responses.
- Run the extension TypeScript check.
- Build the production extension and verify the manifest registers the
  NeetCode content script for all NeetCode pages.
- Confirm a live signed-in sync in Helium imports the API's completed URLs.

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
