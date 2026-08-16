import type { Difficulty, NextUp } from '@dsa-tracker/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { db, solvedProblems, userTracks, type TrackItem } from '@/db';
import { lcUrl } from '@/lib/format';
import {
  findProblemsBySlugPrefix,
  findProblemsBySlugsOrTitles,
  normalizeTitle,
} from '@/lib/queries';

/**
 * The user's track ("work through this list in order") and the sequel-series
 * suggestion ("Next Greater Element I → II → III") are two standalone
 * features that share one delivery channel: `nextUp` on the /api/solve
 * response. When both have something to offer, the track wins — the sequel
 * suggestion only fires when the track has no unsolved item left to suggest.
 *
 * Reads never throw (a broken suggestion must never break /api/solve or the
 * /problems render); saveTrack deliberately does not catch, mirroring the
 * plan-state read/write split.
 */

export interface UserTrack {
  name: string;
  items: TrackItem[];
}

export type SaveTrackResult = { ok: true } | { ok: false; unknown: string[] };

/** LeetCode sequel slugs use lowercase roman numerals; I..XX covers every
 * real series (most stop at IV). Whole-segment matches only, so "read4" or
 * "-with-cooldown" cousins never group. */
const ROMAN_SEGMENTS = new Set([
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
]);
// Longest-first so the anchored alternation is deterministic; the `$` forces
// a full-segment match either way.
const TRAILING_ROMAN_RE = new RegExp(
  `-(${[...ROMAN_SEGMENTS].sort((a, b) => b.length - a.length).join('|')})$`,
);

export async function getTrack(userId: string): Promise<UserTrack | null> {
  try {
    const [row] = await db
      .select({ name: userTracks.name, items: userTracks.items })
      .from(userTracks)
      .where(eq(userTracks.userId, userId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error('getTrack failed, rendering no track', err);
    return null;
  }
}

/** One pasted line → a slug or title candidate. null for blank lines. */
function parseTrackLine(raw: string): { slug?: string; title?: string } | null {
  const line = raw.trim();
  if (!line) return null;
  const urlMatch = line.match(/leetcode\.com\/problems\/([a-z0-9-]+)/i);
  if (urlMatch) return { slug: urlMatch[1].toLowerCase() };
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(line)) return { slug: line };
  return { title: line };
}

/**
 * Parse + resolve + validate a pasted list and upsert the user's single track
 * row. Each line may be a leetcode.com problem URL, a titleSlug, or a display
 * title (leading "123. " numbering is stripped by normalization). Lines that
 * resolve to nothing are reported back and never saved; duplicates collapse
 * to their first occurrence.
 */
export async function saveTrack(
  userId: string,
  name: string,
  text: string,
): Promise<SaveTrackResult> {
  const inputs: { line: string; slug?: string; title?: string }[] = [];
  for (const raw of text.split('\n')) {
    const parsed = parseTrackLine(raw);
    if (parsed) inputs.push({ line: raw.trim(), ...parsed });
  }

  const rows = await findProblemsBySlugsOrTitles(inputs);
  const bySlug = new Map(rows.map((row) => [row.lcSlug, row]));
  const byNormalizedTitle = new Map(rows.map((row) => [normalizeTitle(row.title), row]));

  const items: TrackItem[] = [];
  const unknown: string[] = [];
  for (const input of inputs) {
    const row = input.slug
      ? bySlug.get(input.slug)
      : byNormalizedTitle.get(normalizeTitle(input.title ?? ''));
    if (!row) {
      unknown.push(input.line);
      continue;
    }
    if (items.some((item) => item.slug === row.lcSlug)) continue;
    items.push({
      slug: row.lcSlug,
      title: row.title,
      number: row.lcNumber,
      difficulty: row.difficulty as Difficulty,
      paidOnly: row.paidOnly,
    });
  }

  if (unknown.length > 0 || items.length === 0) return { ok: false, unknown };

  const cleanName = (name.trim() || 'My track').slice(0, 80);
  await db
    .insert(userTracks)
    .values({ userId, name: cleanName, items })
    .onConflictDoUpdate({
      target: userTracks.userId,
      set: { name: cleanName, items, updatedAt: new Date() },
    });
  return { ok: true };
}

/** The list as the editor's textarea text — "123. Title" re-parses losslessly. */
export function trackToText(items: TrackItem[]): string {
  return items.map((item) => `${item.number}. ${item.title}`).join('\n');
}

/**
 * The suggestion shown on the post-solve banner. Track first (whenever the
 * track has any unsolved item, regardless of what was just solved — the track
 * is the primary marching order), sequel only as the fallback.
 */
export async function computeNextUp(userId: string, solvedKey: string): Promise<NextUp | null> {
  try {
    const track = await nextTrackItem(userId);
    if (track) return track;
    return solvedKey.startsWith('lc:') ? await nextSequelPart(userId, solvedKey.slice(3)) : null;
  } catch (err) {
    console.error('computeNextUp failed, suppressing suggestion', err);
    return null;
  }
}

async function solvedKeysAmong(userId: string, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await db
    .select({ canonicalKey: solvedProblems.canonicalKey })
    .from(solvedProblems)
    .where(and(eq(solvedProblems.userId, userId), inArray(solvedProblems.canonicalKey, keys)));
  return new Set(rows.map((row) => row.canonicalKey));
}

async function nextTrackItem(userId: string): Promise<NextUp | null> {
  const track = await getTrack(userId);
  if (!track || track.items.length === 0) return null;
  const solved = await solvedKeysAmong(userId, track.items.map((item) => `lc:${item.slug}`));
  const remaining = track.items.filter((item) => !solved.has(`lc:${item.slug}`));
  if (remaining.length === 0) return null;
  const next = remaining[0];
  return {
    kind: 'track',
    title: `${next.number}. ${next.title}`,
    url: lcUrl(next.slug),
    remaining: remaining.length,
  };
}

/** `next-greater-element-ii` → base `next-greater-element`; a bare first part
 * like `two-sum` is its own base. */
function seriesBase(slug: string): string {
  return slug.replace(TRAILING_ROMAN_RE, '');
}

function isSeriesMember(base: string, slug: string): boolean {
  if (slug === base) return true;
  if (!slug.startsWith(`${base}-`)) return false;
  return ROMAN_SEGMENTS.has(slug.slice(base.length + 1).split('-')[0]);
}

async function nextSequelPart(userId: string, slug: string): Promise<NextUp | null> {
  const base = seriesBase(slug);
  const members = (await findProblemsBySlugPrefix(base)).filter((row) =>
    isSeriesMember(base, row.lcSlug),
  );
  if (members.length < 2) return null;

  const index = members.findIndex((row) => row.lcSlug === slug);
  if (index === -1 || index === members.length - 1) return null;

  const later = members.slice(index + 1);
  const solved = await solvedKeysAmong(userId, later.map((row) => `lc:${row.lcSlug}`));
  const next = later.find((row) => !solved.has(`lc:${row.lcSlug}`));
  if (!next) return null;
  return {
    kind: 'sequel',
    title: `${next.lcNumber}. ${next.title}`,
    url: lcUrl(next.lcSlug),
  };
}
