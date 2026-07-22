# Loading the DSA Tracker extension (Chrome / Helium)

## 1. Build it

```sh
cd /Users/rishit/Coding/dsa-merged
pnpm install          # first time only
cd apps/extension
pnpm build            # outputs to .output/chrome-mv3/
```

## 2. Load it (identical in Chrome and Helium)

1. Open a new tab and go to `chrome://extensions`.
2. Toggle **Developer mode** ON (top-right corner).
3. Click **Load unpacked** (top-left).
4. Select the folder
   `/Users/rishit/Coding/dsa-merged/apps/extension/.output/chrome-mv3`
   (the folder that contains `manifest.json`, not its parent).
5. "DSA Tracker" appears in the list. Pin it: puzzle-piece icon in the toolbar →
   pin **DSA Tracker**.

## 3. Point it at your API

1. Click the DSA Tracker toolbar icon to open the popup.
2. In the **API base URL** field:
   - Local dev: `http://localhost:3000` (the default — the web app must be
     running: `pnpm dev` from the repo root).
   - Deployed: your Vercel URL, e.g. `https://dsa-tracker-xxxx.vercel.app`.
3. Click save / refresh in the popup — the counters should load (zeros at
   first).

## 4. Import your existing history (one time)

1. Open [leetcode.com](https://leetcode.com) in a tab and make sure you're
   logged in.
2. Open the popup → **Sync from LeetCode**.
3. Wait for "Imported X" — your unique count now matches your LeetCode
   profile's solved number.
4. If you use NeetCode, open [neetcode.io](https://neetcode.io), make sure
   you're logged in, then use **Sync from NeetCode** in the popup.

## 5. Daily use

- **LeetCode**: just solve. An Accepted submission is recorded automatically
  (toast bottom-right).
- **NeetCode / takeuforward**: open a problem → banner bottom-right. If you've
  solved it anywhere before it says *Already solved*; otherwise click **Mark as
  completed** when you finish.
- Dashboard: click **Open dashboard** in the popup, or visit your web app URL.

## Updating after code changes

```sh
cd apps/extension && pnpm build
```

then `chrome://extensions` → click the ↻ **reload** icon on the DSA Tracker
card. (For live-reload development use `pnpm dev:ext` from the repo root, which
launches a dedicated Chrome profile with the extension pre-loaded.)

## Troubleshooting

- **Banner never appears** — check the popup: is the API base URL right, and is
  the web app running/deployed? The popup shows an "API unreachable" warning if
  not. Marks made while offline are queued and flushed automatically.
- **"Open leetcode.com and log in first"** during sync — the backfill runs
  inside a leetcode.com tab using your session; log in and retry.
- **"Open neetcode.io and log in first"** during sync — the import reads your
  NeetCode session from a neetcode.io tab; log in there and retry.
- **Nothing on a takeuforward page** — banners only activate on pages that look
  like problem pages (have a LeetCode link, a code editor, or a `/plus/`
  problem URL), not on articles.
