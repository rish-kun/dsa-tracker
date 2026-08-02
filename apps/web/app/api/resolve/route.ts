import type { Problem, ResolveResponse } from '@dsa-tracker/shared';
import { NextRequest, NextResponse } from 'next/server';
import { problems } from '@/db';
import { resolveCatalogProblem } from '@/lib/queries';
import { requireApiUser, unauthorizedApiResponse } from '@/lib/auth';

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
  if (!(await requireApiUser(request))) return unauthorizedApiResponse();
  const slug = request.nextUrl.searchParams.get('slug');
  const title = request.nextUrl.searchParams.get('title');

  try {
    const row = await resolveCatalogProblem(slug ?? undefined, title ?? undefined);
    const body: ResolveResponse = { problem: row ? toProblem(row) : null };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  } catch (error) {
    // A resolver outage is not a legitimate catalog miss. Returning a typed
    // response lets adapters retain the current page rather than inventing a
    // site-only key that later has to be reconciled.
    console.error('[api/resolve]', error);
    const body: ResolveResponse = { problem: null, unavailable: true };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  }
}
