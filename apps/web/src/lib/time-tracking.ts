import type { DailyTime, ProblemTimeContext, TimeSegment, TimeSite } from '@dsa-tracker/shared';
import { TIME_SITES, trackerDateKey } from '@dsa-tracker/shared';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, timeDaily, timeProblemDaily } from '@/db';

/**
 * Active-tab time on the practice sites, bucketed per tracker day and site.
 *
 * The extension measures the time (it is the only thing that can see tab focus
 * and visibility) and posts **increments**; this module is the only writer.
 * Same read/write split as plan-state.ts: reads never throw, so a dashboard
 * still renders against an unreachable or un-migrated DB, while writes
 * propagate so a failed POST /api/time surfaces as a 5xx and the extension
 * retries instead of silently losing the batch.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CANONICAL_KEY_RE = /^(lc|tuf|gfg):[a-z0-9][a-z0-9-]*$|^nc:[A-Za-z0-9][A-Za-z0-9-]*$/;
const MAX_TITLE_LENGTH = 300;
const MAX_URL_LENGTH = 2_048;

/** A single reported segment can never legitimately exceed one flush interval
 * by much; 6h is far above that and still far below a day, so a buggy or
 * hostile client cannot inflate a day into implausibility in one call. */
const MAX_SEGMENT_SECONDS = 6 * 60 * 60;

/** One request carries at most a handful of (day, site) pairs; the cap only
 * exists so a malformed body cannot turn into an unbounded statement. */
const MAX_SEGMENTS = 200;

/** How far back a client may post. Beyond this the batch is stale enough that
 * it is more likely a clock problem than real practice time. */
const MAX_BACKDATE_DAYS = 14;

function isTimeSite(value: string): value is TimeSite {
  return (TIME_SITES as string[]).includes(value);
}

function dayKeyOffset(days: number): string {
  return trackerDateKey(new Date(Date.now() + days * 86_400_000));
}

function isSafeProblemUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Drop anything malformed and merge duplicates. Merging is not optional:
 * Postgres rejects an ON CONFLICT DO UPDATE whose VALUES list hits the same
 * primary key twice ("cannot affect row a second time"), and a batch can
 * legitimately contain two segments for the same day and site.
 */
interface ProblemIncrement extends ProblemTimeContext {
  date: string;
  source: TimeSite;
  seconds: number;
}

function normalizeSegments(segments: TimeSegment[]): {
  siteRows: TimeSegment[];
  problemRows: ProblemIncrement[];
} {
  const oldest = dayKeyOffset(-MAX_BACKDATE_DAYS);
  // Tomorrow, not today: a client a few hours ahead of TRACKER_TZ is normal.
  const newest = dayKeyOffset(1);
  const sites = new Map<string, TimeSegment>();
  const problems = new Map<string, ProblemIncrement>();

  for (const raw of segments.slice(0, MAX_SEGMENTS)) {
    const segment = raw;
    const { date, site } = segment ?? {};
    const seconds = Math.floor(Number(segment?.seconds));
    if (typeof date !== 'string' || !DATE_RE.test(date)) continue;
    if (date < oldest || date > newest) continue;
    if (typeof site !== 'string' || !isTimeSite(site)) continue;
    if (!Number.isFinite(seconds) || seconds <= 0) continue;

    const key = `${date}|${site}`;
    const existing = sites.get(key);
    const total = Math.min((existing?.seconds ?? 0) + seconds, MAX_SEGMENT_SECONDS);
    sites.set(key, { date, site, seconds: total });

    // Problem context is optional because site-wide time also includes lists
    // and editorials. Invalid context must not discard the valid site total.
    const canonicalKey = segment.problem?.canonicalKey?.trim();
    const title = segment.problem?.title?.trim();
    const url = segment.problem?.url?.trim();
    if (
      !canonicalKey ||
      !CANONICAL_KEY_RE.test(canonicalKey) ||
      !title ||
      title.length > MAX_TITLE_LENGTH ||
      !url ||
      url.length > MAX_URL_LENGTH ||
      !isSafeProblemUrl(url)
    ) continue;

    const problemKey = `${date}|${canonicalKey}`;
    const prior = problems.get(problemKey);
    problems.set(problemKey, {
      date,
      canonicalKey,
      title,
      url,
      source: site,
      seconds: Math.min((prior?.seconds ?? 0) + seconds, MAX_SEGMENT_SECONDS),
    });
  }

  return { siteRows: [...sites.values()], problemRows: [...problems.values()] };
}

/**
 * Add active seconds to the running per-day totals. Increments rather than
 * absolute values, so the extension never has to know the server's total and
 * two devices practising on the same account simply add up.
 */
export async function recordTime(userId: string, segments: TimeSegment[]): Promise<number> {
  const { siteRows, problemRows } = normalizeSegments(segments);
  if (siteRows.length === 0) return 0;

  await db.transaction(async (tx) => {
    await tx
      .insert(timeDaily)
      .values(siteRows.map((row) => ({ userId, date: row.date, site: row.site, seconds: row.seconds })))
      .onConflictDoUpdate({
        target: [timeDaily.userId, timeDaily.date, timeDaily.site],
        set: {
          seconds: sql`${timeDaily.seconds} + excluded.seconds`,
          updatedAt: new Date(),
        },
      });

    if (problemRows.length > 0) {
      await tx
        .insert(timeProblemDaily)
        .values(problemRows.map((row) => ({ userId, ...row })))
        .onConflictDoUpdate({
          target: [timeProblemDaily.userId, timeProblemDaily.date, timeProblemDaily.canonicalKey],
          set: {
            title: sql`excluded.title`,
            source: sql`excluded.source`,
            url: sql`excluded.url`,
            seconds: sql`${timeProblemDaily.seconds} + excluded.seconds`,
            updatedAt: new Date(),
          },
        });
    }
  });

  return siteRows.length;
}

export interface ProblemTimeSummary {
  canonicalKey: string;
  title: string;
  source: TimeSite;
  url: string | null;
  todaySeconds: number;
  totalSeconds: number;
  lastActiveAt: string;
}

/** Total active seconds recorded for a problem across all tracker days. */
export async function getProblemTotal(userId: string, canonicalKey: string): Promise<number> {
  try {
    const [row] = await db
      .select({ seconds: sql<number>`coalesce(sum(${timeProblemDaily.seconds}), 0)::int` })
      .from(timeProblemDaily)
      .where(and(
        eq(timeProblemDaily.userId, userId),
        eq(timeProblemDaily.canonicalKey, canonicalKey),
      ));
    return Number(row?.seconds ?? 0);
  } catch (err) {
    console.error('getProblemTotal failed, reporting 0', err);
    return 0;
  }
}

/** Latest display metadata plus today/all-time totals for every timed problem. */
export async function getProblemTimeSummaries(
  userId: string,
  date = trackerDateKey(),
): Promise<ProblemTimeSummary[]> {
  try {
    const rows = await db
      .select({
        canonicalKey: timeProblemDaily.canonicalKey,
        title: sql<string>`(array_agg(${timeProblemDaily.title} order by ${timeProblemDaily.updatedAt} desc))[1]`,
        source: sql<TimeSite>`(array_agg(${timeProblemDaily.source} order by ${timeProblemDaily.updatedAt} desc))[1]`,
        url: sql<string | null>`(array_agg(${timeProblemDaily.url} order by ${timeProblemDaily.updatedAt} desc))[1]`,
        todaySeconds: sql<number>`coalesce(sum(${timeProblemDaily.seconds}) filter (where ${timeProblemDaily.date} = ${date}), 0)::int`,
        totalSeconds: sql<number>`coalesce(sum(${timeProblemDaily.seconds}), 0)::int`,
        lastActiveAt: sql<Date>`max(${timeProblemDaily.updatedAt})`,
      })
      .from(timeProblemDaily)
      .where(eq(timeProblemDaily.userId, userId))
      .groupBy(timeProblemDaily.canonicalKey)
      .orderBy(sql`max(${timeProblemDaily.updatedAt}) desc`);

    return rows.map((row) => ({
      ...row,
      todaySeconds: Number(row.todaySeconds),
      totalSeconds: Number(row.totalSeconds),
      lastActiveAt: row.lastActiveAt.toISOString(),
    }));
  } catch (err) {
    console.error('getProblemTimeSummaries failed, rendering an empty list', err);
    return [];
  }
}

/** Singular noun kept as the page-facing name for the summary collection. */
export const getProblemTimeSummary = getProblemTimeSummaries;

function emptyBySite(): Record<TimeSite, number> {
  return { leetcode: 0, neetcode: 0, tuf: 0, gfg: 0 };
}

/** Total active seconds for one tracker day. Never throws. */
export async function getDayTotal(userId: string, date = trackerDateKey()): Promise<number> {
  try {
    const rows = await db
      .select({ seconds: timeDaily.seconds })
      .from(timeDaily)
      .where(and(eq(timeDaily.userId, userId), eq(timeDaily.date, date)));
    return rows.reduce((sum, row) => sum + row.seconds, 0);
  } catch (err) {
    console.error('getDayTotal failed, reporting 0', err);
    return 0;
  }
}

/**
 * The trailing `days`-day window ending today, oldest first, with **every**
 * day present — zero-filled gaps are what let the dashboard chart render a
 * continuous axis without the component re-deriving dates. Never throws.
 */
export async function getDailyTime(userId: string, days = 14): Promise<DailyTime[]> {
  const window: DailyTime[] = [];
  const byDate = new Map<string, DailyTime>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const entry: DailyTime = { date: dayKeyOffset(-i), seconds: 0, bySite: emptyBySite() };
    window.push(entry);
    byDate.set(entry.date, entry);
  }

  try {
    const rows = await db
      .select({ date: timeDaily.date, site: timeDaily.site, seconds: timeDaily.seconds })
      .from(timeDaily)
      .where(and(eq(timeDaily.userId, userId), gte(timeDaily.date, window[0].date)));

    for (const row of rows) {
      const entry = byDate.get(row.date);
      // A row past the window's end (a client slightly ahead of TRACKER_TZ)
      // has no bucket; dropping it is correct, it belongs to a future day.
      if (!entry || !isTimeSite(row.site)) continue;
      entry.bySite[row.site] += row.seconds;
      entry.seconds += row.seconds;
    }
  } catch (err) {
    console.error('getDailyTime failed, rendering an empty window', err);
  }

  return window;
}

/** Re-exported so callers keep importing their time helpers from one module.
 * The implementation lives in the shared package because the extension popup
 * renders the same figure and the two must not drift. */
export { formatDuration } from '@dsa-tracker/shared';
