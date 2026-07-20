import type { Difficulty, StatsResponse } from '@dsa-tracker/shared';
import { sql } from 'drizzle-orm';
import { db, solvedProblems } from '@/db';
import { publicErrorMessage } from '@/lib/api-error';
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
    // This renderer shares the same max: 1 serverless database client as the
    // API routes. Keep reads sequential so it cannot stall later API calls.
    const totals = await getTotals();
    const recent = await getRecent(8);
    const byDifficulty = await db
      .select({
        difficulty: solvedProblems.difficulty,
        count: sql<number>`count(*)::int`,
      })
      .from(solvedProblems)
      .groupBy(solvedProblems.difficulty);
    const bySource = await db
      .select({
        source: solvedProblems.firstSource,
        count: sql<number>`count(*)::int`,
      })
      .from(solvedProblems)
      .groupBy(solvedProblems.firstSource);
    const overTime = await db
      .select({
        date: sql<string>`to_char(first_solved_at, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(solvedProblems)
      .groupBy(sql`to_char(first_solved_at, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(first_solved_at, 'YYYY-MM-DD')`);

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
    console.error(
      `getDashboardStats failed, rendering empty state: ${publicErrorMessage(err)}`,
    );
    return EMPTY_STATS;
  }
}
