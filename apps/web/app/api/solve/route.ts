import type { SolveRequest, SolveResponse } from '@dsa-tracker/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getTotals, recordSolve } from '@/lib/queries';
import { requireApiUser, unauthorizedApiResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SOURCES = new Set(['leetcode', 'neetcode', 'tuf', 'gfg', 'backfill']);
const DETECTED = new Set(['auto', 'manual', 'backfill']);
// nc: allows camelCase — NeetCode's own ids (e.g. `dynamicArray`) are not slugs.
const KEY_RE = /^(lc|tuf|gfg):[a-z0-9][a-z0-9-]*$|^nc:[A-Za-z0-9][A-Za-z0-9-]*$/;

export async function POST(request: NextRequest) {
  const userId = await requireApiUser(request);
  if (!userId) return unauthorizedApiResponse();
  const body = (await request.json()) as SolveRequest;
  if (
    !body?.canonicalKey ||
    !KEY_RE.test(body.canonicalKey) ||
    !SOURCES.has(body.source) ||
    !DETECTED.has(body.detected) ||
    typeof body.title !== 'string'
  ) {
    return NextResponse.json({ error: 'invalid solve request' }, { status: 400 });
  }

  const { isNew, entry, alreadySolved } = await recordSolve(userId, body);
  const totals = await getTotals(userId);
  const res: SolveResponse = { isNew, entry, alreadySolved, totals };
  return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
}
