import type { SolvedProblem, StatsResponse } from '@dsa-tracker/shared';
import { sql } from 'drizzle-orm';
import { db, solvedProblems, solveEvents } from '@/db';
import { publicErrorMessage } from '@/lib/api-error';

const EMPTY_STATS: StatsResponse = {
  totals: { lcUnique: 0, other: 0 },
  byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
  bySource: {},
  overTime: [],
  recent: [],
};

/** Shape of the single row returned by the aggregate query below. */
type StatsRow = {
  totals: StatsResponse['totals'];
  by_difficulty: StatsResponse['byDifficulty'];
  by_source: StatsResponse['bySource'];
  over_time: StatsResponse['overTime'];
  recent: SolvedProblem[];
};

/**
 * The whole `StatsResponse` in a single round trip.
 *
 * This used to be five sequential statements (totals, recent + its chunked
 * solve_events join, by-difficulty, by-source, over-time). Four of them were
 * independent aggregates over `solved_problems`, so they collapse into one
 * statement of scalar subqueries — the reads stay strictly serial on the
 * `max: 1` client (there is no fan-out to stall Supavisor), there is simply
 * one of them instead of five.
 *
 * Notes on exact-shape preservation:
 * - `first_solved_at` is rendered server-side in the precise format
 *   `Date#toISOString()` produces, so the JSON string is byte-identical to the
 *   previous `row.firstSolvedAt.toISOString()`.
 * - `over_time` keeps the original session-timezone `to_char(..., 'YYYY-MM-DD')`
 *   bucketing, not a UTC one.
 * - `json_object_agg` over the grouped sources is exactly the old
 *   `Object.fromEntries(rows.map(r => [r.source, r.count]))`.
 *
 * Throws — callers that must never fail use `getDashboardStats()`.
 */
export async function loadStats(recentLimit: number): Promise<StatsResponse> {
  const rows = await db.execute<StatsRow>(sql`
    with agg as (
      select
        count(*) filter (where canonical_key like 'lc:%')::int as lc_unique,
        count(*) filter (where canonical_key not like 'lc:%')::int as other,
        count(*) filter (where difficulty = 'Easy')::int as easy,
        count(*) filter (where difficulty = 'Medium')::int as medium,
        count(*) filter (where difficulty = 'Hard')::int as hard
      from ${solvedProblems}
    ),
    by_source as (
      select first_source, count(*)::int as n
      from ${solvedProblems}
      group by first_source
    ),
    over_time as (
      select to_char(first_solved_at, 'YYYY-MM-DD') as day, count(*)::int as n
      from ${solvedProblems}
      group by 1
    ),
    recent as (
      select
        s.canonical_key,
        s.lc_slug,
        s.title,
        s.difficulty,
        s.first_source,
        s.first_solved_at as sort_key,
        -- Exactly the format Date#toISOString() produces, so the JSON string
        -- is identical to the previous row.firstSolvedAt.toISOString().
        to_char(
          s.first_solved_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as first_solved_at_iso,
        (
          select ev.url
          from ${solveEvents} ev
          where ev.canonical_key = s.canonical_key
            and ev.url is not null
          order by (ev.source = s.first_source) desc, ev.created_at asc, ev.id asc
          limit 1
        ) as source_url
      from ${solvedProblems} s
      order by s.first_solved_at desc
      limit ${recentLimit}
    )
    select
      (select json_build_object('lcUnique', lc_unique, 'other', other) from agg)
        as totals,
      (select json_build_object('Easy', easy, 'Medium', medium, 'Hard', hard) from agg)
        as by_difficulty,
      coalesce(
        (select json_object_agg(first_source, n) from by_source),
        '{}'::json
      ) as by_source,
      coalesce(
        (select json_agg(json_build_object('date', day, 'count', n) order by day)
         from over_time),
        '[]'::json
      ) as over_time,
      coalesce(
        (select json_agg(
           json_build_object(
             'canonicalKey', canonical_key,
             'lcSlug', lc_slug,
             'title', title,
             'difficulty', difficulty,
             'firstSource', first_source,
             'firstSolvedAt', first_solved_at_iso,
             'sourceUrl', source_url
           ) order by sort_key desc
         ) from recent),
        '[]'::json
      ) as recent
  `);

  const row = rows[0];
  if (!row) return EMPTY_STATS;

  return {
    totals: row.totals,
    byDifficulty: row.by_difficulty,
    bySource: row.by_source,
    overTime: row.over_time,
    recent: row.recent,
  };
}

/**
 * Same aggregate shape as GET /api/stats, computed directly against the DB
 * so dashboard server components avoid a self-fetch. Never throws — falls
 * back to an all-zero shape so the page can always render (empty DB, or no
 * DATABASE_URL at all during local dev / build).
 */
export async function getDashboardStats(): Promise<StatsResponse> {
  try {
    return await loadStats(8);
  } catch (err) {
    console.error(
      `getDashboardStats failed, rendering empty state: ${publicErrorMessage(err)}`,
    );
    return EMPTY_STATS;
  }
}
