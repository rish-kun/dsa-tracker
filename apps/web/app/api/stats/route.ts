import type { Difficulty, StatsResponse } from '@dsa-tracker/shared';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, solvedProblems } from '@/db';
import { apiErrorResponse } from '@/lib/api-error';
import { getRecent, getTotals } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // The serverless client deliberately has max: 1. Keep these reads
    // sequential so transaction-mode Supavisor never receives a query fan-out
    // over a single connection.
    const totals = await getTotals();
    const recent = await getRecent(10);
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

    const difficultyMap: Record<Difficulty, number> = {
      Easy: 0,
      Medium: 0,
      Hard: 0,
    };
    for (const row of byDifficulty) {
      if (row.difficulty && row.difficulty in difficultyMap) {
        difficultyMap[row.difficulty as Difficulty] = row.count;
      }
    }

    const body: StatsResponse = {
      totals,
      byDifficulty: difficultyMap,
      bySource: Object.fromEntries(bySource.map((r) => [r.source, r.count])),
      overTime,
      recent,
    };
    return NextResponse.json(body);
  } catch (error) {
    return apiErrorResponse('GET /api/stats', error);
  }
}
