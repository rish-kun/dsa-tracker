import type { BackfillRequest, BackfillResponse } from '@dsa-tracker/shared';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, problems, solvedProblems, solveEvents } from '@/db';
import { getTotals } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'backfill failed';
    console.error('[api/backfill]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handle(request: NextRequest) {
  const body = (await request.json()) as BackfillRequest;
  if (!Array.isArray(body?.slugs)) {
    return NextResponse.json({ error: 'slugs array required' }, { status: 400 });
  }
  const slugs = [...new Set(body.slugs.filter((s) => typeof s === 'string' && s))];

  let imported = 0;
  const CHUNK = 200;
  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const known = await db
      .select()
      .from(problems)
      .where(inArray(problems.lcSlug, chunk));
    const knownBySlug = new Map(known.map((p) => [p.lcSlug, p]));

    const values = chunk.map((slug) => {
      const p = knownBySlug.get(slug);
      return {
        canonicalKey: `lc:${slug}`,
        lcSlug: p ? slug : null,
        title: p ? `${p.lcNumber}. ${p.title}` : slug,
        difficulty: p?.difficulty ?? null,
        firstSource: 'backfill',
      };
    });

    const inserted = await db
      .insert(solvedProblems)
      .values(values)
      .onConflictDoNothing()
      .returning({ key: solvedProblems.canonicalKey });
    imported += inserted.length;

    if (inserted.length > 0) {
      await db.insert(solveEvents).values(
        inserted.map((row) => ({
          canonicalKey: row.key,
          source: 'backfill',
          url: `https://leetcode.com/problems/${row.key.slice(3)}/`,
          detected: 'backfill',
        })),
      );
    }
  }

  // Repair links for rows imported by older extension versions, while
  // avoiding duplicate events on repeat syncs.
  const keys = slugs.map((slug) => `lc:${slug}`);
  const linkedKeys = new Set<string>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const linked = await db
      .select({ key: solveEvents.canonicalKey })
      .from(solveEvents)
      .where(
        and(
          inArray(solveEvents.canonicalKey, keys.slice(i, i + CHUNK)),
          isNotNull(solveEvents.url),
          eq(solveEvents.source, 'backfill'),
        ),
      );
    linked.forEach(({ key }) => linkedKeys.add(key));
  }
  const missingLinks = keys.filter((key) => !linkedKeys.has(key));
  for (let i = 0; i < missingLinks.length; i += CHUNK) {
    await db.insert(solveEvents).values(
      missingLinks.slice(i, i + CHUNK).map((key) => ({
        canonicalKey: key,
        source: 'backfill',
        url: `https://leetcode.com/problems/${key.slice(3)}/`,
        detected: 'backfill',
      })),
    );
  }

  const totals = await getTotals();
  const res: BackfillResponse = {
    imported,
    skipped: slugs.length - imported,
    totals,
  };
  return NextResponse.json(res);
}
