import type { Problem, ResolveResponse } from '@dsa-tracker/shared';
import { NextRequest, NextResponse } from 'next/server';
import { problems } from '@/db';
import { resolveCatalogProblem } from '@/lib/queries';

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

  const row = await resolveCatalogProblem(slug ?? undefined, title ?? undefined);

  const body: ResolveResponse = { problem: row ? toProblem(row) : null };
  return NextResponse.json(body);
}
