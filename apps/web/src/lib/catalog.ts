import { sql } from 'drizzle-orm';
import { db, problems } from '@/db';

interface LcStatStatusPair {
  stat: {
    frontend_question_id: number;
    question__title_slug: string;
    question__title: string;
  };
  difficulty: { level: number };
  paid_only: boolean;
}

const DIFFICULTY_BY_LEVEL: Record<number, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

/**
 * Fetches the full LeetCode problem catalog and upserts it into `problems`.
 * Public endpoint, no auth needed. Returns the number of problems upserted.
 */
export async function refreshCatalog(): Promise<number> {
  const res = await fetch('https://leetcode.com/api/problems/all/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal DSA tracker)' },
  });
  if (!res.ok) throw new Error(`LeetCode catalog fetch failed: ${res.status}`);
  const data = (await res.json()) as { stat_status_pairs: LcStatStatusPair[] };

  const rows = data.stat_status_pairs
    .filter((p) => p.stat.question__title_slug)
    .map((p) => ({
      lcSlug: p.stat.question__title_slug,
      lcNumber: p.stat.frontend_question_id,
      title: p.stat.question__title,
      difficulty: DIFFICULTY_BY_LEVEL[p.difficulty.level] ?? 'Medium',
      paidOnly: p.paid_only,
    }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(problems)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: problems.lcSlug,
        set: {
          lcNumber: sql`excluded.lc_number`,
          title: sql`excluded.title`,
          difficulty: sql`excluded.difficulty`,
          paidOnly: sql`excluded.paid_only`,
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}
