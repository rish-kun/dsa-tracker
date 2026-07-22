import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
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
    canonicalKey: text('canonical_key').primaryKey(),
    lcSlug: text('lc_slug').references(() => problems.lcSlug),
    title: text('title').notNull(),
    difficulty: text('difficulty'),
    firstSource: text('first_source').notNull(),
    firstSolvedAt: timestamp('first_solved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('solved_first_solved_at_idx').on(t.firstSolvedAt)],
);

/** Audit log: every detection/confirmation event, including repeats. */
export const solveEvents = pgTable(
  'solve_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
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
  (t) => [index('solve_events_key_created_idx').on(t.canonicalKey, t.createdAt)],
);

/** Explicit manual overrides only. Absence of a row => derive from solved_problems. */
export const planChecks = pgTable('plan_checks', {
  checkId: text('check_id').primaryKey(),
  done: boolean('done').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row per calendar day of the plan (local date, not UTC). */
export const planDays = pgTable('plan_days', {
  date: text('date').primaryKey(),
  log: text('log'),
  note: text('note'),
  floorDsa: boolean('floor_dsa').notNull().default(false),
  floorCpp: boolean('floor_cpp').notNull().default(false),
  floorLog: boolean('floor_log').notNull().default(false),
  trip: boolean('trip').notNull().default(false),
});

/** Singleton row of manual counters. id is always 'singleton'. */
export const planCounters = pgTable('plan_counters', {
  id: text('id').primaryKey(),
  dsa: integer('dsa').notNull().default(0),
  dsaExtra: integer('dsa_extra').notNull().default(0),
  dsaHist: jsonb('dsa_hist').$type<number[]>().notNull().default([]),
  dsaExtraHist: jsonb('dsa_extra_hist').$type<number[]>().notNull().default([]),
});
