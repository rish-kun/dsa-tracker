# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal single-user DSA tracker: a WXT (Manifest V3) browser extension detects
problems being solved on leetcode.com / neetcode.io / takeuforward.org and
records them through a Next.js API backed by Supabase Postgres. Everything
dedupes on a **canonical key**: `lc:<leetcode-titleSlug>` for LeetCode-mappable
problems (the main "unique solved" counter), `tuf:<slug>`/`gfg:<slug>` for
problems with no LeetCode equivalent (separate counter). No auth anywhere by
design.

## Commands

```sh
pnpm install               # workspace install (pnpm only — never npm/yarn)
pnpm dev                   # Next.js web app + API on http://localhost:3000
pnpm dev:ext               # WXT dev mode (launches browser with extension)
pnpm build                 # build all workspaces
pnpm db:generate           # drizzle-kit: generate migration from schema changes
pnpm db:migrate            # apply migrations
pnpm db:seed               # import LeetCode catalog (~4k rows) into `problems`

# typecheck (no test suite exists)
cd apps/web && npx tsc --noEmit
cd apps/extension && pnpm wxt prepare && npx tsc --noEmit

# extension production build (then load .output/chrome-mv3/ unpacked)
cd apps/extension && pnpm build
```

`apps/web/.env` needs `DSA_TRACKER_DATABASE_URL` (Supabase Postgres URI).
**The project-specific name is load-bearing**: the user's shell profile exports
a generic `DATABASE_URL` pointing at an unrelated Neon database, and both
dotenv and Next.js let pre-existing env vars win over `.env`. Never read bare
`DATABASE_URL` first, and never assume a DB operation hit the right database —
`src/db/index.ts` checks `DSA_TRACKER_DATABASE_URL` before falling back.

## Architecture

Three workspaces: `apps/web` (Next.js 15 App Router: dashboard pages + all API
routes + Drizzle schema), `apps/extension` (WXT + React), `packages/shared`
(pure TS types exported as raw source, transpiled by each consumer — it is the
API contract *and* the extension's internal message protocol; change shapes
here first).

Data flow (extension side): content script detects the current problem →
`chrome.runtime.sendMessage` → **service worker** → Next.js API → Postgres.
This indirection is an MV3 constraint, not a style choice: content scripts are
CORS-bound to the host page's origin, only the service worker (via
`host_permissions`) may call the API. The service worker
(`entrypoints/background.ts`) also owns a `chrome.storage.local` cache of the
solved-key set (so banners render without network) and an offline write queue
flushed on the next successful sync.

Per-site detection (`apps/extension/entrypoints/*.content/`):
- **leetcode**: slug from URL; auto-detect Accepted via a MAIN-world
  interceptor (`leetcode-interceptor.ts`, injected at `document_start`,
  web-accessible resource) that wraps `fetch`/XHR and watches
  `/submissions/detail/<id>/check/` + GraphQL `submissionDetails`; relays via
  `window.postMessage` because MAIN-world code has no `chrome.runtime`.
- **neetcode**: URL slug **is** the LeetCode titleSlug (verified 1:1 parity) —
  no mapping table. Manual "mark as completed" only.
- **takeuforward**: three-step resolution — embedded `leetcode.com/problems/`
  anchor → title match via `/api/resolve` → fall back to a `tuf:` key. Banner
  only activates on problem-looking pages (see `isProblemPage()`).

All three sites are SPAs: route changes come from
`webNavigation.onHistoryStateUpdated` in the service worker (→ `ROUTE_CHANGED`
message), not page loads.

DB tables (`apps/web/src/db/schema.ts`): `problems` (LeetCode catalog, seeded
from leetcode.com/api/problems/all/), `solved_problems` (one row per unique
key — this table IS the counter), `solve_events` (append-only audit log; a
repeat solve writes an event but not a solved_problems row). `POST /api/solve`
returns `isNew: false` + the existing entry for repeats — that's the dedup
signal the banner relies on.

The LeetCode history backfill runs `chrome.scripting.executeScript` inside a
leetcode.com tab (first-party session cookies apply there) paginating GraphQL
`problemsetQuestionList` with `filters:{status:"AC"}`, then posts slugs to
`/api/backfill`.

## Gotchas

- `apps/extension/tsconfig.json` adds `jsx: react-jsx` on top of the generated
  `.wxt/tsconfig.json`; run `pnpm wxt prepare` before `tsc` on a fresh clone.
- Web pages that touch the DB must stay `force-dynamic` and tolerate an
  empty/unreachable DB (build runs without one).
- The in-page banner renders in a shadow root: px units only (`rem` resolves
  against the host page), and styles live inside the component.
- Selectors/heuristics for takeuforward (especially TUF+ premium pages) were
  written from research, not against the live DOM — treat them as the first
  suspect if detection misbehaves there.
