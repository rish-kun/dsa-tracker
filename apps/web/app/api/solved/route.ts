import type { SolvedListResponse } from '@dsa-tracker/shared';
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { getAllSolved, getTotals } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const solved = await getAllSolved();
    const totals = await getTotals();
    const body: SolvedListResponse = {
      keys: solved.map((s) => s.canonicalKey),
      solved,
      totals,
    };
    return NextResponse.json(body);
  } catch (error) {
    return apiErrorResponse('GET /api/solved', error);
  }
}
