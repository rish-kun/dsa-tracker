'use client';

import { formatDuration, type TimeSite } from '@dsa-tracker/shared';
import { useMemo, useState } from 'react';
import { formatDate, sourceLabel } from '@/lib/format';

export interface ProblemTimeRow {
  canonicalKey: string;
  title: string;
  source: TimeSite;
  url: string | null;
  todaySeconds: number;
  totalSeconds: number;
  lastActiveAt: string;
}

type SortKey = 'title' | 'today' | 'total' | 'lastActive';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 25;
const SOURCES: TimeSite[] = ['leetcode', 'neetcode', 'tuf', 'gfg'];

function compareRows(a: ProblemTimeRow, b: ProblemTimeRow, key: SortKey): number {
  if (key === 'title') return a.title.localeCompare(b.title);
  if (key === 'today') return a.todaySeconds - b.todaySeconds;
  if (key === 'total') return a.totalSeconds - b.totalSeconds;
  return a.lastActiveAt.localeCompare(b.lastActiveAt);
}

function SortButton({
  column,
  activeKey,
  direction,
  onSort,
  children,
}: {
  column: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="th-sort" onClick={() => onSort(column)}>
      {children} {activeKey === column && (direction === 'asc' ? '↑' : '↓')}
    </button>
  );
}

export function ProblemTimeTable({ rows }: { rows: ProblemTimeRow[] }) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<TimeSite | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (source !== 'All' && row.source !== source) return false;
        if (!normalizedQuery) return true;
        return (
          row.title.toLowerCase().includes(normalizedQuery) ||
          row.canonicalKey.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const comparison = compareRows(a, b, sortKey);
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [query, rows, sortDirection, sortKey, source]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setPage(1);
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'title' ? 'asc' : 'desc');
  }

  return (
    <div>
      <div className="table-controls">
        <input
          type="search"
          className="search-input max-sm:min-h-[44px]"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search by problem or key…"
          aria-label="Search problem time"
        />
        <label className="time-source-filter">
          <span className="sr-only">Filter by source</span>
          <select
            value={source}
            onChange={(event) => {
              setSource(event.target.value as TimeSite | 'All');
              setPage(1);
            }}
          >
            <option value="All">All sources</option>
            {SOURCES.map((item) => (
              <option key={item} value={item}>
                {sourceLabel(item)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="table-count" aria-live="polite">
        {filtered.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} problems
      </p>

      {filtered.length === 0 ? (
        <p className="panel-empty">No tracked problems match that search.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="problems-table problem-time-table">
              <thead>
                <tr>
                  <th>
                    <SortButton column="title" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}>
                      Problem
                    </SortButton>
                  </th>
                  <th>Source</th>
                  <th>
                    <SortButton column="today" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}>
                      Today
                    </SortButton>
                  </th>
                  <th>
                    <SortButton column="total" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}>
                      Total
                    </SortButton>
                  </th>
                  <th>
                    <SortButton column="lastActive" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}>
                      Last active
                    </SortButton>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.canonicalKey}>
                    <td className="cell-problem">
                      {row.url ? (
                        <a className="cell-title" href={row.url} target="_blank" rel="noreferrer">
                          {row.title}
                        </a>
                      ) : (
                        <span className="cell-title">{row.title}</span>
                      )}
                      <span className="problem-time-key">{row.canonicalKey}</span>
                    </td>
                    <td>
                      <span className="src-badge">
                        <span className={`src-dot src-${row.source}`} />
                        {sourceLabel(row.source)}
                      </span>
                    </td>
                    <td className="cell-duration">{formatDuration(row.todaySeconds)}</td>
                    <td className="cell-duration cell-duration-total">{formatDuration(row.totalSeconds)}</td>
                    <td className="cell-date">{formatDate(row.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="table-pagination" aria-label="Problem time pages">
            <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page === 1}>
              Previous
            </button>
            <span>
              Page {page} of {pageCount}
            </span>
            <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page === pageCount}>
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
