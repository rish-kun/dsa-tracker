import type { TrackItem } from '@/db';
import { DifficultyChip } from '@/components/DifficultyChip';
import { TrackEditor } from '@/components/TrackEditor';
import { lcUrl } from '@/lib/format';
import { trackToText } from '@/lib/tracks';

/**
 * The track panel on /problems: the ordered list with live solved state, a
 * Continue link that always targets the first unsolved problem, and a
 * completed state once every item is solved. Solved state is derived from
 * solved_problems via the page's key set — the track itself stores nothing
 * about progress.
 */
export function TrackPanel({
  name,
  items,
  solvedKeys,
}: {
  name: string | null;
  items: TrackItem[];
  solvedKeys: Set<string>;
}) {
  const hasTrack = items.length > 0;
  const solvedCount = items.filter((item) => solvedKeys.has(`lc:${item.slug}`)).length;
  const nextItem = items.find((item) => !solvedKeys.has(`lc:${item.slug}`));
  const completed = hasTrack && !nextItem;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{hasTrack ? name || 'Track' : 'Track'}</h2>
          <p className="panel-subtitle">
            {hasTrack
              ? completed
                ? `${items.length} / ${items.length} solved · completed`
                : `${solvedCount} / ${items.length} solved · ${items.length - solvedCount} to go`
              : 'Work through a curated list, one problem at a time.'}
          </p>
        </div>
      </div>

      {!hasTrack && (
        <p className="panel-empty">
          No track yet — paste a list of problems below to start one. After each solve the
          tracker banner will point you at the next unsolved problem.
        </p>
      )}

      {completed && (
        <div className="track-complete">
          <span aria-hidden>✓</span> Track completed — every problem solved.
        </div>
      )}

      {nextItem && (
        <a className="track-continue" href={lcUrl(nextItem.slug)} target="_blank" rel="noreferrer">
          <span className="track-continue-label">Continue</span>
          <span className="track-continue-title">
            {nextItem.number}. {nextItem.title}
          </span>
          <span aria-hidden>→</span>
        </a>
      )}

      {hasTrack && (
        <ol className="track-list">
          {items.map((item, i) => {
            const solved = solvedKeys.has(`lc:${item.slug}`);
            return (
              <li key={item.slug} className={solved ? 'track-row done' : 'track-row'}>
                <span className="track-pos">{String(i + 1).padStart(2, '0')}</span>
                <a className="track-title" href={lcUrl(item.slug)} target="_blank" rel="noreferrer">
                  {item.number}. {item.title}
                </a>
                <DifficultyChip difficulty={item.difficulty} />
                <span className="track-done-mark" aria-hidden>
                  {solved ? '✓' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="track-footer">
        <TrackEditor
          initialName={name ?? ''}
          initialText={hasTrack ? trackToText(items) : ''}
          defaultOpen={!hasTrack}
        />
      </div>
    </section>
  );
}
