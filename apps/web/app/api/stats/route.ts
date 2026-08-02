import type { StatsResponse } from '@dsa-tracker/shared';
import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { loadStats } from '@/lib/dashboard-stats';
import { requireApiUser, unauthorizedApiResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const userId = await requireApiUser(request);
  if (!userId) return unauthorizedApiResponse();
  try {
    // The serverless client deliberately has max: 1. `loadStats` is a single
    // statement, so there is no fan-out for transaction-mode Supavisor to
    // stall — and one round trip instead of the five sequential reads this
    // route used to issue. The response shape is unchanged.
    const body: StatsResponse = await loadStats(userId, 10);
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  } catch (error) {
    return apiErrorResponse('GET /api/stats', error);
  }
}
