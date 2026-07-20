import { useEffect, useState } from 'react';
import type { ActiveProblemResult, SolvedProblem, StatsResult } from '@dsa-tracker/shared';
import { sendMessage } from '../../lib/messaging';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function App() {
  const [data, setData] = useState<StatsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiBase, setApiBase] = useState('');
  const [savingBase, setSavingBase] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [activeProblem, setActiveProblem] = useState<ActiveProblemResult | null>(null);
  const [markingCurrent, setMarkingCurrent] = useState(false);
  const [currentMsg, setCurrentMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [res, current] = await Promise.all([
      sendMessage({ type: 'GET_STATS' }),
      sendMessage({ type: 'GET_ACTIVE_PROBLEM' }),
    ]);
    setData(res);
    setActiveProblem(current);
    setApiBase(res.cache.apiBaseUrl);
    setLoading(false);
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
    const cache = await sendMessage({ type: 'SET_API_BASE', baseUrl: apiBase.trim() });
    setApiBase(cache.apiBaseUrl);
    setSavingBase(false);
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
    const res = await sendMessage({ type });
    setBackfilling(false);
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
    const res = await sendMessage({ type: 'MARK_SOLVED', payload });
    setMarkingCurrent(false);
    setCurrentMsg(res.queued ? 'Saved locally — will sync automatically.' : 'Problem recorded.');
    await load();
    setActiveProblem({ payload, solved: true, entry: res.entry });
  }

  const totals = data?.stats?.totals ?? data?.cache.totals ?? { lcUnique: 0, other: 0 };
  const recent: SolvedProblem[] = (data?.stats?.recent ?? data?.cache.solved ?? []).slice(0, 5);
  const apiDown = data ? !data.ok : false;
  const pending = data?.cache.pending ?? 0;

  return (
    <div className="app">
      <header className="hdr">
        <span className="logo">DSA Tracker</span>
        <button className="ghost" onClick={refresh} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </header>

      {apiDown && (
        <div className="warn">
          Backend unreachable — showing cached data.
          {pending > 0 ? ` ${pending} write(s) queued.` : ''}
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
              className="primary-btn current-btn"
              onClick={() => void markCurrentProblem()}
              disabled={markingCurrent}
            >
              {markingCurrent ? 'Saving…' : 'Mark current problem complete'}
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
          className="primary-btn"
          onClick={() => void runSync('RUN_BACKFILL')}
          disabled={backfilling}
        >
          {backfilling ? 'Syncing…' : 'Sync from LeetCode'}
        </button>
        <button
          className="primary-btn secondary"
          onClick={() => void runSync('RUN_NC_IMPORT')}
          disabled={backfilling}
        >
          {backfilling ? 'Syncing…' : 'Sync from NeetCode'}
        </button>
        {backfillMsg && <div className="note">{backfillMsg}</div>}
      </section>

      <section className="block">
        <div className="block-title">API base URL</div>
        <div className="row">
          <input
            className="input"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
          <button className="ghost" onClick={saveBase} disabled={savingBase}>
            {savingBase ? '…' : 'Save'}
          </button>
        </div>
        <button className="link" onClick={openDashboard}>
          Open dashboard →
        </button>
      </section>
    </div>
  );
}
