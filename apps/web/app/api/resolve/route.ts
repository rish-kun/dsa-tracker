import type { Problem, ResolveResponse } from '@dsa-tracker/shared';
import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, problems } from '@/db';

export const dynamic = 'force-dynamic';

type ProblemRow = typeof problems.$inferSelect;

function toProblem(row: ProblemRow): Problem {
  return {
    lcSlug: row.lcSlug,
    lcNumber: row.lcNumber,
    title: row.title,
    difficulty: row.difficulty as Problem['difficulty'],
    paidOnly: row.paidOnly,
  };
}

/** Resolve a LeetCode problem by exact slug, or fall back to normalized title. */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  const title = request.nextUrl.searchParams.get('title');

  let row: ProblemRow | undefined;
  if (slug) {
    [row] = await db.select().from(problems).where(eq(problems.lcSlug, slug)).limit(1);
  }
  if (!row && title) {
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized) {
      [row] = await db
        .select()
        .from(problems)
        .where(
          sql`regexp_replace(lower(${problems.title}), '[^a-z0-9]', '', 'g') = ${normalized}`,
        )
        .limit(1);
    }
  }

  const body: ResolveResponse = { problem: row ? toProblem(row) : null };
  return NextResponse.json(body);
}
