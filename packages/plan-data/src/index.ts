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

export const PHASES: PhaseEntry[] = [
  { name: "1 · Exact-match cache",   dates: "Jul 19",   desc: "CMake skeleton + GitHub repo · CLI: prompt → hash lookup → API on miss (libcurl + nlohmann/json)" },
  { name: "2 · Semantic layer",      dates: "Jul 20",   desc: "Embedding client · flat vector store · scalar cosine · similarity threshold → hit/miss" },
  { name: "3 · SIMD kernel",         dates: "Jul 21",   desc: "AVX2 cosine · 32-byte alignment · benchmark vs scalar (record the speedup)" },
  { name: "4 · Cost-aware eviction", dates: "Jul 22",   desc: "Greedy-Dual-Size policy · memory cap · eviction unit test" },
  { name: "5 · Persistence + concurrency", dates: "Jul 23", desc: "Versioned binary snapshot save/reload · corrupt-file handling · one std::shared_mutex" },
  { name: "6 · Benchmark + README",  dates: "Jul 24",   desc: "Workload replay · hit rate / latency / $ saved · README + fill resume metric placeholders" },
  { name: "Buffer · polish + ship",  dates: "Jul 25–26", desc: "Edge cases · NSW index only if all green · push + polish repo → real metrics to resume" },
]

export const WEEKS: Array<{ label: string; indices: number[] }> = [
  { label: "Setup", indices: [0] },
  { label: "Week 1 · NeetCode 150 (AM 3h DSA) + C++ ramp (PM 1.5h)", indices: [1,2,3,4,5,6,7] },
  { label: "Week 2 · NeetCode finish + C++ build begins (PM 3h)", indices: [8,9,10,11] },
  { label: "Final sprint · C++ ship (3h PM) + new DSA 5/day (AM 2h)", indices: [12,13,14,15,16,17,18,19] },
  { label: "Transit · Tokyo → Delhi → Pilani", indices: [20,21,22] },
  { label: "Settle + mock OAs + OA day", indices: [23,24,25] },
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
]

export const RESUME_ITEMS: string[] = [
  "Add GitHub / LinkedIn / LeetCode links to the header",
  "Reorder skills: C++ first; drop 'Cloud Services' & 'Backend Web Development'",
  "Add C++ Semantic Cache with REAL benchmark numbers (only after Jul 24–25 — never before)",
  "Reorder projects: Semantic Cache → Fest Backend → LLM Fine-Tuning → Hostel Portal",
  "Trim bullets: Fest Backend 5→4 · LLM Fine-Tuning 3→2 · Hostel Portal 3→2",
  "Verify two-liner bullets fill ≥75% of the second line in Superset preview",
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
  phase: (p: PhaseEntry) => `phase:${slugify(p.name)}`,
  resume: (text: string) => `resume:${slugify(text).slice(0, 48)}`,
}

/**
 * Public URL for a plan problem, or `null` when there is nowhere to send the
 * user. Derived from `canonicalKey`, which `scripts/resolve-plan-keys.ts`
 * populates for the 67 of 72 problems that carry an `LC <number>` prefix — the
 * 5 `(Striver)` entries have no LeetCode equivalent and return `null`.
 *
 * Keys are `lc:<titleSlug>`, and leetcode.com/problems/<titleSlug>/ is the
 * canonical problem URL, so this is a pure string derivation — no lookup.
 */
export function problemUrl(p: DsaProblem): string | null {
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
