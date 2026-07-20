import type { SolvedProblem } from '@dsa-tracker/shared';
import { DifficultyChip } from '@/components/DifficultyChip';
import { SourceBadge } from '@/components/SourceBadge';
import { formatRelativeDate, lcUrl, parseTitle } from '@/lib/format';

export function RecentList({ recent }: { recent: SolvedProblem[] }) {
  return (
    <div className="panel">
      <h2 className="panel-title">Recent solves</h2>
      {recent.length === 0 ? (
        <p className="panel-empty">Nothing logged yet — solve something and it'll land here.</p>
      ) : (
        <ol className="recent-list">
          {recent.map((row) => {
            const { number, title } = parseTitle(row);
            const href = row.lcSlug ? lcUrl(row.lcSlug) : null;
            return (
              <li key={row.canonicalKey} className="recent-row">
                <span className="recent-number">{number ? `#${number}` : 'non-LC'}</span>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="recent-title">
                    {title}
                  </a>
                ) : (
                  <span className="recent-title">{title}</span>
                )}
                <DifficultyChip difficulty={row.difficulty} />
                <SourceBadge source={row.firstSource} />
                <span className="recent-date">{formatRelativeDate(row.firstSolvedAt)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
