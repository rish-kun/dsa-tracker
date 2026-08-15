import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ReferenceCard = {
  title: string;
  /** Tailwind text-colour utility for the card's accent (title + rule). */
  accent: string;
  /** Matching background utility for the 1px accent rule. */
  accentBar: string;
  content: ReactNode;
};

const CARDS: ReferenceCard[] = [
  {
    title: 'Intro (PPF)',
    accent: 'text-[var(--pt-blue)]',
    accentBar: 'bg-[var(--pt-blue)]',
    content: (
      <>
        <strong>Present → Past → Future</strong>, ~2:20–2:40 (~330 words), ends by handing back
        control.
        <br />
        Plant exactly 2 hooks: concrete + quantified, slightly unresolved (end on a problem, not a
        triumph), on terrain you own.
        <br />
        One flat non-hook sentence for the secondary item, so the hooks stand out.
        <br />
        Cut: schooling/rank, CGPA, adjective clusters, tech-stack recitals, hobbies.
        <br />
        Hard rule: do not fabricate — every number survives two follow-ups.
      </>
    ),
  },
  {
    title: 'Project deep-dive',
    accent: 'text-[var(--pt-violet)]',
    accentBar: 'bg-[var(--pt-violet)]',
    content: (
      <>
        <strong>10 questions:</strong> 30-sec pitch · one request end to end · why X over Y (×4:
        language, store, algorithm, framework) · hardest bug (symptom → wrong guess → how you
        narrowed → root cause → structural fix) · what you&apos;d change · scale to 10x (name the
        FIRST thing that breaks) · your part vs team · every number = how you measured it · weakest
        part today · what you learned.
        <br />
        Descend voluntarily — volunteer the tradeoff before they ask. The depth you stop at is the
        signal.
      </>
    ),
  },
  {
    title: 'Growth mindset',
    accent: 'text-[var(--pt-green)]',
    accentBar: 'bg-[var(--pt-green)]',
    content: (
      <>
        <strong>Hint → 3 beats:</strong> acknowledge → integrate out loud → act.
        <br />
        Restate the hint in your own words; never keep typing through one.
        <br />
        Stuck: &ldquo;Let me write the brute force so we have something correct, then
        optimise.&rdquo;
        <br />
        Bug found: loud and calm — name, locate, fix-before-making, lesson.
        <br />
        Rule: one acknowledgement, no apology, immediate forward motion.
      </>
    ),
  },
  {
    // Plain JS string rendered as {title} — React escapes it, so an HTML entity
    // here would show up literally. Use the character, not `&amp;`.
    title: 'Why Google & closing',
    accent: 'text-[var(--pt-amber)]',
    accentBar: 'bg-[var(--pt-amber)]',
    content: (
      <>
        Why Google = specific artifact you actually engaged with + honest personal connection + what
        you&apos;ll do + a forward question. Avoid brochure / prestige / fanboy /
        negative-comparison.
        <br />
        Closing: prepare 4–5, ask 2–3, react to the answers — never &ldquo;I have no
        questions&rdquo;.
        <br />
        Weakness: real + costly + a concrete correction in progress. &ldquo;Perfectionist&rdquo; is
        an evasion.
      </>
    ),
  },
  {
    title: 'AI fluency',
    accent: 'text-[var(--pt-rose)]',
    accentBar: 'bg-[var(--pt-rose)]',
    content: (
      <>
        Thesis: they are checking that YOU are still the engineer.
        <br />
        <strong>4 pillars:</strong> productivity (name a delegated task class + why) · prompt
        engineering (context, constraints, what-I-tried, iteration) · critical assessment (read →
        docs → edge cases → test; &ldquo;fluent but wrong&rdquo;) · workflow integration (a
        boundary).
        <br />
        <strong>5 story slots to fill:</strong> A time saved (+number) · B confidently-wrong + how
        caught · C done without AI + why · D a prompt iterated (before/after + diagnosis) · E
        end-to-end on one project.
        <br />
        Traps: never sound like AI does the thinking · not dismissive · no vagueness · no
        over-claiming · never a graded artefact as your example.
        <br />
        &ldquo;Did you use AI to prep?&rdquo; → yes, honestly, with a boundary (&ldquo;you&apos;d
        find out in four minutes&rdquo;).
      </>
    ),
  },
  {
    title: 'Intel',
    accent: 'text-[var(--pt-blue)]',
    accentBar: 'bg-[var(--pt-blue)]',
    content: (
      <>
        Difficulty: LC Medium, occasional Medium-Hard. NO DP this season (removes the historical #1
        topic); recursion/backtracking remain fair game.
        <br />
        Top topics: arrays/prefix/matrix · hashing · strings · trees · graphs · two-pointer/sliding
        · binary search · heaps/top-k · intervals · recursion/backtracking · design-a-structure ·
        union-find · trie.
        <br />
        Multi-part progressive: part 1 brute-force, part 2 adds a constraint or scale — EXTEND,
        don&apos;t restart.
        <br />
        Rejections: going quiet · not taking hints · over-modelling (heavier structure than needed)
        · slow brute→opt · an unresolved minor bug · &ldquo;too ideal&rdquo; behavioral answers ·
        headcount (not you).
        <br />
        Extras: word-for-word algorithm memorisation is NOT expected (black-box `std::sort` is
        fine, asking a method name is fine) · tech fails → narrate it instantly, hotspot, one clean
        acknowledgement.
      </>
    ),
  },
];

/**
 * The six behavioral + AI-fluency + intel reference cards, body only — no
 * section chrome. Rendered by any shell that folds the static prose into a
 * single place rather than leaving it inline in a daily panel.
 */
export function BehavioralAiBody() {
  return (
    <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
      {CARDS.map(({ title, accent, accentBar, content }) => (
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
  );
}
