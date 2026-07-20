import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';

/** Discriminated union describing which banner card to render. */
export type BannerState =
  | { kind: 'already-solved'; title: string; source: string; date: string }
  | { kind: 'prompt'; title: string; busy?: boolean }
  | { kind: 'recorded'; isNew: boolean; total: number; label: string }
  | { kind: 'queued' };

export interface BannerView {
  state: BannerState;
  onMark?: () => void;
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

// px units only — rem is unreliable inside shadow DOM.
const CSS = `
.dsa-card{position:fixed;bottom:20px;right:20px;width:360px;max-width:calc(100vw - 40px);
  box-sizing:border-box;background:#1e1e24;color:#ffffff;border-radius:12px;padding:16px 18px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:14px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,0.45);
  border:1px solid rgba(255,255,255,0.08);animation:dsa-slide-in 240ms cubic-bezier(0.16,1,0.3,1);}
@keyframes dsa-slide-in{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
.dsa-close{position:absolute;top:10px;right:12px;background:none;border:none;color:#9ca3af;
  font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;}
.dsa-close:hover{color:#ffffff;background:rgba(255,255,255,0.08);}
.dsa-row{display:flex;align-items:center;gap:10px;}
.dsa-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;}
.dsa-dot.green{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,0.18);}
.dsa-dot.blue{background:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,0.18);}
.dsa-dot.amber{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,0.18);}
.dsa-head{font-weight:600;font-size:15px;padding-right:16px;}
.dsa-sub{color:#9ca3af;margin-top:6px;font-size:13px;}
.dsa-title{color:#e5e7eb;font-weight:600;}
.dsa-big{font-size:22px;font-weight:700;color:#22c55e;}
.dsa-btn{margin-top:12px;width:100%;background:#3b82f6;color:#fff;border:none;border-radius:8px;
  padding:9px 12px;font-size:14px;font-weight:600;cursor:pointer;}
.dsa-btn:hover{background:#2563eb;}
.dsa-btn:disabled{opacity:0.6;cursor:default;}
`;

function Card({ view }: { view: BannerView }) {
  const { state, onMark, onClose } = view;
  return (
    <div className="dsa-card" role="status">
      <style>{CSS}</style>
      {onClose && (
        <button className="dsa-close" aria-label="Dismiss" onClick={onClose}>
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
            First solved via {sourceLabel(state.source)}
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
          <button className="dsa-btn" disabled={state.busy} onClick={onMark}>
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
            {state.label}: <span className="dsa-big">{state.total}</span>
          </div>
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
  let setView: ((v: BannerView) => void) | null = null;

  const ui = await createShadowRootUi<ReactDOM.Root>(ctx, {
    name: 'dsa-tracker-banner',
    position: 'overlay',
    alignment: 'bottom-right',
    zIndex: 2147483647,
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      function Host() {
        const [view, set] = useState<BannerView>(initial);
        setView = set;
        return <Card view={view} />;
      }
      root.render(<Host />);
      return root;
    },
    onRemove(root) {
      root?.unmount();
    },
  });

  ui.mount();

  return {
    update(view: BannerView) {
      setView?.(view);
    },
    remove() {
      ui.remove();
    },
  };
}
