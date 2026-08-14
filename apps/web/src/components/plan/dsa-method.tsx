import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MethodCard = {
  title: string;
  /** Tailwind text-colour utility for the card's accent (title + rule). */
  accent: string;
  /** Matching background utility for the 1px accent rule. */
  accentBar: string;
  content: ReactNode;
};

const METHOD_CARDS: MethodCard[] = [
  {
    title: 'Two-phase plan',
    accent: 'text-[var(--pt-blue)]',
    accentBar: 'bg-[var(--pt-blue)]',
    content: (
      <>
        <span className="font-semibold text-[var(--pt-blue)]">Phase 1 · Aug 14–17</span> Trees then
        graphs: recursion mechanics · BST/LCA/reconstruction · BFS/DFS and grids · topo sort and
        union-find.{' '}
        <span className="font-semibold text-[var(--pt-violet)]">Phase 2 · Aug 18–20</span>{' '}
        backtracking/stacks/heaps · binary search on answer · intervals, then a consolidation day.
        Template drill + must-do problems + a no-IDE rep, every day.
      </>
    ),
  },
  {
    title: 'Three-slot structure',
    accent: 'text-[var(--pt-green)]',
    accentBar: 'bg-[var(--pt-green)]',
    content: (
      <>
        <strong>New</strong> (counts toward 300, non-NC150) + <strong>Revision</strong> (NC150
        classics, breadth refresh — trees → linked lists → backtracking → heaps → trie) +{' '}
        <strong>Stretch</strong> (Hards: Fenwick · trie · sweep line · bitmask BFS · digit DP — bonus
        only, skip on heavy-OA days).
      </>
    ),
  },
  {
    title: 'The loop (every problem)',
    accent: 'text-[var(--pt-amber)]',
    accentBar: 'bg-[var(--pt-amber)]',
    content: (
      <>
        10-min honest attempt → editorial only if stuck → <u>type it yourself</u> → flag it →
        re-solve 2–3 days later. Reading ≈ zero retention. Google interview on{' '}
        <span className="font-semibold text-[var(--pt-rose)]">Aug 21</span> — templates only that
        morning; mocks{' '}
        <span className="font-semibold text-[var(--pt-amber)]">Aug 15 · 17 · 19</span>.
      </>
    ),
  },
  {
    title: 'Must-own patterns',
    accent: 'text-[var(--pt-violet)]',
    accentBar: 'bg-[var(--pt-violet)]',
    content: (
      <>
        Prefix/suffix + math transform · sliding window · grid BFS/DFS · DSU · Dijkstra · knapsack
        (pick/not-pick) · LCS · BS-on-answer · two-heap median · SCC/bridges · topo sort.
      </>
    ),
  },
];

export function DsaMethod() {
  return (
    <section className="mb-6 overflow-hidden rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-[var(--pt-shadow-panel)]">
      <div className="border-b border-[var(--pt-border)] bg-[var(--pt-surface-raised)] px-4 py-3.5 sm:px-5">
        <h2 className="text-[14px] font-semibold text-[var(--pt-text)]">DSA method &amp; order</h2>
      </div>

      <DsaMethodBody />
    </section>
  );
}

/**
 * The four reference cards without the section chrome. `withRules` appends the
 * permanent "Never miss twice" card — the shells that fold all static prose into
 * one place render it here rather than leaving it in the daily panel, where it
 * held prime space for something read once a week.
 */
export function DsaMethodBody({ withRules = false }: { withRules?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
      {METHOD_CARDS.map(({ title, accent, accentBar, content }) => (
        <div
          key={title}
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-raised)] p-3.5"
        >
          <div
            className={cn(
              'mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em]',
              accent,
            )}
          >
            <span className={cn('h-3.5 w-1 shrink-0 rounded-full', accentBar)} />
            {title}
          </div>
          <div className="text-[12.5px] leading-relaxed text-[var(--pt-text-2)]">{content}</div>
        </div>
      ))}

      {withRules && (
        <div className="sm:col-span-2">
          <NeverMissTwice />
        </div>
      )}
    </div>
  );
}

/**
 * The zero-day rule. One copy, several callers: the reference pane holds the
 * permanent version, and the stack shell surfaces it in the daily panel only on
 * the day it actually applies.
 */
export function NeverMissTwice({ urgent = false }: { urgent?: boolean }) {
  return (
    <div className="rounded-md border-l-2 border-l-[var(--pt-amber)] bg-[var(--pt-amber-bg)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--pt-text-2)]">
      <span className="font-semibold text-[var(--pt-amber)]">Never miss twice.</span>{' '}
      {urgent
        ? 'Yesterday was a zero day. Today is the one that matters.'
        : 'A zero day happens — jet lag, trip. Two in a row is the real danger.'}
    </div>
  );
}
