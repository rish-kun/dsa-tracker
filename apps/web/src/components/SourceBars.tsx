import { formatCount, sourceLabel } from '@/lib/format';

const ORDER = ['leetcode', 'neetcode', 'tuf', 'gfg', 'backfill'];
const CLASS: Record<string, string> = {
  leetcode: 'src-leetcode',
  neetcode: 'src-neetcode',
  tuf: 'src-tuf',
  gfg: 'src-gfg',
  backfill: 'src-backfill',
};

export function SourceBars({ bySource }: { bySource: Record<string, number> }) {
  const entries = ORDER.map((key) => ({ key, count: bySource[key] ?? 0 })).filter(
    (e) => e.count > 0 || Object.keys(bySource).length === 0,
  );
  const max = Math.max(1, ...entries.map((e) => e.count));
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="panel">
      <h2 className="panel-title">By source</h2>
      {total === 0 ? (
        <p className="panel-empty">No solves recorded yet.</p>
      ) : (
        <ul className="src-bars">
          {entries.map(({ key, count }) => (
            <li key={key} className="src-bar-row">
              <span className="src-bar-label">{sourceLabel(key)}</span>
              <span className="src-bar-track">
                <span
                  className={`src-bar-fill ${CLASS[key] ?? 'src-other'}`}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="src-bar-value">{formatCount(count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
