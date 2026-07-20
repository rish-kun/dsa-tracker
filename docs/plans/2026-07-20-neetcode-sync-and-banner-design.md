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
