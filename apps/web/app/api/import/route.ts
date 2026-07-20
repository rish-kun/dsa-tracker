import type { ImportRequest, ImportResponse } from '@dsa-tracker/shared';
import { inArray, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, problems, solvedProblems, solveEvents } from '@/db';
import { getTotals, reconcileNeetcodeAlias } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Import completed-problem ids collected from NeetCode. Ids come in two
 * namespaces: practice-list problems use real LeetCode titleSlugs, while
 * in-site editor problems use NeetCode's own slugs (`duplicate-integer`,
 * `dynamicArray`, …). Resolution per id:
 *   1. exact catalog slug match            -> lc:<id>
 *   2. NeetCode metadata name -> title match -> lc:<catalog slug>
 *   3. otherwise                            -> nc:<id> (separate counter)
 */

type ProblemRow = typeof problems.$inferSelect;

const NC_META_URL = 'https://neetcode.io/api/getProblemMetadataFunctionHttp';
const META_CONCURRENCY = 6;

async function fetchNcName(id: string): Promise<string | null> {
  try {
    const res = await fetch(NC_META_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { problemId: id } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { name?: string } };
    return typeof json?.data?.name === 'string' ? json.data.name : null;
  } catch {
    return null;
  }
}

/** Fetch NeetCode display names for ids, a few at a time. */
async function fetchNcNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += META_CONCURRENCY) {
    const chunk = ids.slice(i, i + META_CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => fetchNcName(id)));
    chunk.forEach((id, j) => {
      const name = results[j];
      if (name) names.set(id, name);
    });
  }
  return names;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'import failed';
    console.error('[api/import]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handle(request: NextRequest) {
  const body = (await request.json()) as ImportRequest;
  if (!Array.isArray(body?.ids)) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }
  const ids = [
    ...new Set(
      body.ids.filter(
        (s): s is string => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(s),
      ),
    ),
  ];

  // 1. Ids that are already LeetCode titleSlugs.
  const direct = new Map<string, ProblemRow>();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await db
      .select()
      .from(problems)
      .where(inArray(problems.lcSlug, ids.slice(i, i + CHUNK)));
    for (const row of rows) direct.set(row.lcSlug, row);
  }

  // 2. For the rest, resolve via NeetCode display name -> catalog title.
  const unknownIds = ids.filter((id) => !direct.has(id));
  const ncNames = await fetchNcNames(unknownIds);
  const byTitle = new Map<string, ProblemRow>();
  const normalizedNames = [...new Set([...ncNames.values()].map(normalizeTitle))].filter(Boolean);
  if (normalizedNames.length > 0) {
    for (let i = 0; i < normalizedNames.length; i += CHUNK) {
      const chunk = normalizedNames.slice(i, i + CHUNK);
      const rows = await db
        .select()
        .from(problems)
        .where(
          inArray(
            sql<string>`regexp_replace(lower(${problems.title}), '[^a-z0-9]', '', 'g')`,
            chunk,
          ),
        );
      for (const row of rows) byTitle.set(normalizeTitle(row.title), row);
    }
  }

  const unmapped: string[] = [];
  const aliasTargets = new Map<string, ProblemRow>();
  const values = ids.map((id) => {
    const row = direct.get(id) ?? byTitle.get(normalizeTitle(ncNames.get(id) ?? ''));
    if (row) {
      aliasTargets.set(`nc:${id}`, row);
      return {
        canonicalKey: `lc:${row.lcSlug}`,
        lcSlug: row.lcSlug,
        title: `${row.lcNumber}. ${row.title}`,
        difficulty: row.difficulty,
        firstSource: 'neetcode',
      };
    }
    unmapped.push(id);
    return {
      canonicalKey: `nc:${id}`,
      lcSlug: null,
      title: ncNames.get(id) ?? id,
      difficulty: null,
      firstSource: 'neetcode',
    };
  });

  // Distinct ids can resolve to the same lc: key — dedupe before insert.
  const byKey = new Map(values.map((v) => [v.canonicalKey, v]));
  const rows = [...byKey.values()];

  // Reconcile only aliases that actually exist; normal imports stay batched.
  const aliasKeys = [...aliasTargets.keys()];
  for (let i = 0; i < aliasKeys.length; i += CHUNK) {
    const existingAliases = await db
      .select({ key: solvedProblems.canonicalKey })
      .from(solvedProblems)
      .where(inArray(solvedProblems.canonicalKey, aliasKeys.slice(i, i + CHUNK)));
    for (const { key } of existingAliases) {
      const target = aliasTargets.get(key);
      if (target) await reconcileNeetcodeAlias(key, target);
    }
  }

  let imported = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const inserted = await db
      .insert(solvedProblems)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ key: solvedProblems.canonicalKey });
    imported += inserted.length;
    if (inserted.length > 0) {
      await db.insert(solveEvents).values(
        inserted.map((r) => ({
          canonicalKey: r.key,
          source: 'neetcode',
          url: null,
          detected: 'backfill',
        })),
      );
    }
  }

  const totals = await getTotals();
  const res: ImportResponse = {
    imported,
    skipped: rows.length - imported,
    unmapped,
    totals,
  };
  return NextResponse.json(res);
}
