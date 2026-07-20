import type { Difficulty } from '@dsa-tracker/shared';
import { formatCount } from '@/lib/format';

const ORDER: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const CLASS: Record<Difficulty, string> = {
  Easy: 'seg-easy',
  Medium: 'seg-medium',
  Hard: 'seg-hard',
};

export function DifficultyBar({ byDifficulty }: { byDifficulty: Record<Difficulty, number> }) {
  const total = ORDER.reduce((sum, key) => sum + byDifficulty[key], 0);

  return (
    <div className="panel diff-panel">
      <h2 className="panel-title">By difficulty</h2>
      {total === 0 ? (
        <p className="panel-empty">Nothing solved yet — this fills in as you go.</p>
      ) : (
        <>
          <div className="diff-bar" role="img" aria-label={ORDER.map((k) => `${k} ${byDifficulty[k]}`).join(', ')}>
            {ORDER.map((key) => {
              const count = byDifficulty[key];
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={key}
                  className={`diff-seg ${CLASS[key]}`}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
          </div>
          <ul className="diff-legend">
            {ORDER.map((key) => (
              <li key={key} className="diff-legend-item">
                <span className={`diff-dot ${CLASS[key]}`} aria-hidden="true" />
                <span className="diff-legend-label">{key}</span>
                <span className="diff-legend-value">{formatCount(byDifficulty[key])}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
