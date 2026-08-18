import type { ProblemTimeResponse, TimeRequest, TimeResponse } from '@dsa-tracker/shared';
import { trackerDateKey } from '@dsa-tracker/shared';
import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/api-error';
import { requireApiUser, unauthorizedApiResponse } from '@/lib/auth';
import { getDayTotal, getProblemTotal, recordTime } from '@/lib/time-tracking';

export const dynamic = 'force-dynamic';

const CANONICAL_KEY_RE = /^(lc|tuf|gfg):[a-z0-9][a-z0-9-]*$|^nc:[A-Za-z0-9][A-Za-z0-9-]*$/;

/** All-time active duration for one canonical problem. */
export async function GET(request: NextRequest) {
  const userId = await requireApiUser(request);
  if (!userId) return unauthorizedApiResponse();

  const canonicalKey = request.nextUrl.searchParams.get('canonicalKey')?.trim() ?? '';
  if (!CANONICAL_KEY_RE.test(canonicalKey)) {
    return NextResponse.json(
      { error: 'A valid canonicalKey query parameter is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } },
    );
  }

  try {
    const totalSeconds = await getProblemTotal(userId, canonicalKey);
    const res: ProblemTimeResponse = { canonicalKey, totalSeconds };
    return NextResponse.json(res, {
      headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' },
    });
  } catch (error) {
    return apiErrorResponse('GET /api/time', error);
  }
}

/**
 * Active-tab time reported by the extension's activity content script.
 *
 * Segments are increments, not totals — see `recordTime`. Validation lives
 * entirely in `normalizeSegments`, which drops malformed entries rather than
 * failing the batch: one bad segment must not cost the user a whole flush's
 * worth of real practice time.
 */
export async function POST(request: NextRequest) {
  const userId = await requireApiUser(request);
  if (!userId) return unauthorizedApiResponse();

  let body: TimeRequest;
  try {
    body = (await request.json()) as TimeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body?.segments)) {
    return NextResponse.json({ error: 'segments must be an array' }, { status: 400 });
  }

  try {
    const applied = await recordTime(userId, body.segments);
    const todaySeconds = await getDayTotal(userId, trackerDateKey());
    const res: TimeResponse = { applied, todaySeconds };
    return NextResponse.json(res, {
      headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' },
    });
  } catch (error) {
    return apiErrorResponse('POST /api/time', error);
  }
}
