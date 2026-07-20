import type { Difficulty, StatsResponse } from '@dsa-tracker/shared';
import { sql } from 'drizzle-orm';
import { db, solvedProblems } from '@/db';
import { getRecent, getTotals } from '@/lib/queries';

const EMPTY_STATS: StatsResponse = {
  totals: { lcUnique: 0, other: 0 },
  byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
  bySource: {},
  overTime: [],
  recent: [],
};

/**
 * Same aggregate shape as GET /api/stats, computed directly against the DB
 * so dashboard server components avoid a self-fetch. Never throws — falls
 * back to an all-zero shape so the page can always render (empty DB, or no
 * DATABASE_URL at all during local dev / build).
 */
export async function getDashboardStats(): Promise<StatsResponse> {
  try {
    const [totals, recent, byDifficulty, bySource, overTime] = await Promise.all([
      getTotals(),
      getRecent(8),
      db
        .select({
          difficulty: solvedProblems.difficulty,
          count: sql<number>`count(*)::int`,
        })
        .from(solvedProblems)
        .groupBy(solvedProblems.difficulty),
      db
        .select({
          source: solvedProblems.firstSource,
          count: sql<number>`count(*)::int`,
        })
        .from(solvedProblems)
        .groupBy(solvedProblems.firstSource),
      db
        .select({
          date: sql<string>`to_char(first_solved_at, 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(solvedProblems)
        .groupBy(sql`to_char(first_solved_at, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(first_solved_at, 'YYYY-MM-DD')`),
    ]);

    const difficultyMap: Record<Difficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };
    for (const row of byDifficulty) {
      if (row.difficulty && row.difficulty in difficultyMap) {
        difficultyMap[row.difficulty as Difficulty] = row.count;
      }
    }

    return {
      totals,
      byDifficulty: difficultyMap,
      bySource: Object.fromEntries(bySource.map((r) => [r.source, r.count])),
      overTime,
      recent,
    };
  } catch (err) {
    console.error('getDashboardStats failed, rendering empty state', err);
    return EMPTY_STATS;
  }
}
