export type Tag = "dsa" | "cpp" | "res" | "oth"
export type DsaCategory = "new" | "revision" | "stretch"

export type DayTask = [Tag, string]

export type DsaProblem = {
  name: string
  difficulty: "E" | "M" | "H"
  category: DsaCategory
  /** 'lc:<slug>' — populated by scripts/resolve-plan-keys.ts; absent for the 5 (Striver) entries */
  canonicalKey?: string
}

export type DayEntry = {
  date: string
  label: string
  tasks: DayTask[]
  problems?: DsaProblem[]
  milestone: string
}

export type PhaseEntry = {
  name: string
  dates: string
  desc: string
}

/**
 * Canonical membership of the official NeetCode 150 list.
 *
 * This is a counting boundary, not a storage filter: the tracker keeps every
 * solve, while the NeetCode ring intersects solved keys with this exact set.
 * Sourced from neetcode.io's `neetcode150` dataset on 2026-07-22.
 */
export const NEETCODE_150_KEYS = [
  "lc:contains-duplicate",
  "lc:valid-anagram",
  "lc:two-sum",
  "lc:group-anagrams",
  "lc:top-k-frequent-elements",
  "lc:encode-and-decode-strings",
  "lc:product-of-array-except-self",
  "lc:valid-sudoku",
  "lc:longest-consecutive-sequence",
  "lc:valid-palindrome",
  "lc:two-sum-ii-input-array-is-sorted",
  "lc:3sum",
  "lc:container-with-most-water",
  "lc:trapping-rain-water",
  "lc:best-time-to-buy-and-sell-stock",
  "lc:longest-substring-without-repeating-characters",
  "lc:longest-repeating-character-replacement",
  "lc:permutation-in-string",
  "lc:minimum-window-substring",
  "lc:sliding-window-maximum",
  "lc:valid-parentheses",
  "lc:min-stack",
  "lc:evaluate-reverse-polish-notation",
  "lc:daily-temperatures",
  "lc:car-fleet",
  "lc:largest-rectangle-in-histogram",
  "lc:binary-search",
  "lc:search-a-2d-matrix",
  "lc:koko-eating-bananas",
  "lc:find-minimum-in-rotated-sorted-array",
  "lc:search-in-rotated-sorted-array",
  "lc:time-based-key-value-store",
  "lc:median-of-two-sorted-arrays",
  "lc:reverse-linked-list",
  "lc:merge-two-sorted-lists",
  "lc:linked-list-cycle",
  "lc:reorder-list",
  "lc:remove-nth-node-from-end-of-list",
  "lc:copy-list-with-random-pointer",
  "lc:add-two-numbers",
  "lc:find-the-duplicate-number",
  "lc:lru-cache",
  "lc:merge-k-sorted-lists",
  "lc:reverse-nodes-in-k-group",
  "lc:invert-binary-tree",
  "lc:maximum-depth-of-binary-tree",
  "lc:diameter-of-binary-tree",
  "lc:balanced-binary-tree",
  "lc:same-tree",
  "lc:subtree-of-another-tree",
  "lc:lowest-common-ancestor-of-a-binary-search-tree",
  "lc:binary-tree-level-order-traversal",
  "lc:binary-tree-right-side-view",
  "lc:count-good-nodes-in-binary-tree",
  "lc:validate-binary-search-tree",
  "lc:kth-smallest-element-in-a-bst",
  "lc:construct-binary-tree-from-preorder-and-inorder-traversal",
  "lc:binary-tree-maximum-path-sum",
  "lc:serialize-and-deserialize-binary-tree",
  "lc:kth-largest-element-in-a-stream",
  "lc:last-stone-weight",
  "lc:k-closest-points-to-origin",
  "lc:kth-largest-element-in-an-array",
  "lc:task-scheduler",
  "lc:design-twitter",
  "lc:find-median-from-data-stream",
  "lc:subsets",
  "lc:combination-sum",
  "lc:combination-sum-ii",
  "lc:permutations",
  "lc:subsets-ii",
  "lc:generate-parentheses",
  "lc:word-search",
  "lc:palindrome-partitioning",
  "lc:letter-combinations-of-a-phone-number",
  "lc:n-queens",
  "lc:implement-trie-prefix-tree",
  "lc:design-add-and-search-words-data-structure",
  "lc:word-search-ii",
  "lc:number-of-islands",
  "lc:max-area-of-island",
  "lc:clone-graph",
  "lc:walls-and-gates",
  "lc:rotting-oranges",
  "lc:pacific-atlantic-water-flow",
  "lc:surrounded-regions",
  "lc:course-schedule",
  "lc:course-schedule-ii",
  "lc:graph-valid-tree",
  "lc:number-of-connected-components-in-an-undirected-graph",
  "lc:redundant-connection",
  "lc:word-ladder",
  "lc:network-delay-time",
  "lc:reconstruct-itinerary",
  "lc:min-cost-to-connect-all-points",
  "lc:swim-in-rising-water",
  "lc:alien-dictionary",
  "lc:cheapest-flights-within-k-stops",
  "lc:climbing-stairs",
  "lc:min-cost-climbing-stairs",
  "lc:house-robber",
  "lc:house-robber-ii",
  "lc:longest-palindromic-substring",
  "lc:palindromic-substrings",
  "lc:decode-ways",
  "lc:coin-change",
  "lc:maximum-product-subarray",
  "lc:word-break",
  "lc:longest-increasing-subsequence",
  "lc:partition-equal-subset-sum",
  "lc:unique-paths",
  "lc:longest-common-subsequence",
  "lc:best-time-to-buy-and-sell-stock-with-cooldown",
  "lc:coin-change-ii",
  "lc:target-sum",
  "lc:interleaving-string",
  "lc:longest-increasing-path-in-a-matrix",
  "lc:distinct-subsequences",
  "lc:edit-distance",
  "lc:burst-balloons",
  "lc:regular-expression-matching",
  "lc:maximum-subarray",
  "lc:jump-game",
  "lc:jump-game-ii",
  "lc:gas-station",
  "lc:hand-of-straights",
  "lc:merge-triplets-to-form-target-triplet",
  "lc:partition-labels",
  "lc:valid-parenthesis-string",
  "lc:insert-interval",
  "lc:merge-intervals",
  "lc:non-overlapping-intervals",
  "lc:meeting-rooms",
  "lc:meeting-rooms-ii",
  "lc:minimum-interval-to-include-each-query",
  "lc:rotate-image",
  "lc:spiral-matrix",
  "lc:set-matrix-zeroes",
  "lc:happy-number",
  "lc:plus-one",
  "lc:powx-n",
  "lc:multiply-strings",
  "lc:detect-squares",
  "lc:single-number",
  "lc:number-of-1-bits",
  "lc:counting-bits",
  "lc:reverse-bits",
  "lc:missing-number",
  "lc:sum-of-two-integers",
  "lc:reverse-integer",
] as const

/**
 * The seven prep days of the Google interview run-up (14–20 Aug 2026), as
 * phases. Replaced the finished C++ semantic-cache phases on 2026-08-14 — the
 * old `phase:<slug>` check rows are orphaned by that swap, not migrated.
 */
export const PHASES: PhaseEntry[] = [
  { name: "1 · Trees I — recursion mechanics",        dates: "Aug 14", desc: "Null base case as a reflex · DFS return-one/record-another · BFS with the level_size snapshot · iterative inorder" },
  { name: "2 · Trees II — BST, LCA, reconstruction",  dates: "Aug 15", desc: "Inherited bounds not parent comparison · the LCA recursion · preorder+inorder index bookkeeping · MOCK #1" },
  { name: "3 · Graphs I — BFS/DFS and grids",         dates: "Aug 16", desc: "Adjacency build directed and undirected · multi-source BFS · 4-direction grid offsets · mark visited at push time" },
  { name: "4 · Graphs II — topo sort and union-find", dates: "Aug 17", desc: "Kahn indegree with the size check as cycle detection · DisjointSet with path compression · 3-state cycle detection · MOCK #2" },
  { name: "5 · Backtracking, stacks, heaps",          dates: "Aug 18", desc: "choose → explore → un-choose · monotonic stack amortisation · priority_queue comparator direction" },
  { name: "6 · Binary search on answer, intervals",   dates: "Aug 19", desc: "First-true invariant · isFeasible as a named helper · sort-by-start vs sort-by-end · MOCK #3 full dress rehearsal" },
  { name: "7 · Consolidation — retrieval only",       dates: "Aug 20", desc: "All 26 skeletons from memory in one sitting · four re-solves against the clock · mistake log end to end · logistics, then sleep" },
]

export const WEEKS: Array<{ label: string; indices: number[] }> = [
  { label: "Setup", indices: [0] },
  { label: "Week 1 · NeetCode 150 (AM 3h DSA) + C++ ramp (PM 1.5h)", indices: [1,2,3,4,5,6,7] },
  { label: "Week 2 · NeetCode finish + C++ build begins (PM 3h)", indices: [8,9,10,11] },
  { label: "Final sprint · C++ ship (3h PM) + new DSA 5/day (AM 2h)", indices: [12,13,14,15,16,17,18,19] },
  { label: "Transit · Tokyo → Delhi → Pilani", indices: [20,21,22] },
  { label: "Settle + mock OAs + OA day", indices: [23,24,25] },
  // Every DAYS index must appear in exactly one group: schedule.tsx and
  // plan-rail.tsx iterate WEEKS, so a day in no group renders nowhere.
  { label: "Google prep · Trees → Graphs → Backtracking (Aug 14–17)", indices: [26,27,28,29] },
  { label: "Interview week · dress rehearsal, taper, Google Fri 21", indices: [30,31,32,33] },
]

export const DAYS: DayEntry[] = [
  { date:"2026-07-07", label:"Mon Jul 7 · Setup day",            tasks:[["oth","List your exact 67 remaining NeetCode problems"],["cpp","Install clang/gcc + CMake + VS Code, verify a hello-world build"],["cpp","Create GitHub repo for the cache project"],["cpp","Get an embedding API key and test one request (curl)"]], milestone:"Environment ready" },
  { date:"2026-07-08", label:"Tue Jul 8",                        tasks:[["dsa","Graphs ×6 (3h AM)"],["cpp","Phase 0 ramp (1.5h PM)"]], milestone:"" },
  { date:"2026-07-09", label:"Wed Jul 9",                        tasks:[["dsa","Graphs ×6 → section done (13)"],["cpp","Phase 0 ramp"]], milestone:"" },
  { date:"2026-07-10", label:"Thu Jul 10",                       tasks:[["dsa","1-D DP ×6"],["cpp","Phase 0 ramp"]], milestone:"" },
  { date:"2026-07-11", label:"Fri Jul 11",                       tasks:[["dsa","1-D DP ×6 → section done (12)"],["cpp","Phase 0 ramp"]], milestone:"" },
  { date:"2026-07-12", label:"Sat Jul 12",                       tasks:[["dsa","2-D DP ×6 — hardest days, protect this block"],["cpp","Phase 0 wrap-up"]], milestone:"" },
  { date:"2026-07-13", label:"Sun Jul 13",                       tasks:[["dsa","2-D DP ×5 → section done (11)"],["cpp","Phase 1: exact-match cache start"]], milestone:"" },
  { date:"2026-07-14", label:"Mon Jul 14",                       tasks:[["dsa","Advanced Graphs ×6 → done"],["cpp","Phase 1 continue"]], milestone:"Graphs + DP complete (42)" },
  { date:"2026-07-15", label:"Tue Jul 15 · blocks flip today",   tasks:[["dsa","Greedy ×5 (1.5h AM)"],["cpp","Phase 1 finish (3h PM)"]], milestone:"Exact-match cache works" },
  { date:"2026-07-16", label:"Wed Jul 16",                       tasks:[["dsa","Greedy ×3 + Intervals ×2"],["cpp","Phase 2: embeddings + flat store"]], milestone:"" },
  { date:"2026-07-17", label:"Thu Jul 17",                       tasks:[["dsa","Intervals ×4 → done"],["cpp","Phase 2: cosine + threshold"]], milestone:"Semantic hits working" },
  { date:"2026-07-18", label:"Fri Jul 18",                       tasks:[["dsa","Bits/Math: 6 classics only"],["cpp","Phase 3: SIMD kernel"]], milestone:"NeetCode 150 done" },
  { date:"2026-07-19", label:"Sun Jul 19 — total → 160 · C++ only",
    tasks:[
      ["cpp","Phase 1: CMake skeleton + GitHub repo · CLI prompt → hash lookup → API on miss (libcurl + nlohmann/json)"],
      ["oth","DSA starts tomorrow — if spare energy, close out any NeetCode 150 stragglers (revision, not counted)"],
    ],
    milestone:"Phase 1 done" },

  { date:"2026-07-20", label:"Mon Jul 20 — total → 165 · Arrays + prefix/suffix",
    tasks:[
      ["cpp","Phase 2: embedding client · flat vector store · scalar cosine · threshold hit/miss"],
    ],
    problems:[
      { name:"LC 724 Find Pivot Index",            difficulty:"E", category:"new", canonicalKey:"lc:find-pivot-index" },
      { name:"LC 560 Subarray Sum Equals K",        difficulty:"M", category:"new", canonicalKey:"lc:subarray-sum-equals-k" },
      { name:"LC 2270 Ways to Split Array",          difficulty:"M", category:"new", canonicalKey:"lc:number-of-ways-to-split-array" },
      { name:"LC 1422 Max Score Split String",       difficulty:"E", category:"new", canonicalKey:"lc:maximum-score-after-splitting-a-string" },
      { name:"LC 1413 Min Value Positive Step Sum",  difficulty:"E", category:"new", canonicalKey:"lc:minimum-value-to-get-positive-step-by-step-sum" },
      { name:"LC 121 Best Time Buy/Sell Stock",      difficulty:"E", category:"revision", canonicalKey:"lc:best-time-to-buy-and-sell-stock" },
      { name:"LC 53 Maximum Subarray (Kadane)",      difficulty:"M", category:"revision", canonicalKey:"lc:maximum-subarray" },
      { name:"LC 315 Count Smaller After Self",      difficulty:"H", category:"stretch", canonicalKey:"lc:count-of-smaller-numbers-after-self" },
      { name:"LC 1235 Max Profit Job Scheduling",    difficulty:"H", category:"stretch", canonicalKey:"lc:maximum-profit-in-job-scheduling" },
      { name:"LC 421 Max XOR Two Numbers",           difficulty:"H", category:"stretch", canonicalKey:"lc:maximum-xor-of-two-numbers-in-an-array" },
    ],
    milestone:"Semantic hits working" },

  { date:"2026-07-21", label:"Tue Jul 21 — total → 170 · Strings + hashing/frequency",
    tasks:[
      ["cpp","Phase 3: AVX2 cosine kernel · 32-byte alignment · benchmark vs scalar (record speedup)"],
    ],
    problems:[
      { name:"LC 409 Longest Palindrome",                  difficulty:"E", category:"new", canonicalKey:"lc:longest-palindrome" },
      { name:"LC 916 Word Subsets",                        difficulty:"M", category:"new", canonicalKey:"lc:word-subsets" },
      { name:"LC 438 Find All Anagrams in a String",       difficulty:"M", category:"new", canonicalKey:"lc:find-all-anagrams-in-a-string" },
      { name:"LC 249 Group Shifted Strings",               difficulty:"M", category:"new", canonicalKey:"lc:group-shifted-strings" },
      { name:"LC 1781 Sum of Beauty of All Substrings",    difficulty:"M", category:"new", canonicalKey:"lc:sum-of-beauty-of-all-substrings" },
      { name:"LC 226 Invert Binary Tree",                  difficulty:"E", category:"revision", canonicalKey:"lc:invert-binary-tree" },
      { name:"LC 102 Binary Tree Level Order Traversal",   difficulty:"M", category:"revision", canonicalKey:"lc:binary-tree-level-order-traversal" },
      { name:"LC 727 Min Window Subsequence",              difficulty:"H", category:"stretch", canonicalKey:"lc:minimum-window-subsequence" },
      { name:"LC 336 Palindrome Pairs",                    difficulty:"H", category:"stretch", canonicalKey:"lc:palindrome-pairs" },
      { name:"LC 214 Shortest Palindrome",                 difficulty:"H", category:"stretch", canonicalKey:"lc:shortest-palindrome" },
    ],
    milestone:"SIMD speedup measured" },

  { date:"2026-07-22", label:"Wed Jul 22 — total → 175 · Greedy + stack",
    tasks:[
      ["cpp","Phase 4: Greedy-Dual-Size eviction policy · memory cap · eviction unit test"],
    ],
    problems:[
      { name:"LC 1717 Max Score from Removing Substrings", difficulty:"M", category:"new", canonicalKey:"lc:maximum-score-from-removing-substrings" },
      { name:"LC 2696 Min String Length After Removing",   difficulty:"M", category:"new", canonicalKey:"lc:minimum-string-length-after-removing-substrings" },
      { name:"LC 735 Asteroid Collision",                  difficulty:"M", category:"new", canonicalKey:"lc:asteroid-collision" },
      { name:"LC 881 Boats to Save People",                difficulty:"M", category:"new", canonicalKey:"lc:boats-to-save-people" },
      { name:"LC 901 Online Stock Span",                   difficulty:"M", category:"new", canonicalKey:"lc:online-stock-span" },
      { name:"LC 206 Reverse Linked List",                 difficulty:"E", category:"revision", canonicalKey:"lc:reverse-linked-list" },
      { name:"LC 21 Merge Two Sorted Lists",               difficulty:"E", category:"revision", canonicalKey:"lc:merge-two-sorted-lists" },
      { name:"LC 218 The Skyline Problem",                 difficulty:"H", category:"stretch", canonicalKey:"lc:the-skyline-problem" },
      { name:"LC 85 Maximal Rectangle",                    difficulty:"H", category:"stretch", canonicalKey:"lc:maximal-rectangle" },
      { name:"LC 502 IPO",                                 difficulty:"H", category:"stretch", canonicalKey:"lc:ipo" },
    ],
    milestone:"" },

  { date:"2026-07-23", label:"Thu Jul 23 — total → 180 · Sliding window + two pointers + binary search",
    tasks:[
      ["cpp","Phase 5: versioned binary snapshot save/reload · corrupt-file handling · one std::shared_mutex"],
    ],
    problems:[
      { name:"LC 1004 Max Consecutive Ones III",         difficulty:"M", category:"new", canonicalKey:"lc:max-consecutive-ones-iii" },
      { name:"LC 209 Minimum Size Subarray Sum",          difficulty:"M", category:"new", canonicalKey:"lc:minimum-size-subarray-sum" },
      { name:"LC 75 Sort Colors (Dutch-flag)",            difficulty:"M", category:"new", canonicalKey:"lc:sort-colors" },
      { name:"LC 34 Find First & Last Position in Array", difficulty:"M", category:"new", canonicalKey:"lc:find-first-and-last-position-of-element-in-sorted-array" },
      { name:"LC 852 Peak Index in Mountain Array",       difficulty:"M", category:"new", canonicalKey:"lc:peak-index-in-a-mountain-array" },
      { name:"LC 78 Subsets",                             difficulty:"M", category:"revision", canonicalKey:"lc:subsets" },
      { name:"LC 39 Combination Sum",                     difficulty:"M", category:"revision", canonicalKey:"lc:combination-sum" },
      { name:"LC 410 Split Array Largest Sum",            difficulty:"H", category:"stretch", canonicalKey:"lc:split-array-largest-sum" },
      { name:"LC 992 Subarrays with K Different Integers",difficulty:"H", category:"stretch", canonicalKey:"lc:subarrays-with-k-different-integers" },
      { name:"LC 149 Max Points on a Line",               difficulty:"H", category:"stretch", canonicalKey:"lc:max-points-on-a-line" },
    ],
    milestone:"" },

  { date:"2026-07-24", label:"Fri Jul 24 — total → 185 · Grid BFS/DFS + union-find + light DP",
    tasks:[
      ["cpp","Phase 6: workload replay · hit rate / latency / $ saved · README + fill resume metric placeholders"],
    ],
    problems:[
      { name:"LC 733 Flood Fill",                               difficulty:"E", category:"new", canonicalKey:"lc:flood-fill" },
      { name:"LC 542 01 Matrix (multi-source BFS)",             difficulty:"M", category:"new", canonicalKey:"lc:01-matrix" },
      { name:"LC 1091 Shortest Path in Binary Matrix",          difficulty:"M", category:"new", canonicalKey:"lc:shortest-path-in-binary-matrix" },
      { name:"LC 990 Satisfiability of Equality Equations (DSU)",difficulty:"M", category:"new", canonicalKey:"lc:satisfiability-of-equality-equations" },
      { name:"LC 221 Maximal Square (grid DP)",                 difficulty:"M", category:"new", canonicalKey:"lc:maximal-square" },
      { name:"LC 236 Lowest Common Ancestor of Binary Tree",    difficulty:"M", category:"revision", canonicalKey:"lc:lowest-common-ancestor-of-a-binary-tree" },
      { name:"LC 91 Decode Ways",                               difficulty:"M", category:"revision", canonicalKey:"lc:decode-ways" },
      { name:"LC 126 Word Ladder II",                           difficulty:"H", category:"stretch", canonicalKey:"lc:word-ladder-ii" },
      { name:"LC 847 Shortest Path Visiting All Nodes",         difficulty:"H", category:"stretch", canonicalKey:"lc:shortest-path-visiting-all-nodes" },
      { name:"LC 407 Trapping Rain Water II",                   difficulty:"H", category:"stretch", canonicalKey:"lc:trapping-rain-water-ii" },
    ],
    milestone:"" },

  { date:"2026-07-25", label:"Sat Jul 25 — GOOGLE OA — total → ~187",
    tasks:[
      ["oth","Take the OA: read both problems first · all visible tests green before edge cases · state time & space complexity · watch for prefix/suffix + math patterns"],
      ["cpp","Light buffer only if energy remains after OA · rest"],
    ],
    problems:[
      { name:"LC 1 Two Sum (warmup)",              difficulty:"E", category:"new", canonicalKey:"lc:two-sum" },
      { name:"LC 1480 Running Sum of 1d Array",    difficulty:"E", category:"new", canonicalKey:"lc:running-sum-of-1d-array" },
    ],
    milestone:"Google OA done" },

  { date:"2026-07-26", label:"Sun Jul 26 — total → ~192 · Project shipped + adv DP",
    tasks:[
      ["cpp","Final polish + push · README screenshots / asciinema of a cache hit"],
      ["res","Real benchmark metrics → resume (Superset)"],
    ],
    problems:[
      { name:"0/1 Knapsack (Striver)",                    difficulty:"M", category:"new" },
      { name:"Min Subset Sum Difference (Striver)",       difficulty:"M", category:"new" },
      { name:"LC 123 Best Time to Buy/Sell Stock III",    difficulty:"H", category:"new", canonicalKey:"lc:best-time-to-buy-and-sell-stock-iii" },
      { name:"Matrix Chain Multiplication (Striver)",     difficulty:"H", category:"new" },
      { name:"LC 1547 Min Cost to Cut a Stick",           difficulty:"H", category:"new", canonicalKey:"lc:minimum-cost-to-cut-a-stick" },
      { name:"LC 215 Kth Largest Element in Array",       difficulty:"M", category:"revision", canonicalKey:"lc:kth-largest-element-in-an-array" },
      { name:"LC 347 Top K Frequent Elements",            difficulty:"M", category:"revision", canonicalKey:"lc:top-k-frequent-elements" },
      { name:"LC 887 Super Egg Drop",                     difficulty:"H", category:"stretch", canonicalKey:"lc:super-egg-drop" },
      { name:"LC 698 Partition to K Equal Sum Subsets",   difficulty:"H", category:"stretch", canonicalKey:"lc:partition-to-k-equal-sum-subsets" },
      { name:"LC 233 Number of Digit One",                difficulty:"H", category:"stretch", canonicalKey:"lc:number-of-digit-one" },
    ],
    milestone:"Project shipped" },

  { date:"2026-07-27", label:"Mon Jul 27 · Tokyo → Delhi — total → ~192",
    tasks:[
      ["oth","Phone only — pattern cheat sheet: prefix/suffix · sliding window · grid BFS/DFS · DSU · knapsack · two-heap"],
      ["oth","STAR stories out loud: CoStAA, WSC (project impact + your specific contribution)"],
      ["oth","Zero-coding day is fine — tomorrow is a floor day no matter what"],
    ],
    milestone:"" },

  { date:"2026-07-28", label:"Tue Jul 28 · Delhi → Pilani — total → ~192",
    tasks:[
      ["oth","Travel / rest — protect sleep for the mock-OA push ahead"],
      ["dsa","Optional: 1 easy revision re-solve (not counted)"],
    ],
    milestone:"" },

  { date:"2026-07-29", label:"Wed Jul 29 · Room setup — total → ~197 · Adv graphs + heaps",
    tasks:[
      ["oth","Settle in · verify laptop / network / OA logins"],
      ["res","Evening: re-read your own C++ code before notes (project revision)"],
    ],
    problems:[
      { name:"Dijkstra Shortest Path Weighted (Striver)",          difficulty:"M", category:"new" },
      { name:"Bellman-Ford (Striver)",                             difficulty:"M", category:"new" },
      { name:"LC 1192 Critical Connections in a Network (Bridges)",difficulty:"H", category:"new", canonicalKey:"lc:critical-connections-in-a-network" },
      { name:"LC 721 Accounts Merge (DSU)",                        difficulty:"M", category:"new", canonicalKey:"lc:accounts-merge" },
      { name:"LC 480 Sliding Window Median (two heaps)",           difficulty:"H", category:"new", canonicalKey:"lc:sliding-window-median" },
      { name:"LC 208 Implement Trie",                              difficulty:"M", category:"revision", canonicalKey:"lc:implement-trie-prefix-tree" },
      { name:"LC 22 Generate Parentheses",                         difficulty:"M", category:"revision", canonicalKey:"lc:generate-parentheses" },
      { name:"LC 1489 Critical & Pseudo-Critical Edges in MST",    difficulty:"H", category:"stretch", canonicalKey:"lc:find-critical-and-pseudo-critical-edges-in-minimum-spanning-tree" },
      { name:"LC 815 Bus Routes",                                  difficulty:"H", category:"stretch", canonicalKey:"lc:bus-routes" },
      { name:"LC 1368 Min Cost to Make Valid Path in Grid (0-1 BFS)",difficulty:"H", category:"stretch", canonicalKey:"lc:minimum-cost-to-make-at-least-one-valid-path-in-a-grid" },
    ],
    milestone:"" },

  { date:"2026-07-30", label:"Thu Jul 30 · Mock OA #1 — total → ~201",
    tasks:[
      ["dsa","Timed mock OA #1 — LeetCode virtual contest / 3–4 Q in 90 min, exam conditions"],
      ["dsa","Review each: name the pattern + what slowed you down"],
      ["res","Finalize resume on Superset with REAL C++ benchmark numbers"],
    ],
    milestone:"Resume frozen" },

  { date:"2026-07-31", label:"Fri Jul 31 · Mock OA #2 — total → ~205",
    tasks:[
      ["dsa","Timed mock OA #2 + review both mocks side-by-side for repeated leaks"],
      ["res","Project deep-dive rehearsal — NestJS/FHIR → Django/Celery → C++ cache design Qs"],
    ],
    milestone:"" },

  { date:"2026-08-01", label:"Sat Aug 1 · OAs begin — total → ~206",
    tasks:[
      ["dsa","Light warmup: 1 easy re-solve · take OAs fresh · don't cram new material"],
      ["oth","Keep evening revision rolling: NestJS/FHIR → Django/Celery → deployment story → C++ deep-dive rehearsal"],
    ],
    milestone:"Go time" },

  { date:"2026-08-14", label:"Fri Aug 14 · Day 1 · Trees I: recursion mechanics — null-check reflex",
    tasks:[
      ["dsa","Block A drill 1 — arrays: two pointers · sliding window · hash complement · prefix sum · binary search"],
      ["dsa","Block A drill 2 — trees: DFS plain · DFS return-one/record-another · BFS level_size · iterative inorder"],
      ["dsa","Day one gets both blocks — diff every template against the pattern sheet and circle each difference"],
      ["dsa","LC 543 → LC 110 (same shape, -1 sentinel early exit) → LC 199 twice: BFS, then DFS, compare space"],
      ["dsa","Block D no-IDE rep (45 min) — LC 102 by hand in a plain Doc: level_size snapshot · null guards"],
      ["dsa","Paste the Doc code into LeetCode unedited · log every diff · Block F mistake log, 10 min"],
      ["cpp","Plain-doc habits — 2-space indent, close braces at once, helpers above callers; drill isVowel + std::swap"],
      ["res","Block E (30 min) — message 5–6 BITS seniors at Google · resume hygiene pass · intro v1 with 2 hooks"],
      ["oth","Hard stop 17:30 and eat · warm-up then Intuit OA 18:00 · warm-up 20:30 then eBay OA 21:00 · sleep"],
    ],
    problems:[
      { name:"LC 345 Reverse Vowels of a String",                  difficulty:"E", category:"new", canonicalKey:"lc:reverse-vowels-of-a-string" },
      { name:"LC 104 Maximum Depth of Binary Tree",                difficulty:"E", category:"new", canonicalKey:"lc:maximum-depth-of-binary-tree" },
      { name:"LC 226 Invert Binary Tree",                          difficulty:"E", category:"new", canonicalKey:"lc:invert-binary-tree" },
      { name:"LC 543 Diameter of Binary Tree",                     difficulty:"E", category:"new", canonicalKey:"lc:diameter-of-binary-tree" },
      { name:"LC 110 Balanced Binary Tree",                        difficulty:"E", category:"new", canonicalKey:"lc:balanced-binary-tree" },
      { name:"LC 102 Binary Tree Level Order Traversal",           difficulty:"M", category:"new", canonicalKey:"lc:binary-tree-level-order-traversal" },
      { name:"LC 199 Binary Tree Right Side View",                 difficulty:"M", category:"new", canonicalKey:"lc:binary-tree-right-side-view" },
      { name:"LC 94 Binary Tree Inorder Traversal",                difficulty:"E", category:"stretch", canonicalKey:"lc:binary-tree-inorder-traversal" },
      { name:"LC 113 Path Sum II",                                 difficulty:"M", category:"stretch", canonicalKey:"lc:path-sum-ii" },
      { name:"LC 125 Valid Palindrome",                            difficulty:"E", category:"revision", canonicalKey:"lc:valid-palindrome" },
      { name:"LC 3 Longest Substring Without Repeating Characters", difficulty:"M", category:"revision", canonicalKey:"lc:longest-substring-without-repeating-characters" },
      { name:"LC 15 3Sum",                              difficulty:"M", category:"revision", canonicalKey:"lc:3sum" },
    ],
    milestone:"Tree recursion reflex" },

  { date:"2026-08-15", label:"Sat Aug 15 · Day 2 · Trees II: BST · LCA · reconstruction — MOCK #1",
    tasks:[
      ["dsa","Block A drill (25 min) — BST validate-with-bounds · the LCA recursion shape · level-order"],
      ["dsa","Block B recall reps (15 min) — re-derive LC 543 and LC 199 on paper, cold, no notes"],
      ["dsa","MOCK #1 (45 min timed) — LC 863 opened cold: visible timer, camera on, recording, Doc only, no IDE"],
      ["dsa","Mock protocol — 3 min of clarifying questions aloud, compare two approaches aloud, code, dry-run"],
      ["dsa","LC 863 forces the tree-to-graph conversion — add parent pointers, then BFS out from the target"],
      ["dsa","Mock review (45 min) at 1.5× — count silences over 15s · coding before complexity · missed edges"],
      ["dsa","Log those three numbers for the Mon/Wed comparison, rewrite LC 863 cleanly, then Block F entries"],
      ["cpp","Drill priority_queue and unordered_map gotchas — the ones that bite with no compiler to catch them"],
      ["res","Block E (30 min) — project deep-dive: write the 10 pre-answered questions for each resume project"],
      ["oth","Free day, 5h budget — protect the review block; the review is worth more than the mock itself"],
    ],
    problems:[
      { name:"LC 98 Validate Binary Search Tree",                     difficulty:"M", category:"new", canonicalKey:"lc:validate-binary-search-tree" },
      { name:"LC 230 Kth Smallest Element in a BST",                  difficulty:"M", category:"new", canonicalKey:"lc:kth-smallest-element-in-a-bst" },
      { name:"LC 236 Lowest Common Ancestor of a Binary Tree",        difficulty:"M", category:"new", canonicalKey:"lc:lowest-common-ancestor-of-a-binary-tree" },
      { name:"LC 235 Lowest Common Ancestor of a BST",                difficulty:"M", category:"new", canonicalKey:"lc:lowest-common-ancestor-of-a-binary-search-tree" },
      { name:"LC 105 Construct Binary Tree from Preorder and Inorder", difficulty:"M", category:"new", canonicalKey:"lc:construct-binary-tree-from-preorder-and-inorder-traversal" },
      { name:"LC 863 All Nodes Distance K in Binary Tree",            difficulty:"M", category:"new", canonicalKey:"lc:all-nodes-distance-k-in-binary-tree" },
      { name:"LC 543 Diameter of Binary Tree",                        difficulty:"E", category:"revision", canonicalKey:"lc:diameter-of-binary-tree" },
      { name:"LC 199 Binary Tree Right Side View",                    difficulty:"M", category:"revision", canonicalKey:"lc:binary-tree-right-side-view" },
      { name:"LC 1448 Count Good Nodes in Binary Tree",               difficulty:"M", category:"stretch", canonicalKey:"lc:count-good-nodes-in-binary-tree" },
      { name:"LC 173 Binary Search Tree Iterator",                    difficulty:"M", category:"stretch", canonicalKey:"lc:binary-search-tree-iterator" },
      { name:"LC 124 Binary Tree Maximum Path Sum",                   difficulty:"H", category:"stretch", canonicalKey:"lc:binary-tree-maximum-path-sum" },
    ],
    milestone:"Mock #1 done" },

  { date:"2026-08-16", label:"Sun Aug 16 · Day 3 · Graphs I — representation, BFS/DFS, grids",
    tasks:[
      ["oth","Free day · budget 5h — highest-leverage day of the week; protect it from everything else"],
      ["dsa","Block A template drill (30 min): adjacency list directed + undirected, BFS with distance array, recursive DFS, 4-dir grid offsets — all four cold"],
      ["dsa","Block B recall reps (15 min): re-derive LC 236 and LC 98 on paper"],
      ["dsa","Block D no-IDE rep (50 min) — LC 200 BFS version with an explicit visited grid"],
      ["dsa","Say the assumption aloud first — I assume I may not mutate the grid so I allocate visited; if mutation is allowed I drop it and save O(m·n) space"],
      ["cpp","Mark visited at push time, not pop time; write the vector<vector<int>> grid init one-liner from memory"],
      ["res","Block E side track (30 min): growth mindset — internalise the 13 verbatim lines (hint received, approach wrong, genuinely stuck, self-caught bug, polite disagreement)"],
      ["oth","Block F — mistake log entries before shutting down"],
    ],
    problems:[
      { name:"LC 200 Number of Islands",                    difficulty:"M", category:"new", canonicalKey:"lc:number-of-islands" },
      { name:"LC 994 Rotting Oranges",                      difficulty:"M", category:"new", canonicalKey:"lc:rotting-oranges" },
      { name:"LC 133 Clone Graph",                          difficulty:"M", category:"new", canonicalKey:"lc:clone-graph" },
      { name:"LC 542 01 Matrix",                            difficulty:"M", category:"new", canonicalKey:"lc:01-matrix" },
      { name:"LC 417 Pacific Atlantic Water Flow",          difficulty:"M", category:"new", canonicalKey:"lc:pacific-atlantic-water-flow" },
      { name:"LC 236 Lowest Common Ancestor of a Binary Tree", difficulty:"M", category:"revision", canonicalKey:"lc:lowest-common-ancestor-of-a-binary-tree" },
      { name:"LC 98 Validate Binary Search Tree",           difficulty:"M", category:"revision", canonicalKey:"lc:validate-binary-search-tree" },
      { name:"LC 695 Max Area of Island",                   difficulty:"M", category:"stretch", canonicalKey:"lc:max-area-of-island" },
      { name:"LC 130 Surrounded Regions",                   difficulty:"M", category:"stretch", canonicalKey:"lc:surrounded-regions" },
      { name:"LC 1091 Shortest Path in Binary Matrix",      difficulty:"M", category:"stretch", canonicalKey:"lc:shortest-path-in-binary-matrix" },
    ],
    milestone:"Grid BFS/DFS automatic" },

  { date:"2026-08-17", label:"Mon Aug 17 · Day 4 · Graphs II — topo sort, union-find, cycles · MOCK #2",
    tasks:[
      ["oth","Working window 10:00–17:30 — everything lands before the stop; nothing gets pushed to tonight"],
      ["dsa","Block A template drill (30 min): Kahn topo sort, DisjointSet struct, 3-state directed cycle detection"],
      ["cpp","Write the DisjointSet struct from memory three times — union by size + path compression, no peeking"],
      ["dsa","Block B recall reps (15 min): re-derive LC 994 multi-source seeding and LC 133 map-as-visited-set"],
      ["dsa","Block D MOCK #2 (45 min timed, ~14:00) — LC 752, BFS on an implicit graph, neighbours generated on the fly"],
      ["dsa","Mock protocol: cold, recorded, doc only — edge cases deadends containing start, target 0000, unreachable target"],
      ["dsa","Mock review (30 min): same three counts vs Saturday — the silences should be dropping"],
      ["res","Block E side track (25 min): write the Why Google answer around one verifiable specific artifact; pick 5 questions for the interviewer"],
      ["oth","Block F mistake log · hard stop 17:30 · eat properly, it is a long night"],
      ["oth","Warm-up 19:30 → Ebullient pen-and-paper OA 20:00 · warm-up 22:00 → Salesforce OA 22:30"],
      ["oth","Finishing past midnight — sleep immediately after, review nothing"],
    ],
    problems:[
      { name:"LC 207 Course Schedule",                          difficulty:"M", category:"new", canonicalKey:"lc:course-schedule" },
      { name:"LC 210 Course Schedule II",                       difficulty:"M", category:"new", canonicalKey:"lc:course-schedule-ii" },
      { name:"LC 547 Number of Provinces",                      difficulty:"M", category:"new", canonicalKey:"lc:number-of-provinces" },
      { name:"LC 684 Redundant Connection",                     difficulty:"M", category:"new", canonicalKey:"lc:redundant-connection" },
      { name:"LC 752 Open the Lock",                            difficulty:"M", category:"new", canonicalKey:"lc:open-the-lock" },
      { name:"LC 994 Rotting Oranges",                          difficulty:"M", category:"revision", canonicalKey:"lc:rotting-oranges" },
      { name:"LC 133 Clone Graph",                              difficulty:"M", category:"revision", canonicalKey:"lc:clone-graph" },
      { name:"LC 424 Longest Repeating Character Replacement",  difficulty:"M", category:"revision", canonicalKey:"lc:longest-repeating-character-replacement" },
      { name:"LC 560 Subarray Sum Equals K",                    difficulty:"M", category:"revision", canonicalKey:"lc:subarray-sum-equals-k" },
      { name:"LC 802 Find Eventual Safe States",                difficulty:"M", category:"stretch", canonicalKey:"lc:find-eventual-safe-states" },
      { name:"LC 721 Accounts Merge",                           difficulty:"M", category:"stretch", canonicalKey:"lc:accounts-merge" },
      { name:"LC 785 Is Graph Bipartite",                       difficulty:"M", category:"stretch", canonicalKey:"lc:is-graph-bipartite" },
    ],
    milestone:"Mock #2 done" },

  { date:"2026-08-18", label:"Tue Aug 18 · Day 5 · Recursion and backtracking, stacks, heaps",
    tasks:[
      ["dsa","Block A drill (30 min) — backtracking choose/explore/un-choose, monotonic stack, min-heap decl written 3x"],
      ["dsa","Block B recall reps (15 min) — Kahn topological sort from LC 207 and DisjointSet from LC 684, cold"],
      ["dsa","Block D no-IDE rep (45 min) on LC 78 — backtracking and bitmask, then 2 sentences on which you would pick"],
      ["cpp","priority_queue — greater<int> gives a MIN-heap, opposite of sort; the most common under-pressure C++ bug"],
      ["res","Block E side track (30 min) — AI fluency session 1: fill all five story slots, manufacture any empty one"],
      ["dsa","Block F — mistake log entries"],
      ["oth","Window 11:00–17:30, late start by design; if wrecked cut the if-time list entirely — never cut sleep"],
      ["oth","Hard stop 17:30 · warm-up 19:30 · Arcesium OA 20:00 · then sleep, tomorrow starts early"],
    ],
    problems:[
      { name:"LC 78 Subsets",                           difficulty:"M", category:"new", canonicalKey:"lc:subsets" },
      { name:"LC 46 Permutations",                      difficulty:"M", category:"new", canonicalKey:"lc:permutations" },
      { name:"LC 39 Combination Sum",                   difficulty:"M", category:"new", canonicalKey:"lc:combination-sum" },
      { name:"LC 79 Word Search",                       difficulty:"M", category:"new", canonicalKey:"lc:word-search" },
      { name:"LC 215 Kth Largest Element in an Array",  difficulty:"M", category:"new", canonicalKey:"lc:kth-largest-element-in-an-array" },
      { name:"LC 739 Daily Temperatures",               difficulty:"M", category:"new", canonicalKey:"lc:daily-temperatures" },
      { name:"LC 207 Course Schedule",                  difficulty:"M", category:"revision", canonicalKey:"lc:course-schedule" },
      { name:"LC 684 Redundant Connection",             difficulty:"M", category:"revision", canonicalKey:"lc:redundant-connection" },
      { name:"LC 704 Binary Search",                    difficulty:"E", category:"revision", canonicalKey:"lc:binary-search" },
      { name:"LC 22 Generate Parentheses",              difficulty:"M", category:"stretch", canonicalKey:"lc:generate-parentheses" },
      { name:"LC 347 Top K Frequent Elements",          difficulty:"M", category:"stretch", canonicalKey:"lc:top-k-frequent-elements" },
      { name:"LC 973 K Closest Points to Origin",       difficulty:"M", category:"stretch", canonicalKey:"lc:k-closest-points-to-origin" },
      { name:"LC 208 Implement Trie",                   difficulty:"M", category:"stretch", canonicalKey:"lc:implement-trie-prefix-tree" },
    ],
    milestone:"Backtracking + heaps fluent" },

  { date:"2026-08-19", label:"Wed Aug 19 · Day 6 · MOCK #3 first, then binary search on answer, intervals, greedy",
    tasks:[
      ["dsa","Block D MOCK #3 (50 min, 09:30–10:20) — full dress rehearsal, run the ENTIRE ritual while fresh"],
      ["dsa","09:30–09:34 camera on, earphones in, quiet room — deliver the intro cold, out loud"],
      ["dsa","09:34–10:14 LC 1268 in the doc — simple approach first, then offer the trie"],
      ["dsa","10:14–10:20 ask your two questions for the interviewer out loud, as if they were there"],
      ["dsa","Mock review (40 min) — recording, three counts, vs Saturday and Monday; then no new material"],
      ["dsa","Block A drill (25 min) — first-true binary search, search-on-answer isFeasible, merge intervals, lambda sort"],
      ["dsa","Block B (15 min) — re-derive LC 78 and LC 79 on paper · Block F mistake log entries"],
      ["res","Block E — pick the closing questions, rehearse the AI-fluency answers out loud"],
      ["cpp","sort comparator must return strict less-than, never <= — <= is undefined behaviour and can crash std::sort"],
      ["oth","Window 09:30–16:30 — last real working day and the most compressed; the mock goes first, while fresh"],
      ["oth","HARD STOP 16:30 — five minutes and start · Flipkart OA 17:00 · Accenture ML+GN 19:00 · nothing after"],
    ],
    problems:[
      { name:"LC 875 Koko Eating Bananas",                       difficulty:"M", category:"new", canonicalKey:"lc:koko-eating-bananas" },
      { name:"LC 1011 Capacity To Ship Packages Within D Days",  difficulty:"M", category:"new", canonicalKey:"lc:capacity-to-ship-packages-within-d-days" },
      { name:"LC 33 Search in Rotated Sorted Array",             difficulty:"M", category:"new", canonicalKey:"lc:search-in-rotated-sorted-array" },
      { name:"LC 56 Merge Intervals",                            difficulty:"M", category:"new", canonicalKey:"lc:merge-intervals" },
      { name:"LC 57 Insert Interval",                            difficulty:"M", category:"new", canonicalKey:"lc:insert-interval" },
      { name:"LC 1268 Search Suggestions System",                difficulty:"M", category:"new", canonicalKey:"lc:search-suggestions-system" },
      { name:"LC 1466 Reorder Routes to City Zero",              difficulty:"M", category:"stretch", canonicalKey:"lc:reorder-routes-to-make-all-paths-lead-to-the-city-zero" },
      { name:"LC 78 Subsets",                                    difficulty:"M", category:"revision", canonicalKey:"lc:subsets" },
      { name:"LC 79 Word Search",                                difficulty:"M", category:"revision", canonicalKey:"lc:word-search" },
      { name:"LC 238 Product of Array Except Self",              difficulty:"M", category:"revision", canonicalKey:"lc:product-of-array-except-self" },
      { name:"LC 128 Longest Consecutive Sequence",              difficulty:"M", category:"revision", canonicalKey:"lc:longest-consecutive-sequence" },
      { name:"LC 1094 Car Pooling",                      difficulty:"M", category:"revision", canonicalKey:"lc:car-pooling" },
      { name:"LC 435 Non-overlapping Intervals",                 difficulty:"M", category:"stretch", canonicalKey:"lc:non-overlapping-intervals" },
      { name:"LC 134 Gas Station",                               difficulty:"M", category:"stretch", canonicalKey:"lc:gas-station" },
    ],
    milestone:"Mock #3 done · dress rehearsal clean" },

  { date:"2026-08-20", label:"Thu Aug 20 · Day 7 · LIGHT — consolidation only",
    tasks:[
      ["dsa","Template rewrite marathon (45 min): 26 pattern skeletons from memory in one sitting, then diff and mark gaps"],
      ["dsa","Re-solve from memory (45 min), 10 min each — LC 200, 102, 207, 78; over 12 min → rewrite that skeleton twice"],
      ["dsa","Read the mistake log end to end (25 min) — all of it, no skimming"],
      ["cpp","Read the C++ gotcha sheet once, slowly — substr length not end index, size() unsigned, helpers above callers"],
      ["dsa","One easy problem to end on a win (20 min) — nothing harder; close the week clean, fast, correct"],
      ["res","Side track (20 min): AI fluency 2 — 90-second workflow monologue out loud, timed, then 5 cold-recall HR items"],
      ["oth","Logistics · tech-failure prep (15 min): camera, mic, hotspot, links saved offline, recruiter number on paper"],
      ["oth","Charger, earphones, water, quiet room booked, Meet and doc links in the calendar, invite acknowledged"],
      ["oth","Then stop — no LeetCode after 19:00, none. Walk, eat properly, in bed by 22:30"],
    ],
    problems:[
      { name:"LC 200 Number of Islands",                 difficulty:"M", category:"revision", canonicalKey:"lc:number-of-islands" },
      { name:"LC 102 Binary Tree Level Order Traversal", difficulty:"M", category:"revision", canonicalKey:"lc:binary-tree-level-order-traversal" },
      { name:"LC 207 Course Schedule",                   difficulty:"M", category:"revision", canonicalKey:"lc:course-schedule" },
      { name:"LC 78 Subsets",                            difficulty:"M", category:"revision", canonicalKey:"lc:subsets" },
      { name:"LC 733 Flood Fill",                        difficulty:"E", category:"revision", canonicalKey:"lc:flood-fill" },
      { name:"LC 104 Maximum Depth of Binary Tree",      difficulty:"E", category:"revision", canonicalKey:"lc:maximum-depth-of-binary-tree" },
    ],
    milestone:"Ready · templates cold-recalled" },

  { date:"2026-08-21", label:"Fri Aug 21 · GOOGLE INTERVIEW · two rounds, Meet + shared doc, C++",
    tasks:[
      ["oth","T−60: eat light, close every app that pushes notifications, phone on silent and face down"],
      ["oth","T−60: phone out of reach but reachable if they call — recruiter number visible on the screen"],
      ["oth","T−60: quiet room, door shut, no background noise. Light on your face, window in front not behind"],
      ["oth","T−30: open only the Meet link, the interview doc and the protocol sheet. No LeetCode, no new problems"],
      ["res","T−30: 90-second intro out loud, standing, timed. Then one approach comparison — warm the voice up first"],
      ["oth","T−5: camera, mic, earphones, video on, head-and-shoulders frame. Water, pen, paper. Join 1–2 min early"],
      ["dsa","In-round: restate the problem first. Two approaches with complexities and a check-in before typing"],
      ["dsa","In-round: say what you are about to write, then write it. Announce every pause longer than 15 seconds"],
      ["dsa","In-round: at T+30 stop coding and start the dry run, whatever state the code is in — protect the last 8 min"],
      ["cpp","In-doc: assumptions block at top, helpers above callers, close braces immediately, std::swap not a temp"],
      ["res","Close: ask two of your four prepared questions, react to the answers, thank them by name"],
      ["oth","Between rounds (15–30 min): stand, walk, water. No post-mortem, no lookups — reset the doc scaffolding"],
      ["oth","After: within 20 minutes write down both problems, what you said, where you stalled, every hint given"],
    ],
    milestone:"Google interview · rounds 1 and 2" },
]

/**
 * Interview-day logistics, run the night before and on the morning of
 * Fri 21 Aug 2026. Replaced the resume-editing checklist on 2026-08-14 (the
 * resume was frozen Jul 30) — the old `resume:<slug>` rows are orphaned.
 *
 * `checkId.resume` slices the slug at 48 chars, so every item below must stay
 * distinct within its first 48 slug characters or two rows share one id.
 */
export const RESUME_ITEMS: string[] = [
  "Find the Meet invite in personal email — confirm date, time, Meet link and interview doc link",
  "Open the interview doc link now to confirm access — if it 403s, email the recruiter tonight",
  "Acknowledge the calendar invite and add a 60-minute-before alert",
  "Charge laptop, phone and earphones — leave the charger by the desk",
  "Test the mobile hotspot, and save both links outside the browser",
  "Write the recruiter's number on paper and leave it next to the desk",
  "Block the whole afternoon — round 2 can follow within 15–30 min of round 1",
  "Clear the desk: water, pen, blank paper for scratch you don't want in the shared doc",
  "Test camera and mic, frame head and shoulders, light in front of you not behind",
  "Lay out plain clothes — presentable, not formal; plain colours read better on camera",
]

/**
 * The fallback 20: if the week collapses to a single day, do exactly these, in
 * this order. No two of them teach the same skeleton. All carry a canonicalKey,
 * so they auto-tick from solved_problems the same way DAYS problems do — but
 * they get their own id family (`checkId.core`), distinct from any day's rows.
 */
export const CORE_SET: DsaProblem[] = [
  { name: "LC 3 Longest Substring Without Repeating Characters", difficulty: "M", category: "revision", canonicalKey:"lc:longest-substring-without-repeating-characters" },
  { name: "LC 560 Subarray Sum Equals K",                        difficulty: "M", category: "revision", canonicalKey:"lc:subarray-sum-equals-k" },
  { name: "LC 15 3Sum",                                          difficulty: "M", category: "revision", canonicalKey:"lc:3sum" },
  { name: "LC 704 Binary Search",                                difficulty: "E", category: "revision", canonicalKey:"lc:binary-search" },
  { name: "LC 875 Koko Eating Bananas",                          difficulty: "M", category: "revision", canonicalKey:"lc:koko-eating-bananas" },
  { name: "LC 56 Merge Intervals",                               difficulty: "M", category: "revision", canonicalKey:"lc:merge-intervals" },
  { name: "LC 739 Daily Temperatures",                           difficulty: "M", category: "revision", canonicalKey:"lc:daily-temperatures" },
  { name: "LC 104 Maximum Depth of Binary Tree",                 difficulty: "E", category: "revision", canonicalKey:"lc:maximum-depth-of-binary-tree" },
  { name: "LC 543 Diameter of Binary Tree",                      difficulty: "E", category: "revision", canonicalKey:"lc:diameter-of-binary-tree" },
  { name: "LC 236 Lowest Common Ancestor of a Binary Tree",      difficulty: "M", category: "revision", canonicalKey:"lc:lowest-common-ancestor-of-a-binary-tree" },
  { name: "LC 98 Validate Binary Search Tree",                   difficulty: "M", category: "revision", canonicalKey:"lc:validate-binary-search-tree" },
  { name: "LC 102 Binary Tree Level Order Traversal",            difficulty: "M", category: "revision", canonicalKey:"lc:binary-tree-level-order-traversal" },
  { name: "LC 105 Construct Binary Tree from Preorder and Inorder Traversal", difficulty: "M", category: "revision", canonicalKey:"lc:construct-binary-tree-from-preorder-and-inorder-traversal" },
  { name: "LC 200 Number of Islands",                            difficulty: "M", category: "revision", canonicalKey:"lc:number-of-islands" },
  { name: "LC 994 Rotting Oranges",                              difficulty: "M", category: "revision", canonicalKey:"lc:rotting-oranges" },
  { name: "LC 133 Clone Graph",                                  difficulty: "M", category: "revision", canonicalKey:"lc:clone-graph" },
  { name: "LC 207 Course Schedule",                              difficulty: "M", category: "revision", canonicalKey:"lc:course-schedule" },
  { name: "LC 684 Redundant Connection",                         difficulty: "M", category: "revision", canonicalKey:"lc:redundant-connection" },
  { name: "LC 78 Subsets",                                       difficulty: "M", category: "revision", canonicalKey:"lc:subsets" },
  { name: "LC 79 Word Search",                                   difficulty: "M", category: "revision", canonicalKey:"lc:word-search" },
]

/**
 * One checkable item in the standalone Google DSA revision panel.
 *
 * `canonicalKey` is required (unlike DsaProblem, where the 5 Striver entries
 * legitimately have none): every Core-50 problem maps to LeetCode, so the
 * revision family never needs a slugify fallback and its id space cannot fork.
 */
export type GoogleRevisionProblem = {
  /** 1-based priority across the whole Core 50 — this IS the order to work it. */
  priority: number;
  name: string;
  difficulty: 'E' | 'M' | 'H';
  /** 'lc:<titleSlug>' — the sole link to solved_problems. */
  canonicalKey: string;
  /** Technique / recall cue shown under the name. */
  cue?: string;
}

export type GoogleRevisionPriority = "must" | "should" | "algorithm" | "recognition"

/** A compact concept-recall entry in the reference half of the panel. */
export type GoogleRevisionConcept = {
  name: string;
  /** Recognition cue — what lights the pattern up, not the full skeleton. */
  tell: string;
}

/** The two groups the panel renders: the checkable Core 45 and the five extras. */
export const GOOGLE_REVISION_GROUPS = [
  { id: 'core', label: 'Core 45', hint: 'the checkable core, in priority order' },
  { id: 'extras', label: 'Extras', hint: 'five more — same auto-tick rules' },
] as const

/** Core 45 — items 1–45 of the Core 50, in priority order. */
export const GOOGLE_REVISION_CORE: GoogleRevisionProblem[] = [
  { priority: 1,  name: "LC 238 Product of Array Except Self",                difficulty: "M", canonicalKey: "lc:product-of-array-except-self",                            cue: "prefix·suffix, no division" },
  { priority: 2,  name: "LC 128 Longest Consecutive Sequence",                difficulty: "M", canonicalKey: "lc:longest-consecutive-sequence",                            cue: "hash set of starts" },
  { priority: 3,  name: "LC 560 Subarray Sum Equals K",                       difficulty: "M", canonicalKey: "lc:subarray-sum-equals-k",                                   cue: "prefix sum + hash" },
  { priority: 4,  name: "LC 15 3Sum",                                         difficulty: "M", canonicalKey: "lc:3sum",                                                    cue: "sort + two pointers" },
  { priority: 5,  name: "LC 42 Trapping Rain Water",                          difficulty: "H", canonicalKey: "lc:trapping-rain-water",                                      cue: "two pointers / maxL·maxR" },
  { priority: 6,  name: "LC 3 Longest Substring Without Repeating Characters", difficulty: "M", canonicalKey: "lc:longest-substring-without-repeating-characters",           cue: "sliding window + set" },
  { priority: 7,  name: "LC 76 Minimum Window Substring",                     difficulty: "H", canonicalKey: "lc:minimum-window-substring",                                 cue: "sliding window + counts" },
  { priority: 8,  name: "LC 239 Sliding Window Maximum",                      difficulty: "H", canonicalKey: "lc:sliding-window-maximum",                                  cue: "monotonic deque" },
  { priority: 9,  name: "LC 33 Search in Rotated Sorted Array",               difficulty: "M", canonicalKey: "lc:search-in-rotated-sorted-array",                          cue: "binary search on rotated" },
  { priority: 10, name: "LC 875 Koko Eating Bananas",                         difficulty: "M", canonicalKey: "lc:koko-eating-bananas",                                      cue: "binary search on answer" },
  { priority: 11, name: "LC 1011 Capacity to Ship Packages Within D Days",    difficulty: "M", canonicalKey: "lc:capacity-to-ship-packages-within-d-days",                 cue: "binary search on answer" },
  { priority: 12, name: "LC 410 Split Array Largest Sum",                     difficulty: "H", canonicalKey: "lc:split-array-largest-sum",                                   cue: "binary search on answer" },
  { priority: 13, name: "LC 84 Largest Rectangle in Histogram",               difficulty: "H", canonicalKey: "lc:largest-rectangle-in-histogram",                           cue: "monotonic stack" },
  { priority: 14, name: "LC 739 Daily Temperatures",                          difficulty: "M", canonicalKey: "lc:daily-temperatures",                                        cue: "monotonic stack" },
  { priority: 15, name: "LC 215 Kth Largest Element in an Array",             difficulty: "M", canonicalKey: "lc:kth-largest-element-in-an-array",                          cue: "heap / quickselect" },
  { priority: 16, name: "LC 295 Find Median From Data Stream",                difficulty: "H", canonicalKey: "lc:find-median-from-data-stream",                              cue: "two heaps" },
  { priority: 17, name: "LC 23 Merge K Sorted Lists",                         difficulty: "H", canonicalKey: "lc:merge-k-sorted-lists",                                     cue: "heap merge" },
  { priority: 18, name: "LC 56 Merge Intervals",                              difficulty: "M", canonicalKey: "lc:merge-intervals",                                          cue: "sort by start" },
  { priority: 19, name: "LC 435 Non-overlapping Intervals",                   difficulty: "M", canonicalKey: "lc:non-overlapping-intervals",                               cue: "greedy by end" },
  { priority: 20, name: "LC 102 Binary Tree Level Order Traversal",           difficulty: "M", canonicalKey: "lc:binary-tree-level-order-traversal",                      cue: "BFS level_size" },
  { priority: 21, name: "LC 543 Diameter of Binary Tree",                     difficulty: "E", canonicalKey: "lc:diameter-of-binary-tree",                                 cue: "DFS return height" },
  { priority: 22, name: "LC 236 Lowest Common Ancestor of a Binary Tree",     difficulty: "M", canonicalKey: "lc:lowest-common-ancestor-of-a-binary-tree",                 cue: "DFS left/right/mid" },
  { priority: 23, name: "LC 98 Validate Binary Search Tree",                  difficulty: "M", canonicalKey: "lc:validate-binary-search-tree",                             cue: "DFS with bounds" },
  { priority: 24, name: "LC 230 Kth Smallest Element in a BST",               difficulty: "M", canonicalKey: "lc:kth-smallest-element-in-a-bst",                            cue: "inorder / follow" },
  { priority: 25, name: "LC 124 Binary Tree Maximum Path Sum",                difficulty: "H", canonicalKey: "lc:binary-tree-maximum-path-sum",                            cue: "DFS gain" },
  { priority: 26, name: "LC 863 All Nodes Distance K in Binary Tree",         difficulty: "M", canonicalKey: "lc:all-nodes-distance-k-in-binary-tree",                    cue: "tree→graph + BFS" },
  { priority: 27, name: "LC 297 Serialize and Deserialize Binary Tree",       difficulty: "H", canonicalKey: "lc:serialize-and-deserialize-binary-tree",                  cue: "preorder + queue" },
  { priority: 28, name: "LC 200 Number of Islands",                           difficulty: "M", canonicalKey: "lc:number-of-islands",                                       cue: "grid DFS/BFS" },
  { priority: 29, name: "LC 994 Rotting Oranges",                             difficulty: "M", canonicalKey: "lc:rotting-oranges",                                         cue: "multi-source BFS" },
  { priority: 30, name: "LC 127 Word Ladder",                                 difficulty: "H", canonicalKey: "lc:word-ladder",                                             cue: "BFS + patterns" },
  { priority: 31, name: "LC 207 Course Schedule",                             difficulty: "M", canonicalKey: "lc:course-schedule",                                         cue: "DFS cycle / topo" },
  { priority: 32, name: "LC 210 Course Schedule II",                          difficulty: "M", canonicalKey: "lc:course-schedule-ii",                                      cue: "Kahn topo" },
  { priority: 33, name: "LC 785 Is Graph Bipartite",                          difficulty: "M", canonicalKey: "lc:is-graph-bipartite",                                      cue: "2-color BFS/DFS" },
  { priority: 34, name: "LC 684 Redundant Connection",                        difficulty: "M", canonicalKey: "lc:redundant-connection",                                    cue: "DSU" },
  { priority: 35, name: "LC 743 Network Delay Time",                          difficulty: "M", canonicalKey: "lc:network-delay-time",                                      cue: "Dijkstra" },
  { priority: 36, name: "LC 778 Swim in Rising Water",                        difficulty: "H", canonicalKey: "lc:swim-in-rising-water",                                    cue: "Dijkstra / binary search" },
  { priority: 37, name: "LC 1584 Min Cost to Connect All Points",             difficulty: "M", canonicalKey: "lc:min-cost-to-connect-all-points",                          cue: "MST (Prim/Kruskal)" },
  { priority: 38, name: "LC 399 Evaluate Division",                           difficulty: "M", canonicalKey: "lc:evaluate-division",                                       cue: "graph + BFS/DFS / DSU" },
  { priority: 39, name: "LC 78 Subsets",                                      difficulty: "M", canonicalKey: "lc:subsets",                                                 cue: "backtracking" },
  { priority: 40, name: "LC 39 Combination Sum",                              difficulty: "M", canonicalKey: "lc:combination-sum",                                         cue: "backtracking" },
  { priority: 41, name: "LC 79 Word Search",                                  difficulty: "M", canonicalKey: "lc:word-search",                                             cue: "backtracking + grid" },
  { priority: 42, name: "LC 208 Implement Trie",                              difficulty: "M", canonicalKey: "lc:implement-trie-prefix-tree",                              cue: "trie" },
  { priority: 43, name: "LC 1368 Minimum Cost to Make at Least One Valid Path in a Grid", difficulty: "H", canonicalKey: "lc:minimum-cost-to-make-at-least-one-valid-path-in-a-grid", cue: "0-1 BFS" },
  { priority: 44, name: "LC 1192 Critical Connections in a Network",          difficulty: "H", canonicalKey: "lc:critical-connections-in-a-network",                       cue: "Tarjan bridges" },
  { priority: 45, name: "LC 332 Reconstruct Itinerary",                       difficulty: "H", canonicalKey: "lc:reconstruct-itinerary",                                  cue: "Hierholzer Eulerian" },
]

/** Extras — items 46–50. Same auto-tick / override rules as the Core 45. */
export const GOOGLE_REVISION_EXTRAS: GoogleRevisionProblem[] = [
  { priority: 46, name: "LC 287 Find the Duplicate Number",                   difficulty: "M", canonicalKey: "lc:find-the-duplicate-number",                            cue: "Floyd cycle" },
  { priority: 47, name: "LC 417 Pacific Atlantic Water Flow",                 difficulty: "M", canonicalKey: "lc:pacific-atlantic-water-flow",                          cue: "multi-source BFS/DFS" },
  { priority: 48, name: "LC 721 Accounts Merge",                              difficulty: "M", canonicalKey: "lc:accounts-merge",                                          cue: "DSU" },
  { priority: 49, name: "LC 2251 Number of Flowers in Full Bloom",            difficulty: "H", canonicalKey: "lc:number-of-flowers-in-full-bloom",                       cue: "sweep line / binary search" },
  { priority: 50, name: "LC 307 Range Sum Query Mutable",                     difficulty: "M", canonicalKey: "lc:range-sum-query-mutable",                                cue: "Fenwick / segment tree" },
]

/** Core 45 + extras, flattened for the auto-tick pass and the done count. */
export const GOOGLE_REVISION_ALL: GoogleRevisionProblem[] = [
  ...GOOGLE_REVISION_CORE,
  ...GOOGLE_REVISION_EXTRAS,
]

/** Priority labels from the supplied revision list. */
export function googleRevisionTier(priority: number): GoogleRevisionPriority {
  if ([12, 27, 38, 43, 44, 45, 46, 47, 48].includes(priority)) return "should"
  if ([49, 50].includes(priority)) return "algorithm"
  return "must"
}

export type GoogleRevisionConceptGroup = GoogleRevisionConcept & {
  items: GoogleRevisionProblem[]
}

function revisionItems(...priorities: number[]): GoogleRevisionProblem[] {
  return priorities.map((priority) => GOOGLE_REVISION_ALL[priority - 1])
}

/** The checkable problems grouped by the concept they are meant to retrieve. */
export const GOOGLE_REVISION_CONCEPT_GROUPS: GoogleRevisionConceptGroup[] = [
  { name: "Arrays + hashing", tell: "prefix/suffix, prefix state, membership", items: revisionItems(1, 2, 3) },
  { name: "Two pointers", tell: "sort, scan from both ends, preserve invariants", items: revisionItems(4, 5) },
  { name: "Sliding window + deque", tell: "fixed/variable windows and monotonic candidates", items: revisionItems(6, 7, 8) },
  { name: "Binary search", tell: "boundaries, rotated arrays, monotonic answer predicates", items: revisionItems(9, 10, 11, 12) },
  { name: "Monotonic stack", tell: "nearest greater/smaller and span", items: revisionItems(13, 14) },
  { name: "Heap + priority queue", tell: "top-k, k-way merge, two-heap median", items: revisionItems(15, 16, 17) },
  { name: "Intervals + greedy", tell: "sort by start to merge, by end to keep the most", items: revisionItems(18, 19) },
  { name: "Trees", tell: "return information from children, BST invariants, tree-to-graph", items: revisionItems(20, 21, 22, 23, 24, 25, 26, 27) },
  { name: "Grids + traversal", tell: "visited discipline, multi-source BFS, reverse reachability", items: revisionItems(28, 29, 47) },
  { name: "Graph dependencies + DSU", tell: "topological order, coloring, connectivity", items: revisionItems(30, 31, 32, 33, 34, 48) },
  { name: "Shortest paths + MST", tell: "Dijkstra, 0-1 BFS, Prim/Kruskal", items: revisionItems(35, 36, 37, 38, 43) },
  { name: "Backtracking + trie", tell: "choose, explore, undo; prefix pruning", items: revisionItems(39, 40, 41, 42) },
  { name: "Advanced graph algorithms", tell: "Floyd cycle, Tarjan bridges, Eulerian traversal", items: revisionItems(44, 45, 46) },
  { name: "Sweep line + range structures", tell: "ordered events, Fenwick/segment tree exposure", items: revisionItems(49, 50) },
]

/**
 * The broader algorithm recall, preserved from the supplied concept list as a
 * compact reference. Not checkable — this is the "recognise the pattern" half of
 * the panel, while the Core 50 above is the "prove you can still write it" half.
 */
export const GOOGLE_REVISION_CONCEPTS: GoogleRevisionConcept[] = [
  { name: "Arrays & hash",            tell: "seen-before / count / group / complement; prefix sums for range and subarray-sum-to-k" },
  { name: "Two pointers",             tell: "opposite ends on sorted arrays; fast–slow for list cycle / midpoint / nth-from-end" },
  { name: "Sliding window",           tell: "contiguous + optimum + monotone validity; fixed k; negatives → prefix sums" },
  { name: "Binary search",            tell: "bounds (first/last) on sorted; search-on-answer with an isFeasible helper" },
  { name: "Sorting & quickselect",    tell: "nth order statistic via partition; O(n) average, O(1) extra" },
  { name: "Intervals & greedy",       tell: "sort-by-start to merge, sort-by-end to maximise non-overlap; strict < comparator" },
  { name: "Stacks",                   tell: "balanced / evaluate; LIFO structure for undo-style problems" },
  { name: "Monotonic stack / deque",  tell: "next-greater / prev-smaller, histogram; window max in O(1) amortised" },
  { name: "Heaps",                    tell: "top-k, merge-k, running median with two heaps; greater<> gives a MIN-heap" },
  { name: "Linked lists & Floyd",     tell: "cycle detection, entry point, duplicate-number trick" },
  { name: "Trees & tree-to-graph",    tell: "add parent pointers, then BFS out — distance-k, burn-tree" },
  { name: "Graph DFS/BFS & multi-source", tell: "components, shortest unweighted; seed all sources at once" },
  { name: "Directed / undirected cycle", tell: "3-state DFS, DSU, or topo size check" },
  { name: "Topo / Kahn",              tell: "indegree queue; processed < n ⇔ cycle" },
  { name: "Bipartite",                tell: "2-coloring, no same-colour neighbours" },
  { name: "DSU",                      tell: "union by size + path compression, ~O(1) amortised" },
  { name: "Dijkstra",                 tell: "non-negative weights, min-heap of (dist, node)" },
  { name: "0-1 BFS",                  tell: "0/1 edge weights — deque, push front on 0" },
  { name: "Bellman-Ford",             tell: "k-stops / negative weights, relax |V|−1 times" },
  { name: "Floyd-Warshall",           tell: "all-pairs, O(V³)" },
  { name: "MST",                      tell: "Prim (heap) or Kruskal (DSU) on min-cost connect" },
  { name: "SCC",                      tell: "Kosaraju / Tarjan on strongly connected components" },
  { name: "Tarjan",                   tell: "bridges / articulation via disc-low" },
  { name: "Eulerian",                 tell: "Hierholzer — build itinerary from Euler path" },
  { name: "Backtracking",             tell: "choose → explore → un-choose; subsets / permutations / combinations" },
  { name: "Trie",                     tell: "prefix queries, autocomplete, wildcard word search" },
  { name: "Sweep line",               tell: "sort events, maintain an active set" },
  { name: "Fenwick",                  tell: "prefix sums with point updates" },
  { name: "Segment tree",             tell: "range queries + updates, lazy where needed" },
  { name: "Bits",                     tell: "xor tricks, masks, powers of two" },
  { name: "KMP / Z / rolling hash",   tell: "pattern matching in O(n+m)" },
  { name: "Basic DP",                 tell: "1D/2D/knapsack, LIS / LCS, memoise the state that repeats" },
]

export const TAG_LABELS: Record<Tag, string> = {
  dsa: "DSA",
  cpp: "C++",
  res: "RES",
  oth: "OTH",
}

/** Number of phases in PHASES. Use this instead of hardcoding a count. */
export const PHASE_COUNT = PHASES.length

/** lowercase · non-alphanumerics -> '-' · collapse repeats · trim leading/trailing '-' */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * The single source of truth for check IDs.
 * Nothing else in the codebase may construct an ID.
 */
export const checkId = {
  task: (date: string, i: number) => `task:${date}:${i}`,
  problem: (date: string, p: DsaProblem) =>
    `prob:${date}:${p.canonicalKey ?? slugify(p.name)}`,
  // CORE_SET family — same "never a template literal elsewhere" rule as the rest.
  core: (p: DsaProblem) => `core:${p.canonicalKey ?? slugify(p.name)}`,
  // Google revision family — every item is LeetCode-mappable, so canonicalKey is
  // required and there is no slugify fallback to fork the id space on.
  googleRevision: (p: GoogleRevisionProblem) => `grev:${p.canonicalKey}`,
  googleRevisionKey: (canonicalKey: string) => `grev:${canonicalKey}`,
  phase: (p: PhaseEntry) => `phase:${slugify(p.name)}`,
  resume: (text: string) => `resume:${slugify(text).slice(0, 48)}`,
}

/**
 * Public URL for a plan problem, or `null` when there is nowhere to send the
 * user. Derived from `canonicalKey`, which `scripts/resolve-plan-keys.ts`
 * populates for the 145 of 150 problems that carry an `LC <number>` prefix —
 * the 5 `(Striver)` entries have no LeetCode equivalent and return `null`.
 *
 * Keys are `lc:<titleSlug>`, and leetcode.com/problems/<titleSlug>/ is the
 * canonical problem URL, so this is a pure string derivation — no lookup.
 */
export function problemUrl(p: { canonicalKey?: string }): string | null {
  const key = p.canonicalKey
  if (!key || !key.startsWith("lc:")) return null
  return `https://leetcode.com/problems/${key.slice(3)}/`
}

/** The plan owner's calendar zone, independent of the browser/server runtime zone. */
export const PLAN_TZ = "Asia/Kolkata"

/** Local-date 'YYYY-MM-DD'. MUST NOT use toISOString() — that is UTC and rolls over at the wrong time. */
export function localDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}
