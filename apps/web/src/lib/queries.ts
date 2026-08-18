import type {
  Difficulty,
  SolveRequest,
  SolvedProblem,
  Totals,
} from '@dsa-tracker/shared';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { checkId } from '@dsa-tracker/plan-data';
import { db, planChecks, problems, solvedProblems, solveEvents, timeProblemDaily } from '@/db';

type SolvedRow = typeof solvedProblems.$inferSelect;
type ProblemRow = typeof problems.$inferSelect;
type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

export function toSolvedProblem(row: SolvedRow, sourceUrl: string | null = null): SolvedProblem {
  return {
    canonicalKey: row.canonicalKey,
    lcSlug: row.lcSlug,
    title: row.title,
    difficulty: (row.difficulty as Difficulty) ?? null,
    firstSource: row.firstSource as SolvedProblem['firstSource'],
    firstSolvedAt: row.firstSolvedAt.toISOString(),
    sourceUrl,
  };
}

/**
 * `sourceUrl` as a correlated subquery instead of a second round trip.
 *
 * Prefers the earliest URL logged by the source that first recorded the
 * problem, and falls back to the earliest URL from any source. Sorting on
 * `(ev.source = first_source) DESC` first reproduces exactly that preference:
 * booleans sort false < true, so `DESC` puts the first-source events ahead of
 * every other event, and `created_at, id` then picks the earliest within
 * whichever group won. When no first-source event carries a URL, every row
 * compares equal on the first key and the earliest overall URL wins.
 *
 * One statement for any number of rows — the previous implementation issued
 * ceil(rows / 500) extra queries against solve_events.
 *
 * The outer references are spelled out as `"solved_problems"."<col>"` on
 * purpose. Drizzle renders an interpolated column **unqualified** when it sits
 * in the select-field position, and `solve_events` has its own `canonical_key`:
 * a bare `canonical_key` would bind to the subquery's own table instead of the
 * outer row and silently match every event in the table.
 */
const sourceUrlSql = sql<string | null>`(
  select ev.url
  from ${solveEvents} ev
  where ev.canonical_key = "solved_problems"."canonical_key"
    and ev.user_id = "solved_problems"."user_id"
    and ev.url is not null
  order by (ev.source = "solved_problems"."first_source") desc,
           ev.created_at asc,
           ev.id asc
  limit 1
)`;

/** Every solved_problems column plus the derived sourceUrl, in one row shape. */
const solvedWithUrl = {
  canonicalKey: solvedProblems.canonicalKey,
  userId: solvedProblems.userId,
  lcSlug: solvedProblems.lcSlug,
  title: solvedProblems.title,
  difficulty: solvedProblems.difficulty,
  firstSource: solvedProblems.firstSource,
  firstSolvedAt: solvedProblems.firstSolvedAt,
  sourceUrl: sourceUrlSql,
};

export async function getTotals(userId: string): Promise<Totals> {
  const [totals] = await db
    .select({
      lcUnique: sql<number>`count(*) filter (
        where ${solvedProblems.canonicalKey} like 'lc:%'
      )::int`,
      other: sql<number>`count(*) filter (
        where ${solvedProblems.canonicalKey} not like 'lc:%'
      )::int`,
    })
    .from(solvedProblems)
    .where(eq(solvedProblems.userId, userId));
  return totals ?? { lcUnique: 0, other: 0 };
}

export async function getSolved(userId: string, key: string): Promise<SolvedProblem | null> {
  const [row] = await db
    .select(solvedWithUrl)
    .from(solvedProblems)
    .where(and(eq(solvedProblems.userId, userId), eq(solvedProblems.canonicalKey, key)))
    .limit(1);
  return row ? toSolvedProblem(row, row.sourceUrl) : null;
}

function normalizeTitle(title: string): string {
  return title
    .replace(/^\s*\d+\s*[.)]\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export { normalizeTitle };

/** Matches the expression index `problems_title_normalized_idx`. */
const normalizedTitleSql = sql`regexp_replace(lower(${problems.title}), '[^a-z0-9]', '', 'g')`;

/**
 * Resolve a possible LeetCode identity from a slug and/or display title.
 *
 * Slug and title are matched in a single OR'd statement rather than two
 * sequential queries: the ORDER BY reproduces the old short-circuit (an exact
 * `lc_slug` hit always outranks a title hit) while costing one round trip
 * instead of two on the common NeetCode path, where the site slug is not a
 * LeetCode titleSlug and the first query always missed.
 */
export async function resolveCatalogProblem(
  slug?: string,
  title?: string,
): Promise<ProblemRow | null> {
  const normalized = normalizeTitle(title ?? '');
  if (!slug && !normalized) return null;

  // `''` is not a valid titleSlug, so a missing slug can never match a row and
  // never reorders the title matches.
  const slugParam = slug ?? '';
  const match = or(
    ...(slug ? [eq(problems.lcSlug, slug)] : []),
    ...(normalized ? [sql`${normalizedTitleSql} = ${normalized}`] : []),
  );

  const [row] = await db
    .select()
    .from(problems)
    .where(match)
    .orderBy(sql`case when ${problems.lcSlug} = ${slugParam} then 0 else 1 end`)
    .limit(1);
  return row ?? null;
}

/**
 * Bulk resolve a mixed batch of slug/title candidates in a single OR'd
 * statement — the batch counterpart of resolveCatalogProblem, used by
 * saveTrack() to validate a pasted list with one round trip. Callers match
 * rows back to inputs via lcSlug equality or normalizeTitle comparison; an
 * input with no matching row is simply absent from the result.
 */
export async function findProblemsBySlugsOrTitles(
  inputs: { slug?: string; title?: string }[],
): Promise<ProblemRow[]> {
  const slugs = [...new Set(inputs.flatMap((i) => (i.slug ? [i.slug] : [])))];
  const titles = [...new Set(inputs.flatMap((i) => (i.title ? [normalizeTitle(i.title)] : [])))];
  const conditions = [
    ...(slugs.length ? [inArray(problems.lcSlug, slugs)] : []),
    ...(titles.length ? [inArray(normalizedTitleSql, titles)] : []),
  ];
  if (conditions.length === 0) return [];
  return db.select().from(problems).where(or(...conditions));
}

/**
 * Every catalog problem whose slug is `base` itself or starts with
 * `base-` — the candidate pool for sequel-series detection. The roman-numeral
 * filtering of those candidates lives in tracks.ts; this stays a dumb prefix
 * scan (the ~4k-row catalog makes an index unnecessary).
 */
export async function findProblemsBySlugPrefix(base: string): Promise<ProblemRow[]> {
  return db
    .select()
    .from(problems)
    .where(or(eq(problems.lcSlug, base), sql`${problems.lcSlug} like ${`${base}-%`}`))
    .orderBy(asc(problems.lcNumber));
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
  userId: string,
  aliasKey: string,
  problem: ProblemRow,
): Promise<boolean> {
  const canonical = canonicalValues(problem);
  if (aliasKey === canonical.canonicalKey) return false;

  // Timing begins before a solve, so an nc: alias may have accumulated rows
  // even when solved_problems has nothing to reconcile yet. Merge those rows
  // first and keep it inside the solve transaction with the identity upgrade.
  const aliasTime = await executor
    .select()
    .from(timeProblemDaily)
    .where(and(
      eq(timeProblemDaily.userId, userId),
      eq(timeProblemDaily.canonicalKey, aliasKey),
    ));
  if (aliasTime.length > 0) {
    await executor
      .insert(timeProblemDaily)
      .values(aliasTime.map((row) => ({
        ...row,
        canonicalKey: canonical.canonicalKey,
        title: canonical.title,
      })))
      .onConflictDoUpdate({
        target: [timeProblemDaily.userId, timeProblemDaily.date, timeProblemDaily.canonicalKey],
        set: {
          title: canonical.title,
          source: sql`case when excluded.updated_at > ${timeProblemDaily.updatedAt} then excluded.source else ${timeProblemDaily.source} end`,
          url: sql`case when excluded.updated_at > ${timeProblemDaily.updatedAt} then excluded.url else ${timeProblemDaily.url} end`,
          seconds: sql`${timeProblemDaily.seconds} + excluded.seconds`,
          updatedAt: sql`greatest(${timeProblemDaily.updatedAt}, excluded.updated_at)`,
        },
      });
    await executor.delete(timeProblemDaily).where(and(
      eq(timeProblemDaily.userId, userId),
      eq(timeProblemDaily.canonicalKey, aliasKey),
    ));
  }

  const [alias] = await executor
    .select()
    .from(solvedProblems)
    .where(and(eq(solvedProblems.userId, userId), eq(solvedProblems.canonicalKey, aliasKey)))
    .limit(1);
  if (!alias) return false;

  const [existing] = await executor
    .select()
    .from(solvedProblems)
    .where(and(eq(solvedProblems.userId, userId), eq(solvedProblems.canonicalKey, canonical.canonicalKey)))
    .limit(1);

  if (!existing) {
    await executor.insert(solvedProblems).values({
      userId,
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
      .where(and(eq(solvedProblems.userId, userId), eq(solvedProblems.canonicalKey, canonical.canonicalKey)));
  }

  await executor
    .update(solveEvents)
    .set({ canonicalKey: canonical.canonicalKey })
    .where(and(eq(solveEvents.userId, userId), eq(solveEvents.canonicalKey, aliasKey)));
  await executor.delete(solvedProblems).where(and(eq(solvedProblems.userId, userId), eq(solvedProblems.canonicalKey, aliasKey)));
  return true;
}

export async function reconcileNeetcodeAlias(
  userId: string,
  aliasKey: string,
  problem: ProblemRow,
): Promise<boolean> {
  return db.transaction((tx) => reconcileAlias(tx as DbExecutor, userId, aliasKey, problem));
}

/**
 * Records a solve. Upserts into solved_problems (no-op when already solved)
 * and always logs a solve_event. Returns whether the problem was new.
 */
export async function recordSolve(userId: string, req: SolveRequest): Promise<{
  isNew: boolean;
  entry: SolvedProblem;
  alreadySolved: SolvedProblem | null;
}> {
  let canonicalKey = req.canonicalKey;
  let { title, lcSlug } = req;
  let difficulty: string | null = null;
  let resolvedProblem: ProblemRow | null = null;

  // The server, not the extension, owns interview-site canonicalization. A
  // queued fallback key is upgraded once the catalog is reachable again. The
  // alias is scoped to this user below, so equal slugs across users never mix.
  const fallbackPrefix = req.source === 'neetcode'
    ? 'nc:'
    : req.source === 'tuf'
      ? 'tuf:'
      : req.source === 'gfg'
        ? 'gfg:'
        : null;
  if (fallbackPrefix && canonicalKey.startsWith(fallbackPrefix)) {
    const siteId = canonicalKey.slice(fallbackPrefix.length);
    resolvedProblem = await resolveCatalogProblem(lcSlug ?? siteId, title);
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
      ? await reconcileAlias(tx as DbExecutor, userId, req.canonicalKey, resolvedProblem)
      : false;

    const inserted = await tx
      .insert(solvedProblems)
      .values({
        userId,
        canonicalKey,
        lcSlug: lcSlug ?? null,
        title,
        difficulty,
        firstSource: req.source,
      })
      .onConflictDoNothing({ target: [solvedProblems.userId, solvedProblems.canonicalKey] })
      .returning({ canonicalKey: solvedProblems.canonicalKey });

    await tx.insert(solveEvents).values({
      userId,
      canonicalKey,
      source: req.source,
      url: req.url,
      detected: req.detected,
    });

    // A manual false override may intentionally hide an older derived solve,
    // but a fresh live solve should win. Match every dated plan occurrence of
    // the final server-authoritative key plus the CORE_SET and Google-revision
    // families; bulk history (backfill) must not clear overrides.
    //
    // All three families auto-tick in `deriveAutoSolved` (app/plan/page.tsx), so
    // all three must be cleared here — otherwise an untick in that family would
    // be permanently sticky while the same untick elsewhere is not.
    if (req.detected !== 'backfill') {
      await tx
        .delete(planChecks)
        .where(
          and(
            eq(planChecks.userId, userId),
            sql`${planChecks.done} = false`,
            or(
              sql`${planChecks.checkId} like ${`prob:%:${canonicalKey}`}`,
              eq(planChecks.checkId, checkId.coreKey(canonicalKey)),
              eq(planChecks.checkId, checkId.googleRevisionKey(canonicalKey)),
            ),
          ),
        );
    }

    // Authoritative row and its first-source URL in one statement. Previously
    // this was two reads (and three on a repeat solve, which also had to
    // re-select the conflicting row).
    const [row] = await tx
      .select({
        ...solvedWithUrl,
        // Deliberately stricter than the shared `sourceUrlSql`: /api/solve has
        // always reported null rather than borrowing another source's URL.
        // Outer columns are qualified for the same reason as `sourceUrlSql`.
        sourceUrl: sql<string | null>`(
          select ev.url
          from ${solveEvents} ev
          where ev.canonical_key = "solved_problems"."canonical_key"
            and ev.user_id = "solved_problems"."user_id"
            and ev.source = "solved_problems"."first_source"
            and ev.url is not null
          order by ev.created_at asc, ev.id asc
          limit 1
        )`,
      })
      .from(solvedProblems)
      .where(and(eq(solvedProblems.userId, userId), eq(solvedProblems.canonicalKey, canonicalKey)))
      .limit(1);
    if (!row) throw new Error(`failed to record ${canonicalKey}`);

    const entry = toSolvedProblem(row, row.sourceUrl);
    const isNew = inserted.length > 0 && !mergedAlias;
    return {
      isNew,
      entry,
      alreadySolved: isNew ? null : entry,
    };
  });
}

export async function getAllSolved(userId: string): Promise<SolvedProblem[]> {
  const rows = await db
    .select(solvedWithUrl)
    .from(solvedProblems)
    .where(eq(solvedProblems.userId, userId))
    .orderBy(desc(solvedProblems.firstSolvedAt));
  return rows.map((row) => toSolvedProblem(row, row.sourceUrl));
}

export async function getRecent(userId: string, limit: number): Promise<SolvedProblem[]> {
  const rows = await db
    .select(solvedWithUrl)
    .from(solvedProblems)
    .where(eq(solvedProblems.userId, userId))
    .orderBy(desc(solvedProblems.firstSolvedAt))
    .limit(limit);
  return rows.map((row) => toSolvedProblem(row, row.sourceUrl));
}
