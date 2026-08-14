import type { ReactNode } from 'react';

type GotchaCard = {
  title: string;
  content: ReactNode;
};

const C = ({ children }: { children: string }) => (
  <code className="font-mono text-[11px]">{children}</code>
);

const GOTCHA_CARDS: GotchaCard[] = [
  {
    title: 'Headers & limits',
    content: (
      <>
        Assume standard headers + <C>{'using namespace std;'}</C>. <C>{'INT_MAX'}</C>/
        <C>{'INT_MIN'}</C>/<C>{'LLONG_MAX'}</C>/<C>{'LLONG_MIN'}</C> come from <C>{'<climits>'}</C>;{' '}
        <C>{'tolower'}</C>/<C>{'isalnum'}</C> from <C>{'<cctype>'}</C>; <C>{'iota'}</C>/
        <C>{'accumulate'}</C> from <C>{'<numeric>'}</C>.
      </>
    ),
  },
  {
    title: 'Vector init — one line',
    content: (
      <>
        <C>{'vector<int> counts(n, 0)'}</C> ·{' '}
        <C>{'vector<vector<int>> grid(rows, vector<int>(cols, 0))'}</C> ·{' '}
        <C>{'vector<int> parent(n); iota(parent.begin(), parent.end(), 0)'}</C> · brace-init{' '}
        <C>{'{{1,2},{3,4}}'}</C>. Never element-by-element <C>{'push_back'}</C>.
      </>
    ),
  },
  {
    title: 'Range-for: auto vs auto&',
    content: (
      <>
        Default <C>{'const auto&'}</C> (no copy). <C>{'auto&'}</C> to mutate.{' '}
        <C>{'for (auto row : grid)'}</C> copies an entire row — a visible, free point lost.{' '}
        <C>{'vector<bool>'}</C> is a proxy: <C>{'auto&'}</C> does NOT compile — use{' '}
        <C>{'auto'}</C> (copy) or index.
      </>
    ),
  },
  {
    title: 'map vs unordered_map',
    content: (
      <>
        <C>{'unordered_map'}</C> = O(1) avg, arbitrary order, no <C>{'pair'}</C>/<C>{'vector'}</C>{' '}
        keys without a custom hasher. <C>{'mp[key]'}</C> on a missing key INSERTS a default — use{' '}
        <C>{'count()'}</C>/<C>{'find()'}</C> to test membership. <C>{'map'}</C> = ordered, O(log n).
      </>
    ),
  },
  {
    title: 'sort with a lambda',
    content: (
      <>
        Return strict <C>{'<'}</C>, NEVER <C>{'<='}</C> — a non-strict comparator is UB and can crash{' '}
        <C>{'std::sort'}</C>. Descending: <C>{'greater<int>()'}</C>. Multi-key: compare first
        field, fall through to second.
      </>
    ),
  },
  {
    title: 'priority_queue comparator',
    content: (
      <>
        Default is a MAX-heap. <C>{'greater<int>'}</C> gives a MIN-heap — the OPPOSITE of{' '}
        <C>{'sort'}</C> (the #1 under-pressure fumble). Pairs:{' '}
        <C>{'priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>>'}</C>.{' '}
        <C>{'pop()'}</C> returns void — read <C>{'top()'}</C> first.
      </>
    ),
  },
  {
    title: 'Strings & chars',
    content: (
      <>
        <C>{'substr(start, LENGTH)'}</C> — second arg is a length, NOT an end index.{' '}
        <C>{'c - \'0\''}</C>, <C>{'\'0\' + n'}</C>, <C>{'c - \'a\''}</C>. char→string:{' '}
        <C>{'string(1, c)'}</C> (not <C>{'string(c)'}</C>). <C>{'stoi'}</C>/<C>{'stoll'}</C>,{' '}
        <C>{'to_string'}</C>.
      </>
    ),
  },
  {
    title: 'tolower / isalnum',
    content: (
      <>
        Cast the arg to <C>{'(unsigned char)'}</C> (negative char is UB) and cast the result back
        to <C>{'(char)'}</C>. Whole string:{' '}
        <C>{'transform(s.begin(), s.end(), s.begin(), ::tolower)'}</C>.
      </>
    ),
  },
  {
    title: 'Structured bindings (C++17)',
    content: (
      <>
        <C>{'auto [a, b] = pair;'}</C> / <C>{'for (const auto& [k, v] : map)'}</C>. Not usable in
        lambda captures. When unsure, <C>{'.first'}</C>/<C>{'.second'}</C> always works and never
        costs anything.
      </>
    ),
  },
  {
    title: 'Integer overflow',
    content: (
      <>
        <C>{'mid = low + (high - low) / 2'}</C> — not <C>{'(low + high) / 2'}</C>.{' '}
        <C>{'(long long)a * b'}</C> — cast BEFORE the multiply. <C>{'accumulate(..., 0LL)'}</C> —
        plain <C>{'0'}</C> accumulates in <C>{'int'}</C>. Signed overflow is UB.
      </>
    ),
  },
  {
    title: 'The rest that bites',
    content: (
      <>
        <C>{'.size()'}</C> is unsigned — always <C>{'(int)s.size()'}</C>. Declare helpers ABOVE
        callers. <C>{'struct TrieNode { ... };'}</C> needs the trailing <C>{';'}</C>.{' '}
        <C>{'std::swap'}</C>, not a temp. <C>{'nullptr'}</C>, not NULL/0. <C>{'max'}</C>/
        <C>{'min'}</C> need matching types. <C>{'pop()'}</C>/<C>{'pop_back()'}</C> return void.
        Pass big containers by <C>{'const&'}</C>. Recursion depth ≈ 1e5 frames.
      </>
    ),
  },
];

/**
 * A condensed "C++ in a doc" gotcha sheet — the recurring pitfalls worth
 * re-reading the morning of an interview. Static body, no section chrome, no
 * props: renders eleven cards in the same grid recipe as `DsaMethodBody`.
 */
export function CppGotchasBody() {
  return (
    <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
      {GOTCHA_CARDS.map(({ title, content }) => (
        <div
          key={title}
          className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface-raised)] p-3.5"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--pt-green)]">
            <span className="h-3.5 w-1 shrink-0 rounded-full bg-[var(--pt-green)]" />
            {title}
          </div>
          <div className="text-[12.5px] leading-relaxed text-[var(--pt-text-2)]">{content}</div>
        </div>
      ))}
    </div>
  );
}
