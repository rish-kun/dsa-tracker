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
        <span className="font-semibold text-[var(--pt-blue)]">Phase 1 · Jul 20–24</span> Google-OA
        breadth (easy–medium, outside NC150): arrays/prefix-suffix · strings/hashing · greedy/stack ·
        sliding window · grid+DSU+light DP.{' '}
        <span className="font-semibold text-[var(--pt-violet)]">Phase 2 · Jul 26, 29</span> weak
        areas: adv DP · shortest paths/bridges/DSU · two-heap. 5 new problems/day + revision slot.
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
        only, skip on heavy-C++ days).
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
        re-solve 2–3 days later. Reading ≈ zero retention. Google OA on{' '}
        <span className="font-semibold text-[var(--pt-rose)]">Jul 25</span> — warmup only that
        morning; mock OAs{' '}
        <span className="font-semibold text-[var(--pt-amber)]">Jul 30–31</span>.
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
      </div>
    </section>
  );
}
