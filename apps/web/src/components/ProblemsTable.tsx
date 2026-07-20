'use client';

import type { Difficulty, SolvedProblem } from '@dsa-tracker/shared';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { DifficultyChip } from '@/components/DifficultyChip';
import { SourceBadge } from '@/components/SourceBadge';
import { formatDate, lcUrl, parseTitle, sourceLabel } from '@/lib/format';

type SortKey = 'date' | 'number';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const SOURCES = ['leetcode', 'neetcode', 'tuf', 'backfill'];

export function ProblemsTable({ rows }: { rows: SolvedProblem[] }) {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'All'>('All');
  const [source, setSource] = useState<string>('All');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const parsed = useMemo(
    () => rows.map((row) => ({ row, ...parseTitle(row) })),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = parsed.filter(({ row, title }) => {
      if (difficulty !== 'All' && row.difficulty !== difficulty) return false;
      if (source !== 'All' && row.firstSource !== source) return false;
      if (q && !title.toLowerCase().includes(q) && !(row.lcSlug ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp = a.row.firstSolvedAt.localeCompare(b.row.firstSolvedAt);
      } else {
        cmp = (a.number ?? -1) - (b.number ?? -1);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [parsed, query, difficulty, source, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div>
      <div className="table-controls">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or slug…"
          className="search-input"
          aria-label="Search problems"
        />
        <div className="chip-group" role="group" aria-label="Filter by difficulty">
          <FilterChip active={difficulty === 'All'} onClick={() => setDifficulty('All')}>
            All
          </FilterChip>
          {DIFFICULTIES.map((d) => (
            <FilterChip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
              {d}
            </FilterChip>
          ))}
        </div>
        <div className="chip-group" role="group" aria-label="Filter by source">
          <FilterChip active={source === 'All'} onClick={() => setSource('All')}>
            All sources
          </FilterChip>
          {SOURCES.map((s) => (
            <FilterChip key={s} active={source === s} onClick={() => setSource(s)}>
              {sourceLabel(s)}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="table-count">
        {filtered.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} problems
      </p>

      {filtered.length === 0 ? (
        <p className="panel-empty">No problems match those filters.</p>
      ) : (
        <div className="table-scroll">
          <table className="problems-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="th-sort" onClick={() => toggleSort('number')}>
                    # {sortKey === 'number' && (sortDir === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
                <th>Title</th>
                <th>Difficulty</th>
                <th>Source</th>
                <th>
                  <button type="button" className="th-sort" onClick={() => toggleSort('date')}>
                    Solved {sortKey === 'date' && (sortDir === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ row, number, title }) => {
                const leetcodeHref = row.lcSlug ? lcUrl(row.lcSlug) : null;
                return (
                  <tr key={row.canonicalKey}>
                    <td className="cell-number">
                      {number ? `#${number}` : <span className="chip chip-unknown">non-LC</span>}
                    </td>
                    <td className="cell-problem">
                      <span className="cell-title">{title}</span>
                      <span className="review-links">
                        {row.sourceUrl && (
                          <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                            Original ↗
                          </a>
                        )}
                        {leetcodeHref && (
                          <a href={leetcodeHref} target="_blank" rel="noreferrer">
                            LeetCode ↗
                          </a>
                        )}
                      </span>
                    </td>
                    <td>
                      <DifficultyChip difficulty={row.difficulty} />
                    </td>
                    <td>
                      <SourceBadge source={row.firstSource} />
                    </td>
                    <td className="cell-date">{formatDate(row.firstSolvedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="filter-chip" data-active={active || undefined} onClick={onClick}>
      {children}
    </button>
  );
}
