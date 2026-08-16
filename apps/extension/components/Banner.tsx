import type { NextUp } from '@dsa-tracker/shared';
import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';

/** Discriminated union describing which banner card to render. */
export type BannerState =
  | { kind: 'already-solved'; title: string; source: string; date: string }
  | { kind: 'prompt'; title: string; busy?: boolean }
  | { kind: 'recorded'; isNew: boolean; total: number; label: string; next?: NextUp }
  | { kind: 'queued' }
  | { kind: 'rejected'; message: string }
  | { kind: 'needs-auth'; message: string };

export interface BannerView {
  state: BannerState;
  onMark?: () => void;
  onConnect?: () => void;
  onClose?: () => void;
}

export interface BannerHandle {
  update(view: BannerView): void;
  remove(): void;
}

const SOURCE_LABELS: Record<string, string> = {
  leetcode: 'LeetCode',
  neetcode: 'NeetCode',
  tuf: 'takeuforward',
  gfg: 'GeeksforGeeks',
  backfill: 'LeetCode sync',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Banner styles. Two hard rules apply here and are easy to break:
 *
 * 1. **px units only.** This renders inside a shadow root overlaid on
 *    leetcode.com / neetcode.io / takeuforward.org — `rem` resolves against
 *    the *host page's* root font size, which we do not control, so any rem
 *    would resize unpredictably per site. Unitless line-heights are fine.
 *
 * 2. **The --pt-* values are COPIED LITERALS** mirrored from the web app's
 *    apps/web/app/globals.css (:root = light, .dark = dark). A content script
 *    cannot import the Next.js stylesheet, so the palette is duplicated. Keep
 *    them in sync; every value below appears verbatim in globals.css.
 *
 * They are declared on `.dsa-card` (not `:host`, not `*`) so nothing leaks
 * into — or is inherited from — the host page, and every selector stays
 * prefixed with `dsa-`.
 *
 * WHY prefers-color-scheme HERE AND A CLASS ON THE WEB:
 * the web app resolves dark mode from a `.dark` class written before first
 * paint by an inline script reading localStorage['pt_theme']. A content script
 * lives on the *host page's* DOM and has no such class to hook (and cannot see
 * the extension's or the web app's localStorage), so the OS preference is the
 * only signal available. This media query is correct here and must not be
 * "fixed" into a class toggle, nor copied back into globals.css.
 */
const CSS = `
.dsa-card{
  /* ── PT tokens — light (mirrors globals.css :root) ── */
  --pt-bg:#f5f5f4;
  --pt-surface:#ffffff;
  --pt-surface-2:#fafaf9;
  --pt-surface-raised:#f1f0ee;
  --pt-border:#e7e5e4;
  --pt-border-2:#d6d3d1;
  --pt-text:#1c1917;
  --pt-text-2:#57534e;
  --pt-text-3:#a8a29e;
  --pt-blue:#3b82f6;
  --pt-blue-bg:rgba(59,130,246,.08);
  --pt-blue-ink:#0d3a6e;
  --pt-blue-ring:rgba(59,130,246,.3);
  --pt-green:#16a34a;
  --pt-green-bg:rgba(22,163,74,.08);
  --pt-amber:#d97706;
  --pt-amber-bg:rgba(217,119,6,.08);
  --pt-rose:#e11d48;
  --pt-rose-bg:rgba(225,29,72,.08);
  --pt-violet:#7c3aed;
  --pt-violet-bg:rgba(124,58,237,.08);
  --pt-src-leetcode:#2a78d6;
  --pt-src-neetcode:#008300;
  --pt-src-tuf:#c13a6b;
  --pt-src-gfg:#087a7d;
  --pt-src-backfill:#a86e00;
  --pt-src-other:#79776f;
  --pt-diff-easy:#0b7a0b;
  --pt-diff-medium:#9a6300;
  --pt-diff-hard:#c02f2f;
  --pt-card-shadow:0 10px 30px rgba(11,11,11,0.14);
  /* Inter / JetBrains Mono ship with the web app via next/font and are not
     available here; named first so a local install is used, then system UI. */
  --pt-font-sans:'Inter',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --pt-font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;

  position:fixed;bottom:20px;right:20px;width:360px;max-width:calc(100vw - 40px);
  z-index:2147483647;
  box-sizing:border-box;background:var(--pt-surface);color:var(--pt-text);
  border-radius:10px;padding:16px 18px;
  font-family:var(--pt-font-sans);
  font-size:14px;line-height:1.4;box-shadow:var(--pt-card-shadow);
  border:1px solid var(--pt-border);animation:dsa-slide-in 240ms cubic-bezier(0.16,1,0.3,1);}
@media (prefers-color-scheme: dark){
  .dsa-card{
    /* ── PT tokens — dark (mirrors globals.css .dark) ── */
    --pt-bg:#0c0a09;
    --pt-surface:#1c1917;
    --pt-surface-2:#141312;
    --pt-surface-raised:#252220;
    --pt-border:#292524;
    --pt-border-2:#3a3633;
    --pt-text:#fafaf9;
    --pt-text-2:#a8a29e;
    --pt-text-3:#57534e;
    --pt-blue:#60a5fa;
    --pt-blue-bg:rgba(96,165,250,.1);
    --pt-blue-ink:#eaf1fd;
    --pt-blue-ring:rgba(96,165,250,.25);
    --pt-green:#4ade80;
    --pt-green-bg:rgba(74,222,128,.1);
    --pt-amber:#fbbf24;
    --pt-amber-bg:rgba(251,191,36,.1);
    --pt-rose:#fb7185;
    --pt-rose-bg:rgba(251,113,133,.1);
    --pt-violet:#a78bfa;
    --pt-violet-bg:rgba(167,139,250,.1);
    --pt-src-leetcode:#3987e5;
    --pt-src-neetcode:#008300;
    --pt-src-tuf:#d55181;
    --pt-src-gfg:#22a6a8;
    --pt-src-backfill:#c98500;
    --pt-src-other:#898781;
    --pt-diff-easy:#0ca30c;
    --pt-diff-medium:#fab219;
    --pt-diff-hard:#d03b3b;
    --pt-card-shadow:0 10px 30px rgba(0,0,0,0.55);}
}
@keyframes dsa-slide-in{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
.dsa-close{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--pt-text-3);
  font-family:inherit;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;
  transition:color .15s ease,background-color .15s ease;}
.dsa-close:hover{color:var(--pt-text);background:var(--pt-surface-raised);}
.dsa-row{display:flex;align-items:center;gap:10px;}
.dsa-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;}
.dsa-dot.green{background:var(--pt-green);box-shadow:0 0 0 4px var(--pt-green-bg);}
.dsa-dot.blue{background:var(--pt-blue);box-shadow:0 0 0 4px var(--pt-blue-bg);}
.dsa-dot.amber{background:var(--pt-amber);box-shadow:0 0 0 4px var(--pt-amber-bg);}
.dsa-dot.rose{background:var(--pt-rose);box-shadow:0 0 0 4px var(--pt-rose-bg);}
.dsa-dot.violet{background:var(--pt-violet);box-shadow:0 0 0 4px var(--pt-violet-bg);}
.dsa-head{font-weight:600;font-size:14px;letter-spacing:-0.01em;padding-right:16px;color:var(--pt-text);}
.dsa-sub{color:var(--pt-text-2);margin-top:6px;font-size:12.5px;}
.dsa-title{color:var(--pt-text);font-weight:600;}
/* Uppercase letter-spaced micro-label, matching the dashboard's .hero-label.
   Kept inline so it can sit ahead of a value without restructuring markup. */
.dsa-meta{font-size:10px;font-weight:600;text-transform:uppercase;
  letter-spacing:0.06em;color:var(--pt-text-3);}
/* Source hues come from the shared domain tokens, so a LeetCode badge here is
   the same blue as the LeetCode bar on the dashboard. Unknown sources fall
   through to --pt-src-other. */
.dsa-src{color:var(--pt-src-other);}
.dsa-src-leetcode{color:var(--pt-src-leetcode);}
.dsa-src-neetcode{color:var(--pt-src-neetcode);}
.dsa-src-tuf{color:var(--pt-src-tuf);}
.dsa-src-gfg{color:var(--pt-src-gfg);}
.dsa-src-backfill{color:var(--pt-src-backfill);}
.dsa-big{font-family:var(--pt-font-mono);font-variant-numeric:tabular-nums;
  font-size:20px;font-weight:600;letter-spacing:-0.02em;color:var(--pt-text);}
/* Solid --pt-blue fill takes --pt-bg as its ink (the web app's filled-control
   idiom); --pt-blue-ink is for text on the --pt-blue-bg tint, not on solid. */
.dsa-btn{margin-top:12px;width:100%;background:var(--pt-blue);color:var(--pt-bg);
  border:1px solid transparent;border-radius:6px;
  padding:9px 12px;font-family:inherit;font-size:13px;font-weight:600;letter-spacing:-0.01em;
  cursor:pointer;transition:background-color .15s ease;}
.dsa-btn:hover:not(:disabled){background:color-mix(in srgb,var(--pt-blue) 85%,var(--pt-text));}
.dsa-btn:disabled{opacity:0.55;cursor:default;}
/* Next-problem suggestion (track / sequel series) on the recorded card.
   --pt-blue-ink is the contrasting ink for the --pt-blue-bg tint; a same-tab
   anchor is deliberate — clicking it means "move on to this problem now". */
.dsa-next{display:flex;align-items:baseline;gap:8px;margin-top:12px;padding:10px 12px;
  border:1px solid var(--pt-border);border-radius:8px;text-decoration:none;
  background:var(--pt-blue-bg);transition:border-color .15s ease;}
.dsa-next:hover{border-color:var(--pt-blue);}
.dsa-next-label{flex:0 0 auto;font-size:10px;font-weight:600;text-transform:uppercase;
  letter-spacing:0.06em;color:var(--pt-blue-ink);}
.dsa-next-title{flex:1 1 auto;color:var(--pt-blue-ink);font-weight:600;font-size:13px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsa-next-remaining{flex:0 0 auto;color:var(--pt-text-2);font-size:11.5px;}
.dsa-next::after{content:'→';flex:0 0 auto;color:var(--pt-blue-ink);font-size:13px;}
`;

function Card({ view }: { view: BannerView }) {
  const { state, onMark, onConnect, onClose } = view;
  const connect = () => {
    if (onConnect) {
      onConnect();
      return;
    }
    void chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
  };
  return (
    <div className="dsa-card" role="status">
      <style>{CSS}</style>
      {onClose && (
        <button type="button" className="dsa-close" aria-label="Dismiss" onClick={onClose}>
          ×
        </button>
      )}
      {state.kind === 'already-solved' && (
        <>
          <div className="dsa-row">
            <span className="dsa-dot green" />
            <span className="dsa-head">Already solved ✓</span>
          </div>
          <div className="dsa-sub">
            First solved via{' '}
            <span className={`dsa-src dsa-src-${state.source}`}>
              {sourceLabel(state.source)}
            </span>
            {formatDate(state.date) ? ` on ${formatDate(state.date)}` : ''}.
          </div>
          {state.title && <div className="dsa-sub dsa-title">{state.title}</div>}
        </>
      )}
      {state.kind === 'prompt' && (
        <>
          <div className="dsa-row">
            <span className="dsa-dot blue" />
            <span className="dsa-head">Track this problem?</span>
          </div>
          <div className="dsa-sub">
            You're viewing <span className="dsa-title">{state.title}</span>.
          </div>
          <button type="button" className="dsa-btn" disabled={state.busy} onClick={onMark}>
            {state.busy ? 'Saving…' : 'Mark as completed'}
          </button>
        </>
      )}
      {state.kind === 'recorded' && (
        <>
          <div className="dsa-row">
            <span className="dsa-dot green" />
            <span className="dsa-head">
              {state.isNew ? 'Recorded!' : 'Already counted'}
            </span>
          </div>
          <div className="dsa-sub">
            <span className="dsa-meta">{state.label}</span>:{' '}
            <span className="dsa-big">{state.total}</span>
          </div>
          {state.next && (
            <a className="dsa-next" href={state.next.url}>
              <span className="dsa-next-label">
                {state.next.kind === 'track' ? 'Next in track' : 'Next part'}
              </span>
              <span className="dsa-next-title">{state.next.title}</span>
              {state.next.kind === 'track' && typeof state.next.remaining === 'number' && (
                <span className="dsa-next-remaining">{state.next.remaining} left</span>
              )}
            </a>
          )}
        </>
      )}
      {state.kind === 'queued' && (
        <>
          <div className="dsa-row">
            <span className="dsa-dot amber" />
            <span className="dsa-head">Saved locally</span>
          </div>
          <div className="dsa-sub">API unreachable — will retry automatically.</div>
        </>
      )}
      {state.kind === 'needs-auth' && (
        <>
          <div className="dsa-row">
            <span className="dsa-dot violet" />
            <span className="dsa-head">Connect your tracker</span>
          </div>
          <div className="dsa-sub">{state.message}</div>
          <button type="button" className="dsa-btn" onClick={connect}>
            Open connection settings
          </button>
        </>
      )}
      {state.kind === 'rejected' && (
        <>
          <div className="dsa-row">
            <span className="dsa-dot rose" />
            <span className="dsa-head">Couldn’t record this solve</span>
          </div>
          <div className="dsa-sub">{state.message}</div>
        </>
      )}
    </div>
  );
}

/**
 * Create a shadow-DOM-isolated banner. Returns a handle whose `update` swaps
 * the rendered state in place and `remove` tears the UI down. Content scripts
 * remove + recreate this on route change so no stale banner survives.
 */
export async function createBanner(
  ctx: ContentScriptContext,
  initial: BannerView,
): Promise<BannerHandle> {
  // Render imperatively from a stored view: a useState setter captured during
  // the first render isn't assigned until React commits (async), which
  // silently drops any update() sent right after mount.
  let current: BannerView = initial;
  let root: ReactDOM.Root | null = null;

  const ui = await createShadowRootUi<ReactDOM.Root>(ctx, {
    name: 'dsa-tracker-banner',
    position: 'overlay',
    alignment: 'bottom-right',
    zIndex: 2147483647,
    onMount(container) {
      root = ReactDOM.createRoot(container);
      root.render(<Card view={current} />);
      return root;
    },
    onRemove(r) {
      r?.unmount();
      root = null;
    },
  });

  ui.mount();

  return {
    update(view: BannerView) {
      current = view;
      root?.render(<Card view={current} />);
    },
    remove() {
      ui.remove();
    },
  };
}
