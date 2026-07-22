import { formatCount, formatDate } from '@/lib/format';

interface WeekPoint {
  weekStart: string;
  count: number;
}

export function WeeklyPacePanel({ weeklyPace }: { weeklyPace: WeekPoint[] }) {
  const total = weeklyPace.reduce((sum, w) => sum + w.count, 0);
  const max = Math.max(1, ...weeklyPace.map((w) => w.count));

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Weekly pace</h2>
        <span className="panel-subtitle">live solves</span>
      </div>
      {total === 0 ? (
        <p className="panel-empty">No live solves recorded yet.</p>
      ) : (
        <ul className="src-bars">
          {weeklyPace.map((w) => (
            <li key={w.weekStart} className="src-bar-row">
              <span className="src-bar-label">{formatDate(w.weekStart)}</span>
              <span className="src-bar-track">
                <span
                  className="src-bar-fill"
                  style={{ width: `${(w.count / max) * 100}%`, backgroundColor: 'var(--pt-blue)' }}
                />
              </span>
              <span className="src-bar-value">{formatCount(w.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
