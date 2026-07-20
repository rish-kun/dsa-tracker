import type {
  Difficulty,
  SolveRequest,
  SolvedProblem,
  Totals,
} from '@dsa-tracker/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { db, problems, solvedProblems, solveEvents } from '@/db';

type SolvedRow = typeof solvedProblems.$inferSelect;
type ProblemRow = typeof problems.$inferSelect;
type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

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
  const [totals] = await db
    .select({
      lcUnique: sql<number>`count(*) filter (
        where ${solvedProblems.canonicalKey} like 'lc:%'
      )::int`,
      other: sql<number>`count(*) filter (
        where ${solvedProblems.canonicalKey} not like 'lc:%'
      )::int`,
    })
    .from(solvedProblems);
  return totals ?? { lcUnique: 0, other: 0 };
}

export async function getSolved(key: string): Promise<SolvedProblem | null> {
  const rows = await db
    .select()
    .from(solvedProblems)
    .where(eq(solvedProblems.canonicalKey, key))
    .limit(1);
  return rows[0] ? toSolvedProblem(rows[0]) : null;
}

function normalizeTitle(title: string): string {
  return title
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Resolve a possible LeetCode identity from a slug and/or display title. */
export async function resolveCatalogProblem(
  slug?: string,
  title?: string,
): Promise<ProblemRow | null> {
  if (slug) {
    const [row] = await db
      .select()
      .from(problems)
      .where(eq(problems.lcSlug, slug))
      .limit(1);
    if (row) return row;
  }

  const normalized = normalizeTitle(title ?? '');
  if (!normalized) return null;
  const [row] = await db
    .select()
    .from(problems)
    .where(
      sql`regexp_replace(lower(${problems.title}), '[^a-z0-9]', '', 'g') = ${normalized}`,
    )
    .limit(1);
  return row ?? null;
}

function canonicalValues(problem: ProblemRow) {
  return {
    canonicalKey: `lc:${problem.lcSlug}`,
    lcSlug: problem.lcSlug,
    title: `${problem.lcNumber}. ${problem.title}`,
    difficulty: problem.difficulty,
  };
}

/**
 * Merge an obsolete nc: row into its authoritative lc: row. Existing audit
 * events are retargeted and the earliest first-solve metadata is preserved.
 */
async function reconcileAlias(
  executor: DbExecutor,
  aliasKey: string,
  problem: ProblemRow,
): Promise<boolean> {
  const canonical = canonicalValues(problem);
  if (aliasKey === canonical.canonicalKey) return false;

  const [alias] = await executor
    .select()
    .from(solvedProblems)
    .where(eq(solvedProblems.canonicalKey, aliasKey))
    .limit(1);
  if (!alias) return false;

  const [existing] = await executor
    .select()
    .from(solvedProblems)
    .where(eq(solvedProblems.canonicalKey, canonical.canonicalKey))
    .limit(1);

  if (!existing) {
    await executor.insert(solvedProblems).values({
      ...canonical,
      firstSource: alias.firstSource,
      firstSolvedAt: alias.firstSolvedAt,
    });
  } else {
    const aliasIsEarlier = alias.firstSolvedAt < existing.firstSolvedAt;
    await executor
      .update(solvedProblems)
      .set({
        lcSlug: canonical.lcSlug,
        title: canonical.title,
        difficulty: canonical.difficulty,
        firstSource: aliasIsEarlier ? alias.firstSource : existing.firstSource,
        firstSolvedAt: aliasIsEarlier ? alias.firstSolvedAt : existing.firstSolvedAt,
      })
      .where(eq(solvedProblems.canonicalKey, canonical.canonicalKey));
  }

  await executor
    .update(solveEvents)
    .set({ canonicalKey: canonical.canonicalKey })
    .where(eq(solveEvents.canonicalKey, aliasKey));
  await executor.delete(solvedProblems).where(eq(solvedProblems.canonicalKey, aliasKey));
  return true;
}

export async function reconcileNeetcodeAlias(
  aliasKey: string,
  problem: ProblemRow,
): Promise<boolean> {
  return db.transaction((tx) => reconcileAlias(tx as DbExecutor, aliasKey, problem));
}

/**
 * Records a solve. Upserts into solved_problems (no-op when already solved)
 * and always logs a solve_event. Returns whether the problem was new.
 */
export async function recordSolve(req: SolveRequest): Promise<{
  isNew: boolean;
  entry: SolvedProblem;
  alreadySolved: SolvedProblem | null;
}> {
  let canonicalKey = req.canonicalKey;
  let { title, lcSlug } = req;
  let difficulty: string | null = null;
  let resolvedProblem: ProblemRow | null = null;

  // The server, not the extension, owns NeetCode canonicalization. A queued
  // nc: solve is upgraded here once the API/catalog is reachable again.
  if (req.source === 'neetcode' && canonicalKey.startsWith('nc:')) {
    const ncId = canonicalKey.slice(3);
    resolvedProblem = await resolveCatalogProblem(lcSlug ?? ncId, title);
    if (resolvedProblem) {
      canonicalKey = `lc:${resolvedProblem.lcSlug}`;
      lcSlug = resolvedProblem.lcSlug;
      title = `${resolvedProblem.lcNumber}. ${resolvedProblem.title}`;
      difficulty = resolvedProblem.difficulty;
    }
  }

  // Enrich from the catalog when we have a LeetCode slug.
  if (lcSlug && !resolvedProblem) {
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

  return db.transaction(async (tx) => {
    const mergedAlias = resolvedProblem
      ? await reconcileAlias(tx as DbExecutor, req.canonicalKey, resolvedProblem)
      : false;

    const inserted = await tx
      .insert(solvedProblems)
      .values({
        canonicalKey,
        lcSlug: lcSlug ?? null,
        title,
        difficulty,
        firstSource: req.source,
      })
      .onConflictDoNothing()
      .returning();

    await tx.insert(solveEvents).values({
      canonicalKey,
      source: req.source,
      url: req.url,
      detected: req.detected,
    });

    const [row] = inserted.length
      ? inserted
      : await tx
          .select()
          .from(solvedProblems)
          .where(eq(solvedProblems.canonicalKey, canonicalKey))
          .limit(1);
    if (!row) throw new Error(`failed to record ${canonicalKey}`);

    const entry = toSolvedProblem(row);
    const isNew = inserted.length > 0 && !mergedAlias;
    return {
      isNew,
      entry,
      alreadySolved: isNew ? null : entry,
    };
  });
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
