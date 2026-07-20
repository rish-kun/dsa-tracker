import type {
  Difficulty,
  SolveRequest,
  SolvedProblem,
  Totals,
} from '@dsa-tracker/shared';
import { desc, eq, like, notLike, sql } from 'drizzle-orm';
import { db, problems, solvedProblems, solveEvents } from '@/db';

type SolvedRow = typeof solvedProblems.$inferSelect;

export function toSolvedProblem(row: SolvedRow): SolvedProblem {
  return {
    canonicalKey: row.canonicalKey,
    lcSlug: row.lcSlug,
    title: row.title,
    difficulty: (row.difficulty as Difficulty) ?? null,
    firstSource: row.firstSource as SolvedProblem['firstSource'],
    firstSolvedAt: row.firstSolvedAt.toISOString(),
  };
}

export async function getTotals(): Promise<Totals> {
  const [lc] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(solvedProblems)
    .where(like(solvedProblems.canonicalKey, 'lc:%'));
  const [other] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(solvedProblems)
    .where(notLike(solvedProblems.canonicalKey, 'lc:%'));
  return { lcUnique: lc.count, other: other.count };
}

export async function getSolved(key: string): Promise<SolvedProblem | null> {
  const rows = await db
    .select()
    .from(solvedProblems)
    .where(eq(solvedProblems.canonicalKey, key))
    .limit(1);
  return rows[0] ? toSolvedProblem(rows[0]) : null;
}

/**
 * Records a solve. Upserts into solved_problems (no-op when already solved)
 * and always logs a solve_event. Returns whether the problem was new.
 */
export async function recordSolve(req: SolveRequest): Promise<{
  isNew: boolean;
  alreadySolved: SolvedProblem | null;
}> {
  let { title, lcSlug } = req;
  let difficulty: string | null = null;

  // Enrich from the catalog when we have a LeetCode slug.
  if (lcSlug) {
    const [p] = await db
      .select()
      .from(problems)
      .where(eq(problems.lcSlug, lcSlug))
      .limit(1);
    if (p) {
      title = `${p.lcNumber}. ${p.title}`;
      difficulty = p.difficulty;
    } else {
      lcSlug = undefined; // unknown slug — don't violate the FK
    }
  }

  const inserted = await db
    .insert(solvedProblems)
    .values({
      canonicalKey: req.canonicalKey,
      lcSlug: lcSlug ?? null,
      title,
      difficulty,
      firstSource: req.source,
    })
    .onConflictDoNothing()
    .returning();

  await db.insert(solveEvents).values({
    canonicalKey: req.canonicalKey,
    source: req.source,
    url: req.url,
    detected: req.detected,
  });

  const isNew = inserted.length > 0;
  return {
    isNew,
    alreadySolved: isNew ? null : await getSolved(req.canonicalKey),
  };
}

export async function getAllSolved(): Promise<SolvedProblem[]> {
  const rows = await db
    .select()
    .from(solvedProblems)
    .orderBy(desc(solvedProblems.firstSolvedAt));
  return rows.map(toSolvedProblem);
}

export async function getRecent(limit: number): Promise<SolvedProblem[]> {
  const rows = await db
    .select()
    .from(solvedProblems)
    .orderBy(desc(solvedProblems.firstSolvedAt))
    .limit(limit);
  return rows.map(toSolvedProblem);
}
