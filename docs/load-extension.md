# Loading the DSA Tracker extension

Chromium only — Chrome, Edge, Brave, Helium. **Firefox is not supported** (the
code uses `chrome.*` MV3 APIs and ships no gecko id).

Two ways in: **A. install the released build** (what you want if you just plan
to use the tracker) or **B. build from source** (contributors and
self-hosters).

---

## A. Install the released build

### 1. Create an account and mint a key

The extension will not sync without an API key — every backend call sends
`Authorization: Bearer <key>`.

1. Sign up at
   [dsa-tracker-final-web.vercel.app/sign-up](https://dsa-tracker-final-web.vercel.app/sign-up).
2. Go to
   [/settings](https://dsa-tracker-final-web.vercel.app/settings) → create an
   extension API key.
3. **Copy the key now.** The secret is shown exactly once; if you lose it,
   revoke it and create another.

### 2. Download and unzip

1. Open the
   [latest release](https://github.com/rish-kun/dsa-tracker-final/releases/latest).
2. Download `dsa-tracker-extension-<tag>-chrome.zip`.
3. Unzip it. **`manifest.json` sits at the ROOT of the unzipped folder** — the
   folder you select in the next step must be the one containing
   `manifest.json`, not its parent. Selecting the parent is the most common
   Load-unpacked failure.

### 3. Load it

1. Open a new tab and go to `chrome://extensions`.
2. Toggle **Developer mode** ON (top-right).
3. Click **Load unpacked** (top-left) and select the unzipped folder.
4. "DSA Tracker" appears in the list. Pin it: puzzle-piece icon in the toolbar
   → pin **DSA Tracker**.

### 4. Connect the key

1. Click the DSA Tracker toolbar icon to open the popup.
2. Paste your key into **Extension API key** and click **Connect**.
3. The warning banner disappears and the counters load (zeros at first). Hit
   **Refresh** in the header if they look stale.

To swap keys later, paste a new one and click **Replace**; **Disconnect key**
removes it entirely.

### 5. Import your existing history (one time)

Both sync buttons stay disabled until a key is connected.

1. Open [leetcode.com](https://leetcode.com) in a tab and make sure you're
   logged in.
2. Popup → **Sync from LeetCode**. Wait for "Imported X" — your unique count
   should now match your LeetCode profile.
3. If you use NeetCode, open [neetcode.io](https://neetcode.io), log in, then
   popup → **Sync from NeetCode**.

### 6. Daily use

- **LeetCode** — just solve. An Accepted submission is recorded automatically
  (toast bottom-right).
- **NeetCode / takeuforward / GeeksforGeeks** — open a problem → banner
  bottom-right. If you've solved it anywhere before it says *Already solved*;
  otherwise click **Mark as completed** when you finish.
- The popup also has **Mark current problem complete** for the page you're on,
  and shows your unique LeetCode count, non-LeetCode count and last 5 solves.
- Dashboard: **Open dashboard →** in the popup, or visit
  [the web app](https://dsa-tracker-final-web.vercel.app).

---

## B. Build from source

```sh
pnpm install                  # repo root; the extension's postinstall runs `wxt prepare`
cd apps/extension
pnpm build                    # outputs to apps/extension/.output/chrome-mv3/
```

Then `chrome://extensions` → **Developer mode** → **Load unpacked** → select
`apps/extension/.output/chrome-mv3` (the folder containing `manifest.json`).
Connect a key exactly as in step A.4.

For live-reload development, run `pnpm dev:ext` from the repo root — WXT
launches a dedicated browser profile with the extension pre-loaded and
hot-reloads on save.

`pnpm zip` (in `apps/extension`) produces
`.output/extension-<version>-chrome.zip`, the same artifact the release
workflow ships.

### Pointing it at your own backend

There is **no runtime setting for the backend URL** — it is hardcoded in two
places and you must edit both, then rebuild:

1. `DEFAULT_API_BASE` in `apps/extension/entrypoints/background.ts`
   (`normalizeBase()` in the same file ignores its argument by design).
2. The `https://dsa-tracker-final-web.vercel.app/*` entry in
   `host_permissions` in `apps/extension/wxt.config.ts` — without it the
   service worker's fetches are blocked.

Note that `/plan` on the web app is restricted to a single hardcoded account
(`PLAN_OWNER_EMAIL` in `apps/web/src/lib/auth.ts`); the dashboard, `/problems`
and `/settings` work for any signed-in user.

---

## Updating

**Released build** — download the new zip from the
[releases page](https://github.com/rish-kun/dsa-tracker-final/releases/latest),
unzip it over (or replace) the folder you loaded, then `chrome://extensions` →
click the ↻ **reload** icon on the DSA Tracker card. Your key survives the
reload.

**From source** — `cd apps/extension && pnpm build`, then ↻ on the card.

---

## Troubleshooting

- **"Add an extension API key to connect your tracker."** — no key is
  configured. Mint one at
  [/settings](https://dsa-tracker-final-web.vercel.app/settings), paste it into
  the popup, click **Connect**. In-page banners show a *Connect your tracker*
  state with an **Open connection settings** button that does the same thing
  (if the popup can't be opened programmatically it opens the Settings page
  instead).
- **"This extension key was rejected or revoked."** — the key no longer
  matches a live one on the server. Create a fresh key in Settings and use
  **Replace** in the popup.
- **Sync buttons greyed out** — they're disabled until the key is connected
  and verified. Fix the auth state above, then **Refresh**.
- **"Open leetcode.com and log in first"** during sync — the backfill runs
  inside a leetcode.com tab using your session; log in and retry.
- **"Open neetcode.io and log in first"** during sync — the import reads your
  NeetCode session from a neetcode.io tab; log in there and retry.
- **Nothing on a takeuforward page** — banners only activate on pages that look
  like problem pages (have a LeetCode link, a code editor, or a `/plus/`
  problem URL), not on articles.
- **Marks made while offline** — nothing is lost. The service worker queues
  writes locally and flushes them on the next successful sync; the popup shows
  the pending queue count. Writes the server actively rejected are listed
  separately (with the failing key and status) so they don't silently retry
  forever.
