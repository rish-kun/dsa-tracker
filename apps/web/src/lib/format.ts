import type { Difficulty, SolvedProblem, Source } from '@dsa-tracker/shared';

/** Parses a stored title like "146. LRU Cache" into its LC number + rest. */
export function parseTitle(row: Pick<SolvedProblem, 'title' | 'lcSlug'>): {
  number: number | null;
  title: string;
} {
  const match = /^(\d+)\.\s+(.*)$/.exec(row.title);
  if (match && row.lcSlug) {
    return { number: Number(match[1]), title: match[2] };
  }
  return { number: null, title: row.title };
}

export function lcUrl(slug: string): string {
  return `https://leetcode.com/problems/${slug}/`;
}

const SOURCE_LABEL: Record<Source, string> = {
  leetcode: 'LeetCode',
  neetcode: 'NeetCode',
  tuf: "Striver's A2Z",
  gfg: 'GeeksforGeeks',
  backfill: 'Backfill',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source as Source] ?? source;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

const DAY_MS = 86_400_000;

/** Formats an ISO date/timestamp as a short, human date — "Jul 18" or "Jul 18, 2024" across years. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString('en-US', opts);
}

/** Relative-ish label for very recent dates, falling back to formatDate. */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY_MS);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays}d ago`;
  return formatDate(iso);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const DIFFICULTY_ORDER: Difficulty[] = ['Easy', 'Medium', 'Hard'];
