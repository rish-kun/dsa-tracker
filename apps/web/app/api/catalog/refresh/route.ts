import { NextResponse } from 'next/server';
import { refreshCatalog } from '@/lib/catalog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const count = await refreshCatalog();
  return NextResponse.json({ refreshed: count });
}
