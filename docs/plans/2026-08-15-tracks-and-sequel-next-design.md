# Tracks + sequel "Next up" — design

**Date:** 2026-08-15 · **Status:** implemented; migration `0007` applied 2026-08-16

## What this adds

Two standalone features that share one delivery channel:

1. **Track** — a user-curated ordered list of LeetCode problems, managed on
   `/problems`. The panel's Continue link always targets the **first unsolved**
   item; when everything is solved the panel shows a completed state.
2. **Sequel series** — auto-detected multi-part problems (Next Greater Element
   I → II → III, Two Sum → Two Sum II, …). After solving one part, the banner
   suggests the next unsolved later part.

**Clash rule:** when both have a suggestion, the **track wins**; the sequel
suggestion only fires when the track has nothing to offer (no track, or track
complete). "Next" always means *next unsolved in order*.

## Why `nextUp` rides on `POST /api/solve`

A web page cannot communicate with this extension (no `externally_connectable`,
no web-accessible resources — by design), so the only extension↔server channel
is `/api/*`. Rather than widen that contract with a new route, the server
computes the suggestion during the solve and returns it as an **additive
optional `nextUp` field** on the existing `SolveResponse` (packages/shared).
The service worker already forwards the solve response verbatim to content
scripts, so the field reaches the banner with no background changes. There are
still exactly 7 API routes.

## Pieces

| Piece | Where |
| --- | --- |
| `NextUp` type, `SolveResponse.nextUp?` | `packages/shared/src/index.ts` |
| `user_tracks` table (one row per user, ordered jsonb `items`) | `apps/web/src/db/schema.ts`, migration `0007_user_tracks.sql` (+ journal + hand-extended `0007_snapshot.json`), RLS enabled |
| `getTrack` / `saveTrack` / `computeNextUp` | `apps/web/src/lib/tracks.ts` (reads never throw; `saveTrack` doesn't catch) |
| Bulk catalog resolution, slug-prefix scan | `findProblemsBySlugsOrTitles` / `findProblemsBySlugPrefix` in `apps/web/src/lib/queries.ts` |
| Solve response enrichment | `apps/web/app/api/solve/route.ts` |
| Track panel + editor UI | `TrackPanel` / `TrackEditor` components, `saveTrackAction` in `app/problems/actions.ts`, `.track-*` classes in `globals.css` `@layer components` |
| Banner "Next in track" / "Next part" link | `apps/extension/components/Banner.tsx` (`recorded.next`), `lib/site-adapter.ts` |

## Track model

- One row per user: `(user_id PK, name, items jsonb, updated_at)`. `items` is
  an ordered array of catalog snapshots `{slug, title, number, difficulty,
  paidOnly}` resolved **at save time** — rendering needs no catalog join.
- The editor accepts one problem per line: a leetcode.com URL, a titleSlug, or
  a display title (leading `123. ` numbering stripped). All lines resolve in a
  single catalog query; unknown lines are reported back and never saved.
  Duplicates collapse to first occurrence.
- Progress is always derived by intersecting item keys (`lc:<slug>`) with the
  user's `solved_problems` keys — the track stores no progress of its own, so
  extension solves, backfills, and manual marks all count.
- Going multi-track later means new tables, not new columns here.

## Sequel detection

Base slug = slug minus a trailing pure roman-numeral segment (`i`…`xx`), else
the slug itself. Candidates = catalog rows where `lc_slug = base` or
`lc_slug LIKE base || '-%'`, keeping only rows where the segment right after
the base is a pure roman numeral. This groups `two-sum` +
`two-sum-ii-input-array-is-sorted` (renamed titles keep the numeral mid-slug)
and excludes `-with-cooldown`-style cousins. Members order by `lc_number`;
≥2 required; suggestion = first **later, unsolved** part (never backward).
Non-LC keys (`nc:`/`tuf:`/`gfg:`) skip sequels entirely.

## Banner behavior

- `recorded` state gains `next?: NextUp`; rendered as a label + same-tab
  anchor ("moving on" intent) below the totals row. px units + copied
  `--pt-*` literals per the banner's two hard rules.
- The 5 s auto-dismiss is **skipped when a next link is present**; × / route
  change / auth change still remove the banner.
- `recordAuto` also shows the banner when `nextUp` exists even on a repeat
  (`isNew: false`) solve — re-practicing still deserves the pointer.
- Offline-queued solves discard the response, so they show the plain "Saved
  locally" card (the queue flush has no channel back to the page).

## Auth / RLS

`user_tracks` is user-owned: `user_id` PK, RLS enabled with no policies (same
posture as 0006). Writes go through `saveTrackAction` → `requireUser()`; the
solve-path read goes through `requireApiUser` as part of the existing route.
