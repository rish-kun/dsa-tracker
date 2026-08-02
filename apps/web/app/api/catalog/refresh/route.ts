import { NextRequest, NextResponse } from 'next/server';
import { refreshCatalog } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.CATALOG_REFRESH_SECRET;
  if (!secret || request.headers.get('x-catalog-refresh-secret') !== secret) {
    return NextResponse.json({ error: 'catalog refresh is not authorized' }, { status: 401 });
  }
  const count = await refreshCatalog();
  return NextResponse.json({ refreshed: count });
}
