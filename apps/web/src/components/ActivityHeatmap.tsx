import { formatDate } from '@/lib/format';

interface HeatmapDay {
  date: string;
  count: number;
}

/** Sunday-Saturday index (0-6) of a `YYYY-MM-DD` calendar date, timezone-agnostic. */
function dayOfWeekUTC(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Month index (0-11) of a `YYYY-MM-DD` calendar date, timezone-agnostic. */
function monthUTC(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCMonth();
}

/** Pads to full Sun-Sat weeks and chunks into columns, oldest week first. */
function buildWeeks(days: HeatmapDay[]): (HeatmapDay | null)[][] {
  if (days.length === 0) return [];
  const leadingBlanks = dayOfWeekUTC(days[0].date);
  const cells: (HeatmapDay | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Which week columns start a new month, for the labels along the top. The first
 * column is skipped — it is usually a partial week and its label would collide
 * with the second month's.
 */
function monthLabels(weeks: (HeatmapDay | null)[][]): (string | null)[] {
  let last = -1;
  return weeks.map((week, i) => {
    const first = week.find((d): d is HeatmapDay => d !== null);
    if (!first) return null;
    const m = monthUTC(first.date);
    if (m === last) return null;
    last = m;
    return i === 0 ? null : MONTHS[m];
  });
}

const LEVEL_OPACITY = [0, 0.3, 0.55, 0.78, 1];

function levelFor(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

function Cell({ level }: { level: number }) {
  return (
    <div
      className="h-[11px] w-[11px] rounded-[2px]"
      style={{
        backgroundColor: level === 0 ? 'var(--pt-border)' : 'var(--pt-green)',
        opacity: level === 0 ? 1 : LEVEL_OPACITY[level],
      }}
    />
  );
}

export function ActivityHeatmap({ heatmap }: { heatmap: HeatmapDay[] }) {
  const total = heatmap.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(0, ...heatmap.map((d) => d.count));
  const weeks = buildWeeks(heatmap);
  const labels = monthLabels(weeks);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Solve activity</h2>
        <span className="panel-subtitle">last year &middot; live detections only</span>
      </div>

      {total === 0 ? (
        <p className="panel-empty">No live activity in the last year yet.</p>
      ) : (
        <>
          {/* A year of 11px cells is ~830px, so it fits the widened page from
              `lg` up and scrolls on anything narrower rather than shrinking the
              cells into mush. */}
          <div className="table-scroll rounded-none border-0 pb-1">
            <div className="inline-flex flex-col gap-1">
              <div className="flex gap-[3px] pl-[26px]">
                {labels.map((label, i) => (
                  <div
                    key={i}
                    className="w-[11px] shrink-0 font-mono text-[10px] text-[var(--pt-text-3)]"
                  >
                    {label && <span className="whitespace-nowrap">{label}</span>}
                  </div>
                ))}
              </div>

              <div className="flex gap-[3px]">
                {/* Mon/Wed/Fri only — labelling all seven rows is unreadable at
                    11px and the alternating ones are enough to orient. */}
                <div className="mr-[3px] flex w-[23px] shrink-0 flex-col gap-[3px]">
                  {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
                    <div
                      key={i}
                      className="h-[11px] font-mono text-[9px] leading-[11px] text-[var(--pt-text-3)]"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {weeks.map((week, wi) => (
                  <div key={wi} className="flex shrink-0 flex-col gap-[3px]">
                    {week.map((day, di) =>
                      day ? (
                        <div
                          key={di}
                          title={`${day.count} live solve${day.count === 1 ? '' : 's'} · ${formatDate(day.date)}`}
                        >
                          <Cell level={levelFor(day.count, max)} />
                        </div>
                      ) : (
                        <div key={di} className="h-[11px] w-[11px]" />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--pt-text-3)]">
              <span className="font-mono tabular-nums text-[var(--pt-text-2)]">{total}</span> live
              solves in the last year
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--pt-text-3)]">
              Less
              {[0, 1, 2, 3, 4].map((l) => (
                <Cell key={l} level={l} />
              ))}
              More
            </span>
          </div>
        </>
      )}
    </div>
  );
}
