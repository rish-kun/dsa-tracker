import type { SolvedProblem, StatsResponse } from '@dsa-tracker/shared';
import { sql } from 'drizzle-orm';
import { db, solvedProblems, solveEvents } from '@/db';
import { publicErrorMessage } from '@/lib/api-error';

const EMPTY_STATS: StatsResponse = {
  totals: { lcUnique: 0, other: 0 },
  todaySolved: { date: '', count: 0 },
  byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
  bySource: {},
  overTime: [],
  recent: [],
};

/** Shape of the single row returned by the aggregate query below. */
type StatsRow = {
  totals: StatsResponse['totals'];
  today_solved: StatsResponse['todaySolved'];
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
export async function loadStats(userId: string, recentLimit: number): Promise<StatsResponse> {
  const rows = await db.execute<StatsRow>(sql`
    with bounds as (
      select (now() at time zone 'Asia/Kolkata')::date as today
    ),
    agg as (
      select
        count(*) filter (where canonical_key like 'lc:%')::int as lc_unique,
        count(*) filter (where canonical_key not like 'lc:%')::int as other,
        count(*) filter (where difficulty = 'Easy')::int as easy,
        count(*) filter (where difficulty = 'Medium')::int as medium,
        count(*) filter (where difficulty = 'Hard')::int as hard
      from ${solvedProblems}
      where user_id = ${userId}
    ),
    by_source as (
      select first_source, count(*)::int as n
      from ${solvedProblems}
      where user_id = ${userId}
      group by first_source
    ),
    over_time as (
      select to_char(first_solved_at, 'YYYY-MM-DD') as day, count(*)::int as n
      from ${solvedProblems}
      where user_id = ${userId}
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
            and ev.user_id = s.user_id
            and ev.url is not null
          order by (ev.source = s.first_source) desc, ev.created_at asc, ev.id asc
          limit 1
        ) as source_url
      from ${solvedProblems} s
      where s.user_id = ${userId}
      order by s.first_solved_at desc
      limit ${recentLimit}
    ),
    today_solved as (
      select count(*)::int as n
      from ${solveEvents}, bounds
      where user_id = ${userId}
        and detected <> 'backfill'
        and (created_at at time zone 'Asia/Kolkata')::date = bounds.today
    )
    select
      (select json_build_object('lcUnique', lc_unique, 'other', other) from agg)
        as totals,
      (select json_build_object('Easy', easy, 'Medium', medium, 'Hard', hard) from agg)
        as by_difficulty,
      (select json_build_object(
        'date', to_char(bounds.today, 'YYYY-MM-DD'),
        'count', today_solved.n
      ) from bounds cross join today_solved) as today_solved,
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
    todaySolved: row.today_solved,
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
export async function getDashboardStats(userId: string): Promise<StatsResponse> {
  try {
    return await loadStats(userId, 8);
  } catch (err) {
    console.error(
      `getDashboardStats failed, rendering empty state: ${publicErrorMessage(err)}`,
    );
    return EMPTY_STATS;
  }
}

/**
 * Local, dashboard-only shape — deliberately NOT part of `StatsResponse`
 * (the `@dsa-tracker/shared` API contract used by GET /api/stats and the
 * extension). This is extra derived data for the `/` page only, so it lives
 * next to `StatsResponse` in this same "single read path" file rather than
 * widening the shared contract or adding a second stats module.
 *
 * Everything here is built from `solve_events` where `detected <> 'backfill'`
 * — i.e. live-detected solves (repeats included), bucketed in Asia/Kolkata —
 * which is a different signal from `solved_problems.first_solved_at` (unique,
 * first-solve-only, source-agnostic) that the panels above already cover.
 */
export interface DashboardExtras {
  /** Last 53 weeks (371 days) of live-solve counts, oldest first, zero-filled. */
  heatmap: { date: string; count: number }[];
  /** Days (not necessarily unique problems) with >=1 live solve, consecutive. */
  streak: { current: number; longest: number };
  records: {
    bestDay: { date: string; count: number } | null;
    bestWeek: { weekStart: string; count: number } | null;
    /** Live solves per day, averaged over the trailing 30 days (zero days included). */
    avgPerDay30: number;
    /** All-time count of distinct days with >=1 live solve. */
    daysActive: number;
  };
  /** Live-solve totals for the last 8 calendar weeks (Mon-start), zero-filled. */
  weeklyPace: { weekStart: string; count: number }[];
}

const EMPTY_EXTRAS: DashboardExtras = {
  heatmap: [],
  streak: { current: 0, longest: 0 },
  records: { bestDay: null, bestWeek: null, avgPerDay30: 0, daysActive: 0 },
  weeklyPace: [],
};

type ExtrasRow = {
  heatmap: DashboardExtras['heatmap'];
  streak: DashboardExtras['streak'];
  records: DashboardExtras['records'];
  weekly_pace: DashboardExtras['weeklyPace'];
};

/**
 * One round trip, gaps-and-islands streak calc done in SQL. "Today" is
 * evaluated in Asia/Kolkata at query time (the page is force-dynamic).
 *
 * Throws — callers that must never fail use `getDashboardExtras()`.
 */
export async function loadDashboardExtras(userId: string): Promise<DashboardExtras> {
  const rows = await db.execute<ExtrasRow>(sql`
    with bounds as (
      select (now() at time zone 'Asia/Kolkata')::date as today
    ),
    live as (
      select (created_at at time zone 'Asia/Kolkata')::date as day_date
      from ${solveEvents}
      where user_id = ${userId} and detected <> 'backfill'
    ),
    by_day as (
      select day_date, count(*)::int as n
      from live
      group by day_date
    ),
    heatmap_days as (
      -- 53 weeks, so the grid is the familiar year-long contribution shape and
      -- fills the panel's width instead of huddling in one corner of it.
      select generate_series(
        (select today from bounds) - 370,
        (select today from bounds),
        interval '1 day'
      )::date as day_date
    ),
    heatmap as (
      select hd.day_date, coalesce(bd.n, 0)::int as n
      from heatmap_days hd
      left join by_day bd using (day_date)
    ),
    -- Classic gaps-and-islands: subtracting a per-row sequence number from a
    -- date collapses every run of consecutive dates onto the same grp value.
    islands as (
      select day_date, (day_date - (row_number() over (order by day_date))::int) as grp
      from by_day
    ),
    island_ranges as (
      select grp, min(day_date) as start_date, max(day_date) as end_date, count(*)::int as len
      from islands
      group by grp
    ),
    current_streak as (
      select coalesce(
        (
          select len from island_ranges, bounds
          where end_date >= bounds.today - 1
          order by end_date desc
          limit 1
        ), 0
      ) as len
    ),
    longest_streak as (
      select coalesce(max(len), 0) as len from island_ranges
    ),
    weekly_all as (
      select date_trunc('week', day_date)::date as week_start, sum(n)::int as n
      from by_day
      group by 1
    ),
    best_day as (
      select day_date, n from by_day order by n desc, day_date desc limit 1
    ),
    best_week as (
      select week_start, n from weekly_all order by n desc, week_start desc limit 1
    ),
    last30 as (
      select coalesce(sum(n), 0)::int as total
      from by_day, bounds
      where day_date >= bounds.today - 29
    ),
    days_active as (
      select count(*)::int as n from by_day
    ),
    weekly_window as (
      select generate_series(
        date_trunc('week', (select today from bounds)) - interval '7 weeks',
        date_trunc('week', (select today from bounds)),
        interval '1 week'
      )::date as week_start
    ),
    weekly_pace as (
      select ww.week_start, coalesce(wa.n, 0)::int as n
      from weekly_window ww
      left join weekly_all wa using (week_start)
    )
    select
      coalesce(
        (select json_agg(
           json_build_object('date', to_char(day_date, 'YYYY-MM-DD'), 'count', n)
           order by day_date
         ) from heatmap),
        '[]'
      ) as heatmap,
      json_build_object(
        'current', (select len from current_streak),
        'longest', (select len from longest_streak)
      ) as streak,
      json_build_object(
        'bestDay', (
          select json_build_object('date', to_char(day_date, 'YYYY-MM-DD'), 'count', n)
          from best_day
        ),
        'bestWeek', (
          select json_build_object('weekStart', to_char(week_start, 'YYYY-MM-DD'), 'count', n)
          from best_week
        ),
        'avgPerDay30', (select round(total::numeric / 30, 1) from last30),
        'daysActive', (select n from days_active)
      ) as records,
      coalesce(
        (select json_agg(
           json_build_object('weekStart', to_char(week_start, 'YYYY-MM-DD'), 'count', n)
           order by week_start
         ) from weekly_pace),
        '[]'
      ) as weekly_pace
  `);

  const row = rows[0];
  if (!row) return EMPTY_EXTRAS;

  return {
    heatmap: row.heatmap,
    streak: row.streak,
    records: row.records,
    weeklyPace: row.weekly_pace,
  };
}

/**
 * Never throws — falls back to an all-zero/empty shape so `/` always renders
 * against an unreachable or empty DB, same contract as `getDashboardStats()`.
 */
export async function getDashboardExtras(userId: string): Promise<DashboardExtras> {
  try {
    return await loadDashboardExtras(userId);
  } catch (err) {
    console.error(
      `getDashboardExtras failed, rendering empty state: ${publicErrorMessage(err)}`,
    );
    return EMPTY_EXTRAS;
  }
}
