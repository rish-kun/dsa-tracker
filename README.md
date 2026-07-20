# DSA Tracker

Tracks the number of **unique** DSA questions you've solved across
[LeetCode](https://leetcode.com), [NeetCode](https://neetcode.io), and
[Striver's A2Z sheet / TUF+](https://takeuforward.org) — deduped by LeetCode
problem. Solving the same question on two sites counts once. Opening a question
you've already solved shows an in-page banner.

- `apps/extension` — WXT (Manifest V3) browser extension for Chrome / Helium
- `apps/web` — Next.js web app: dashboard + API, deployed on Vercel
- `packages/shared` — TypeScript types shared by both

**How counting works:** every problem gets a canonical key — `lc:<slug>` when it
maps to a LeetCode problem (NeetCode slugs are identical to LeetCode's; Striver
rows link to LeetCode), or `tuf:<slug>`/`gfg:<slug>` for the minority of A2Z
problems with no LeetCode equivalent. The main counter is unique `lc:` keys;
non-LC problems get their own smaller counter. On leetcode.com an **Accepted
submission is auto-detected**; on neetcode.io and takeuforward.org the extension
shows a **"Mark as completed?"** prompt.

## Setup

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Dashboard → **Connect** → copy the **Transaction pooler** URI
   (`...pooler.supabase.com:6543/postgres`).
3. `cp apps/web/.env.example apps/web/.env` and paste it as
   `DSA_TRACKER_DATABASE_URL` (URL-encode special characters in the password).
   The project-specific name is deliberate: a generic `DATABASE_URL` exported
   in your shell profile would silently win over `.env` otherwise.

```sh
pnpm install
pnpm db:migrate   # creates the tables
pnpm db:seed      # imports the full LeetCode problem catalog (~3,700 problems)
```

### 2. Web app

```sh
pnpm dev          # http://localhost:3000
```

Deploy: import the repo in [Vercel](https://vercel.com), set the root directory
to `apps/web`, add the `DSA_TRACKER_DATABASE_URL` env var. Re-run the catalog import against
production any time with `POST https://<your-app>.vercel.app/api/catalog/refresh`.

### 3. Extension (Chrome / Helium)

```sh
cd apps/extension
pnpm build        # outputs .output/chrome-mv3/
```

1. Open `chrome://extensions` (same in Helium) → enable **Developer mode** →
   **Load unpacked** → select `apps/extension/.output/chrome-mv3/`.
2. Click the extension icon → set the **API base URL** (default
   `http://localhost:3000`; set your Vercel URL once deployed).
3. Click **Sync from LeetCode** with a logged-in leetcode.com tab open to import
   your existing solve history.

During development, `pnpm dev:ext` runs WXT dev mode with hot reload.

## API

| Route | Purpose |
|---|---|
| `GET /api/solved` | Full solved list + canonical keys + totals |
| `POST /api/solve` | Record a solve (no-op if already solved; always logs an event) |
| `POST /api/backfill` | Bulk-import LeetCode slugs from history sync |
| `GET /api/stats` | Totals, difficulty/source breakdown, solves over time |
| `GET /api/resolve?slug=&title=` | Map a slug or title to a catalog problem |
| `POST /api/catalog/refresh` | Re-fetch the LeetCode catalog |

No auth — the API is open by design for a single-user personal deployment.
Don't put anything sensitive in it.

## Future ideas (not built yet)

Streaks, topic-coverage breakdown, solve frequency, per-sheet progress bars
(NeetCode 150/250 %, A2Z %), GFG solve detection.
