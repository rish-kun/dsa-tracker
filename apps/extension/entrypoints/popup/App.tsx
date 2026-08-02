import { useEffect, useState } from 'react';
import type { ActiveProblemResult, SolvedProblem, StatsResult } from '@dsa-tracker/shared';
import { sendMessage } from '../../lib/messaging';

// Explicit locale so the rendered string is stable regardless of the host
// browser's locale ordering ("Jan 5" everywhere, never "5 Jan").
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function formatDate(iso: string): string {
  const d = new Date(iso);
  // No explicit `timeZone`: this is an extension popup, rendered only in the
  // browser — there is no server render and so no hydration to mismatch (the
  // rule self-gates on "ssr", which this project is not). Pinning a timeZone
  // would actively regress it: a solve stamped late in the user's evening must
  // show that day, not UTC's next one.
  // react-doctor-disable-next-line react-doctor/no-locale-format-in-render
  return Number.isNaN(d.getTime()) ? '' : DATE_FMT.format(d);
}

export function App() {
  const [data, setData] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [savingBase, setSavingBase] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [activeProblem, setActiveProblem] = useState<ActiveProblemResult | null>(null);
  const [markingCurrent, setMarkingCurrent] = useState(false);
  const [currentMsg, setCurrentMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [res, current] = await Promise.all([
        sendMessage({ type: 'GET_STATS' }),
        sendMessage({ type: 'GET_ACTIVE_PROBLEM' }),
      ]);
      setData(res);
      setActiveProblem(current);
      setApiBase(res.cache.apiBaseUrl);
    } finally {
      // Must clear on rejection too, or Refresh stays disabled forever.
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refresh() {
    setBackfillMsg(null);
    await load();
  }

  async function saveBase() {
    setSavingBase(true);
    try {
      const cache = await sendMessage({ type: 'SET_API_BASE', baseUrl: apiBase.trim() });
      setApiBase(cache.apiBaseUrl);
    } finally {
      // Must clear on rejection too, or Save stays disabled forever.
      setSavingBase(false);
    }
    await load();
  }

  async function saveApiKey() {
    setSavingKey(true);
    try {
      await sendMessage({ type: 'SET_API_KEY', key: apiKey });
      // The storage layer retains the key but the popup must never re-render it.
      setApiKey('');
    } finally {
      setSavingKey(false);
    }
    await load();
  }

  async function clearApiKey() {
    setSavingKey(true);
    try {
      await sendMessage({ type: 'CLEAR_API_KEY' });
      setApiKey('');
    } finally {
      setSavingKey(false);
    }
    await load();
  }

  async function openDashboard() {
    const base = data?.cache.apiBaseUrl ?? apiBase;
    if (base) await chrome.tabs.create({ url: base });
  }

  async function runSync(type: 'RUN_BACKFILL' | 'RUN_NC_IMPORT') {
    const site = type === 'RUN_BACKFILL' ? 'leetcode.com' : 'neetcode.io';
    setBackfilling(true);
    setBackfillMsg(`Collecting solved problems from ${site}…`);
    let res;
    try {
      res = await sendMessage({ type });
    } finally {
      // Must clear on rejection too, or both Sync buttons stay disabled forever.
      setBackfilling(false);
    }
    if (!res.ok) {
      setBackfillMsg(res.error ?? 'Sync failed.');
      return;
    }
    const summary = `Imported ${res.imported ?? 0} new, skipped ${res.skipped ?? 0} known (${res.collected ?? 0} collected). Unique total now ${res.totals?.lcUnique ?? 0}.`;
    setBackfillMsg(res.warning ? `${summary} ${res.warning}` : summary);
    await load();
  }

  async function markCurrentProblem() {
    const payload = activeProblem?.payload;
    if (!payload) return;
    setMarkingCurrent(true);
    setCurrentMsg(null);
    let res;
    try {
      res = await sendMessage({ type: 'MARK_SOLVED', payload });
    } finally {
      // Must clear on rejection too, or the Mark button stays disabled forever.
      setMarkingCurrent(false);
    }
    setCurrentMsg(res.queued ? 'Saved locally — will sync automatically.' : 'Problem recorded.');
    await load();
    setActiveProblem({ payload, solved: true, entry: res.entry });
  }

  const totals = data?.stats?.totals ?? data?.cache.totals ?? { lcUnique: 0, other: 0 };
  const recent: SolvedProblem[] = (data?.stats?.recent ?? data?.cache.solved ?? []).slice(0, 5);
  const apiDown = data ? !data.ok : false;
  const pending = data?.cache.pending ?? 0;
  const rejected = data?.cache.rejected ?? 0;
  const rejectedItems = data?.cache.rejectedItems ?? [];
  const authState = data?.cache.authState;
  const keyConfigured = data?.cache.hasApiKey ?? false;
  const canUseApi = authState === 'ok';

  return (
    <div className="app">
      <header className="hdr">
        <span className="logo">DSA Tracker</span>
        <button type="button" className="ghost" onClick={refresh} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </header>

      {authState === 'missing-key' && (
        <div className="warn">
          Add an extension API key to connect your tracker.
          {pending > 0 ? ` ${pending} write(s) are safely waiting.` : ''}
        </div>
      )}
      {authState === 'invalid-key' && (
        <div className="warn">
          This extension key was rejected or revoked. Replace it to resume sync.
          {pending > 0 ? ` ${pending} write(s) are safely waiting.` : ''}
        </div>
      )}
      {authState === 'api-error' && (
        <div className="warn">
          Backend unreachable — showing cached data.
          {pending > 0 ? ` ${pending} write(s) queued.` : ''}
        </div>
      )}
      {rejected > 0 && (
        <div className="warn rejected">
          {rejected} write{rejected === 1 ? '' : 's'} rejected by the server and kept out of
          the sync queue. Check your tracker version or problem details.
          <ul className="dead-letter-list" aria-label="Rejected writes">
            {rejectedItems.map((item) => (
              <li key={`${item.rejectedAt}:${item.canonicalKey}`}>
                <strong>{item.title}</strong>
                <span>{item.status ? `HTTP ${item.status}` : 'Request failed'} · {item.canonicalKey}</span>
                {item.error && <span title={item.error}>{item.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="counts">
        <div className="count primary">
          <span className="num">{totals.lcUnique}</span>
          <span className="lbl">unique LeetCode</span>
        </div>
        <div className="count">
          <span className="num small">{totals.other}</span>
          <span className="lbl">other (non-LC)</span>
        </div>
      </section>

      {activeProblem?.payload && (
        <section className="current-problem">
          <div className="block-title">Current problem</div>
          <div className="current-title">
            {activeProblem.entry?.title ?? activeProblem.payload.title}
          </div>
          {activeProblem.solved ? (
            <div className="current-status">Already tracked ✓</div>
          ) : (
            <button
              type="button"
              className="primary-btn current-btn"
              onClick={() => void markCurrentProblem()}
              disabled={markingCurrent || authState === 'missing-key' || authState === 'invalid-key'}
            >
              {markingCurrent
                ? 'Saving…'
                : authState === 'missing-key' || authState === 'invalid-key'
                  ? 'Connect an API key to record'
                  : 'Mark current problem complete'}
            </button>
          )}
          {currentMsg && <div className="note">{currentMsg}</div>}
        </section>
      )}

      <section className="block">
        <div className="block-title">Recent</div>
        {recent.length === 0 ? (
          <div className="empty">No solves yet.</div>
        ) : (
          <ul className="list">
            {recent.map((s) => (
              <li key={s.canonicalKey}>
                <span className="item-title">{s.title}</span>
                <span className="item-date">{formatDate(s.firstSolvedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="block">
        <button
          type="button"
          className="primary-btn"
          onClick={() => void runSync('RUN_BACKFILL')}
          disabled={backfilling || !canUseApi}
        >
          {backfilling ? 'Syncing…' : 'Sync from LeetCode'}
        </button>
        <button
          type="button"
          className="primary-btn secondary"
          onClick={() => void runSync('RUN_NC_IMPORT')}
          disabled={backfilling || !canUseApi}
        >
          {backfilling ? 'Syncing…' : 'Sync from NeetCode'}
        </button>
        {backfillMsg && <div className="note">{backfillMsg}</div>}
      </section>

      <section className="block">
        <label className="block-title" htmlFor="api-base-url">
          API base URL
        </label>
        <div className="row">
          <input
            id="api-base-url"
            className="input"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
          <button type="button" className="ghost" onClick={saveBase} disabled={savingBase}>
            {savingBase ? '…' : 'Save'}
          </button>
        </div>
        <button type="button" className="link" onClick={openDashboard}>
          Open dashboard →
        </button>
      </section>

      <section className="block key-block">
        <label className="block-title" htmlFor="api-key">
          Extension API key
        </label>
        <div className="row">
          <input
            id="api-key"
            className="input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyConfigured ? 'Key configured — paste to replace' : 'Paste key from Settings'}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => void saveApiKey()}
            disabled={savingKey || !apiKey.trim()}
          >
            {savingKey ? '…' : keyConfigured ? 'Replace' : 'Connect'}
          </button>
        </div>
        {keyConfigured && (
          <button type="button" className="link danger-link" onClick={() => void clearApiKey()} disabled={savingKey}>
            Disconnect key
          </button>
        )}
        <div className="note">Create or revoke keys in your tracker’s Settings page.</div>
      </section>
    </div>
  );
}
