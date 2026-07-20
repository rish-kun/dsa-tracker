'use client';

import type { MouseEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { formatDate } from '@/lib/format';

export interface CumulativePoint {
  date: string;
  cumulative: number;
  daily: number;
}

const WIDTH = 720;
const HEIGHT = 220;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function SolvesOverTimeChart({ points }: { points: CumulativePoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const maxY = Math.max(1, points.at(-1)?.cumulative ?? 0);

  const coords = useMemo(
    () =>
      points.map((p, i) => {
        const x = points.length <= 1 ? PAD_LEFT : PAD_LEFT + (i / (points.length - 1)) * plotW;
        const y = PAD_TOP + plotH - (p.cumulative / maxY) * plotH;
        return { x, y, p };
      }),
    [points, plotW, plotH, maxY],
  );

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  const areaPath =
    coords.length > 0
      ? `${linePath} L${coords.at(-1)!.x.toFixed(2)},${(PAD_TOP + plotH).toFixed(2)} ` +
        `L${coords[0].x.toFixed(2)},${(PAD_TOP + plotH).toFixed(2)} Z`
      : '';

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || coords.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const ratio = WIDTH / rect.width;
    const localX = (e.clientX - rect.left) * ratio;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = Math.abs(coords[i].x - localX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  }

  if (points.length === 0) {
    return (
      <div className="panel chart-panel">
        <h2 className="panel-title">Solves over time</h2>
        <p className="panel-empty">Your cumulative progress chart will show up here after your first solve.</p>
      </div>
    );
  }

  const hover = hoverIndex !== null ? coords[hoverIndex] : null;
  const tooltipFlip = hover && hover.x > WIDTH - 140;

  return (
    <div className="panel chart-panel">
      <div className="panel-header">
        <h2 className="panel-title">Solves over time</h2>
        <span className="panel-subtitle">cumulative, first-solve per day</span>
      </div>
      <div className="chart-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="chart-svg"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={`Cumulative unique solves from ${formatDate(points[0].date)} to ${formatDate(points.at(-1)!.date)}, reaching ${points.at(-1)!.cumulative}`}
        >
          <line
            x1={PAD_LEFT}
            y1={PAD_TOP + plotH}
            x2={WIDTH - PAD_RIGHT}
            y2={PAD_TOP + plotH}
            className="chart-baseline"
          />
          <path d={areaPath} className="chart-area" />
          <path d={linePath} className="chart-line" />
          {hover && (
            <>
              <line
                x1={hover.x}
                y1={PAD_TOP}
                x2={hover.x}
                y2={PAD_TOP + plotH}
                className="chart-crosshair"
              />
              <circle cx={hover.x} cy={hover.y} r={5} className="chart-dot" />
            </>
          )}
          <text x={PAD_LEFT} y={HEIGHT - 8} className="chart-axis-label">
            {formatDate(points[0].date)}
          </text>
          <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 8} className="chart-axis-label" textAnchor="end">
            {formatDate(points.at(-1)!.date)}
          </text>
          <text x={PAD_LEFT} y={PAD_TOP + 4} className="chart-axis-label chart-axis-label-max">
            {maxY.toLocaleString('en-US')}
          </text>
        </svg>
        {hover && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(hover.x / WIDTH) * 100}%`,
              transform: tooltipFlip ? 'translateX(-100%)' : 'none',
            }}
          >
            <div className="chart-tooltip-date">{formatDate(hover.p.date)}</div>
            <div className="chart-tooltip-row">
              <span>Total</span>
              <strong>{hover.p.cumulative.toLocaleString('en-US')}</strong>
            </div>
            <div className="chart-tooltip-row chart-tooltip-row-muted">
              <span>That day</span>
              <span>+{hover.p.daily}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
