import type { SolvedListResponse } from '@dsa-tracker/shared';
import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { getAllSolved, getTotals } from '@/lib/queries';
import { requireApiUser, unauthorizedApiResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await requireApiUser(request);
  if (!userId) return unauthorizedApiResponse();
  try {
    const solved = await getAllSolved(userId);
    const totals = await getTotals(userId);
    const body: SolvedListResponse = {
      keys: solved.map((s) => s.canonicalKey),
      solved,
      totals,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  } catch (error) {
    return apiErrorResponse('GET /api/solved', error);
  }
}
