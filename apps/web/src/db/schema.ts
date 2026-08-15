import type { Difficulty, TimeSite } from '@dsa-tracker/shared';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Canonical LeetCode catalog, seeded from leetcode.com/api/problems/all/. */
export const problems = pgTable(
  'problems',
  {
    lcSlug: text('lc_slug').primaryKey(),
    lcNumber: integer('lc_number').notNull(),
    title: text('title').notNull(),
    difficulty: text('difficulty').notNull(),
    paidOnly: boolean('paid_only').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // resolveCatalogProblem() and POST /api/import both look a problem up by
    // its punctuation-stripped title. Without this the equality test is
    // unindexable and every NeetCode/TUF page view seq-scans the whole ~4k-row
    // catalog. The expression must stay byte-identical to `normalizedTitleSql`
    // in src/lib/queries.ts or the planner will not use the index.
    index('problems_title_normalized_idx').using(
      'btree',
      sql`regexp_replace(lower("title"), '[^a-z0-9]', '', 'g')`,
    ),
  ],
);

/** One row per unique solved problem — this table IS the counter. */
export const solvedProblems = pgTable(
  'solved_problems',
  {
    userId: text('user_id').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    lcSlug: text('lc_slug').references(() => problems.lcSlug),
    title: text('title').notNull(),
    difficulty: text('difficulty'),
    firstSource: text('first_source').notNull(),
    firstSolvedAt: timestamp('first_solved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.canonicalKey] }),
    index('solved_user_first_solved_at_idx').on(t.userId, t.firstSolvedAt),
  ],
);

/** Audit log: every detection/confirmation event, including repeats. */
export const solveEvents = pgTable(
  'solve_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    source: text('source').notNull(),
    url: text('url'),
    detected: text('detected').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Supersedes the old single-column solve_events_key_idx: every access path
  // is "events for one canonical key, earliest first" (the sourceUrl subquery
  // in src/lib/queries.ts, /api/backfill and /api/import link repair), and the
  // leading column still serves reconcileAlias' bare `canonical_key =` update.
  // A separate index on just (canonical_key) would be a redundant prefix that
  // only costs write amplification on this append-only audit table.
  (t) => [
    index('solve_events_user_key_created_idx').on(t.userId, t.canonicalKey, t.createdAt),
    index('solve_events_user_live_created_idx')
      .on(t.userId, t.createdAt)
      .where(sql`${t.detected} <> 'backfill'`),
  ],
);

/** Explicit manual overrides only. Absence of a row => derive from solved_problems. */
export const planChecks = pgTable('plan_checks', {
  userId: text('user_id').notNull(),
  checkId: text('check_id').notNull(),
  done: boolean('done').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.checkId] })]);

/** One row per calendar day of the plan (local date, not UTC). */
export const planDays = pgTable('plan_days', {
  userId: text('user_id').notNull(),
  date: text('date').notNull(),
  log: text('log'),
  note: text('note'),
  floorDsa: boolean('floor_dsa').notNull().default(false),
  floorCpp: boolean('floor_cpp').notNull().default(false),
  floorLog: boolean('floor_log').notNull().default(false),
  trip: boolean('trip').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.date] })]);

/** Singleton row of manual counters. id is always 'singleton'. */
export const planCounters = pgTable('plan_counters', {
  userId: text('user_id').notNull(),
  id: text('id').notNull(),
  dsa: integer('dsa').notNull().default(0),
  dsaExtra: integer('dsa_extra').notNull().default(0),
  dsaHist: jsonb('dsa_hist').$type<number[]>().notNull().default([]),
  dsaExtraHist: jsonb('dsa_extra_hist').$type<number[]>().notNull().default([]),
}, (t) => [primaryKey({ columns: [t.userId, t.id] })]);

/** One resolved entry of the user's track. Saved by saveTrack() as a catalog
 * snapshot, so rendering needs no catalog join and the list reflects the
 * problem data as it was when the track was saved. */
export interface TrackItem {
  slug: string;
  title: string;
  number: number;
  difficulty: Difficulty;
  paidOnly: boolean;
}

/** The user's single track — exactly one row per user; `items` order IS the
 * track order. Going multi-track later means new tables, not new columns. */
export const userTracks = pgTable('user_tracks', {
  userId: text('user_id').primaryKey(),
  name: text('name').notNull(),
  items: jsonb('items').$type<TrackItem[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-day active time on a practice site, one row per (user, day, site).
 *
 * `date` is a tracker-day key (`YYYY-MM-DD` in TRACKER_TZ) stored as text, the
 * same convention as `plan_days.date` — not a date type, so no timezone
 * reinterpretation can shift a day. `seconds` is a running total the extension
 * increments; see `recordTime` in src/lib/time-tracking.ts.
 */
export const timeDaily = pgTable('time_daily', {
  userId: text('user_id').notNull(),
  date: text('date').notNull(),
  site: text('site').$type<TimeSite>().notNull(),
  seconds: integer('seconds').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.date, t.site] })]);
