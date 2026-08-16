import type { DailyTime, TimeSite } from '@dsa-tracker/shared';
import { TIME_SITES } from '@dsa-tracker/shared';
import { formatDate, sourceLabel } from '@/lib/format';
import { formatDuration } from '@/lib/time-tracking';

/** Day-of-month of a `YYYY-MM-DD` key, timezone-agnostic — same trick as the
 *  heatmap: parsing as UTC keeps the label off-by-one-proof. */
function dayOfMonthUTC(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDate();
}

/** Bars shorter than this read as "nothing happened"; a day with two tracked
 *  minutes should still be visibly non-empty. */
const MIN_BAR_PCT = 4;

const AVERAGE_WINDOW = 7;

export function TimeSpentPanel({ days }: { days: DailyTime[] }) {
  // `getDailyTime` zero-fills the whole window and returns it oldest-first, so
  // the last entry is always today even on a day with no tracked time.
  const today = days.length > 0 ? days[days.length - 1] : null;
  const total = days.reduce((sum, d) => sum + d.seconds, 0);
  const max = Math.max(0, ...days.map((d) => d.seconds));

  const recent = days.slice(-AVERAGE_WINDOW);
  const average =
    recent.length > 0 ? recent.reduce((sum, d) => sum + d.seconds, 0) / recent.length : 0;

  const bySite = TIME_SITES.map((site) => ({
    site,
    seconds: days.reduce((sum, d) => sum + d.bySite[site], 0),
  }))
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Time on task</h2>
        <span className="panel-subtitle">last {days.length} days &middot; active tab only</span>
      </div>

      {total === 0 ? (
        <p className="panel-empty">
          No tracked time yet. Time is recorded automatically while a LeetCode, NeetCode, Striver&rsquo;s
          A2Z or GeeksforGeeks tab is open and focused.
        </p>
      ) : (
        <>
          <div className="time-stats">
            <div>
              <p className="micro-label time-stat-label">Today</p>
              <p className="time-stat-value">{formatDuration(today?.seconds ?? 0)}</p>
            </div>
            <div>
              <p className="micro-label time-stat-label">{AVERAGE_WINDOW}-day average</p>
              <p className="time-stat-value time-stat-value-sm">{formatDuration(average)}</p>
            </div>
          </div>

          <div className="time-chart">
            {days.map((day, i) => {
              // Guard the zero max: the whole-window-empty case is handled
              // above, but a single stray zero-second window must not divide.
              const pct = max === 0 ? 0 : (day.seconds / max) * 100;
              const height = day.seconds === 0 ? 0 : Math.max(pct, MIN_BAR_PCT);
              // Sparse axis: every third column counting back from today, so
              // today is always labelled and the ticks never collide.
              const showLabel = (days.length - 1 - i) % 3 === 0;
              const label = `${formatDate(day.date)} · ${formatDuration(day.seconds)}`;

              return (
                <div key={day.date} className="time-col">
                  <div className="time-track" title={label} aria-label={label} role="img">
                    <div className="time-bar" style={{ height: `${height}%` }}>
                      {TIME_SITES.map((site) => {
                        const seconds = day.bySite[site];
                        if (seconds === 0) return null;
                        return (
                          <span
                            key={site}
                            className={`time-seg src-${site}`}
                            style={{ height: `${(seconds / day.seconds) * 100}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span className="time-tick">{showLabel ? dayOfMonthUTC(day.date) : ''}</span>
                </div>
              );
            })}
          </div>

          <ul className="time-legend">
            {bySite.map(({ site, seconds }: { site: TimeSite; seconds: number }) => (
              <li key={site} className="time-legend-item">
                <span className={`src-dot src-${site}`} />
                <span className="time-legend-label">{sourceLabel(site)}</span>
                <span className="time-legend-value">{formatDuration(seconds)}</span>
              </li>
            ))}
            <li className="time-legend-item time-legend-total">
              <span className="time-legend-label">Total</span>
              <span className="time-legend-value">{formatDuration(total)}</span>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
