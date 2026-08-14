type PatternEntry = {
  name: string;
  tell: string;
  complexity: string;
};

type Tier = {
  title: string;
  subtitle: string;
  accent: string;
  accentBar: string;
  entries: PatternEntry[];
  fullWidth?: boolean;
};

const HIGH: PatternEntry[] = [
  {
    name: 'Two pointers (opposite ends)',
    tell: 'sorted (or sortable) array, symmetric / pair / container / palindrome',
    complexity: 'O(n), O(1)',
  },
  {
    name: 'Sliding window (variable)',
    tell: 'contiguous subarray + optimum + monotone validity; negatives → prefix sums',
    complexity: 'O(n), O(k)',
  },
  {
    name: 'Hashing / frequency maps',
    tell: 'seen-before, count, group, anagram, complement lookup',
    complexity: 'O(n) avg, O(n)',
  },
  {
    name: 'Prefix sums',
    tell: 'range-sum queries, subarray-sum-to-k with negatives, pivot index, sweep line',
    complexity: 'O(n) build, O(1)/query',
  },
  {
    name: 'Binary search (array)',
    tell: 'sorted / rotated, first/last position, n ≤ 1e5',
    complexity: 'O(log n), O(1)',
  },
  {
    name: 'Binary search (answer)',
    tell: 'minimise-max / maximise-min / capacity-in-D-days; "feasible" lights it up',
    complexity: 'O(n log range), O(1)',
  },
  {
    name: 'Monotonic stack',
    tell: 'next-greater / prev-smaller, histogram, remove-k-digits',
    complexity: 'O(n), O(n)',
  },
  {
    name: 'Heaps / priority_queue',
    tell: 'top-k, k-th largest, merge-k, running median (two heaps)',
    complexity: 'O(n log k), O(k)',
  },
  {
    name: 'Tree DFS (recursive)',
    tell: 'any non-level-order tree; carry-down vs return-up',
    complexity: 'O(n), O(h)',
  },
  {
    name: 'Tree BFS / level-order',
    tell: '"level / depth / row / view / width / zigzag"',
    complexity: 'O(n), O(w)',
  },
  {
    name: 'BST properties',
    tell: 'search / sorted tree, k-th smallest, validate with inherited bounds, successor',
    complexity: 'O(h)',
  },
  {
    name: 'Graph representation',
    tell: 'edge list, n nodes 0..n-1, prerequisites / friendships',
    complexity: 'O(V+E) build',
  },
  {
    name: 'Graph BFS',
    tell: 'min steps, shortest unweighted, multi-source; mark visited at push',
    complexity: 'O(V+E), O(V)',
  },
  {
    name: 'Graph DFS',
    tell: 'connected components, path-exists, 3-state cycle, flood fill',
    complexity: 'O(V+E), O(V)',
  },
  {
    name: 'Grid BFS/DFS',
    tell: 'island / region / maze / rot / flood; 4- or 8-direction offsets',
    complexity: 'O(rows·cols)',
  },
  {
    name: 'Topological sort (Kahn)',
    tell: 'prerequisites, build order, directed cycle via size check',
    complexity: 'O(V+E), O(V)',
  },
  {
    name: 'Backtracking',
    tell: 'all subsets / permutations / combinations; choose → explore → un-choose',
    complexity: 'exponential',
  },
];

const MED: PatternEntry[] = [
  {
    name: 'Two pointers (fast–slow)',
    tell: 'in-place remove/partition, list cycle / midpoint / nth-from-end',
    complexity: 'O(n), O(1)',
  },
  {
    name: 'Sliding window (fixed k)',
    tell: '"every subarray of size k"',
    complexity: 'O(n), O(1)',
  },
  {
    name: 'Sorting + greedy',
    tell: 'max non-overlapping / min cover / scheduling; strict "<" comparator',
    complexity: 'O(n log n), O(1)–O(n)',
  },
  {
    name: 'Intervals',
    tell: '[start,end] lists; merge / insert / overlap / min-rooms',
    complexity: 'O(n log n), O(n)',
  },
  {
    name: 'Queue / monotonic deque',
    tell: 'BFS queue; sliding-window max/min O(1) amortised',
    complexity: 'O(n), O(k)',
  },
  {
    name: 'Tree DFS (iterative)',
    tell: '"without recursion" / deep skewed tree',
    complexity: 'O(n), O(h)',
  },
  {
    name: 'Union-Find (DSU)',
    tell: 'incremental components, redundant connection, accounts merge',
    complexity: '~O(1) amortised, O(n)',
  },
];

const LOW: PatternEntry[] = [
  {
    name: 'Tries',
    tell: 'prefix queries, autocomplete, wildcard word search',
    complexity: 'O(L) per op',
  },
  {
    name: 'Dijkstra / MST',
    tell: 'shortest path non-negative weights, min-cost connect',
    complexity: 'O(E log V)',
  },
];

const TIERS: Tier[] = [
  {
    title: 'HIGH',
    subtitle: '17 · automatic',
    accent: 'text-[var(--pt-blue)]',
    accentBar: 'bg-[var(--pt-blue)]',
    entries: HIGH,
    fullWidth: true,
  },
  {
    title: 'MED',
    subtitle: '7 · recallable',
    accent: 'text-[var(--pt-green)]',
    accentBar: 'bg-[var(--pt-green)]',
    entries: MED,
  },
  {
    title: 'LOW',
    subtitle: '2 · recognisable',
    accent: 'text-[var(--pt-amber)]',
    accentBar: 'bg-[var(--pt-amber)]',
    entries: LOW,
  },
];

/**
 * The condensed 26-pattern inventory, grouped into HIGH / MED / LOW tier cards.
 * Each line is name — tell — complexity only; the full implementation skeletons
 * live in the user's notes, not here.
 */
export function PatternInventoryBody() {
  return (
    <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
      {TIERS.map(({ title, subtitle, accent, accentBar, entries, fullWidth }) => (
        <div
          key={title}
          className={`rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-raised)] p-3.5${
            fullWidth ? ' sm:col-span-2' : ''
          }`}
        >
          <div
            className={`mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] ${accent}`}
          >
            <span className={`h-3.5 w-1 shrink-0 rounded-full ${accentBar}`} />
            {title}
            <span className="font-normal normal-case tracking-normal opacity-70">{subtitle}</span>
          </div>
          <ul className="mt-1 space-y-1">
            {entries.map(({ name, tell, complexity }) => (
              <li key={name} className="text-[12.5px] leading-relaxed text-[var(--pt-text-2)]">
                <strong>{name}</strong> — {tell} — {complexity}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
