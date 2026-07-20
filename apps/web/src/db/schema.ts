import {
  bigserial,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Canonical LeetCode catalog, seeded from leetcode.com/api/problems/all/. */
export const problems = pgTable('problems', {
  lcSlug: text('lc_slug').primaryKey(),
  lcNumber: integer('lc_number').notNull(),
  title: text('title').notNull(),
  difficulty: text('difficulty').notNull(),
  paidOnly: boolean('paid_only').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  (t) => [index('solve_events_key_idx').on(t.canonicalKey)],
);
