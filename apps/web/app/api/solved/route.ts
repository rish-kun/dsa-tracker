import type { SolvedListResponse } from '@dsa-tracker/shared';
import { NextResponse } from 'next/server';
import { getAllSolved, getTotals } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [solved, totals] = await Promise.all([getAllSolved(), getTotals()]);
  const body: SolvedListResponse = {
    keys: solved.map((s) => s.canonicalKey),
    solved,
    totals,
  };
  return NextResponse.json(body);
}
