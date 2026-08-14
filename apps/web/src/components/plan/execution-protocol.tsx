import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ProtocolCard = {
  title: string;
  /** Tailwind text-colour utility for the card's accent (title + rule). */
  accent: string;
  /** Matching background utility for the 1px accent rule. */
  accentBar: string;
  content: ReactNode;
};

const CLOCK_ROWS: { time: string; phase: string }[] = [
  { time: 'T+0–4', phase: 'Intro · 2–5 min · stop self-intro at 90 s' },
  { time: 'T+4–8', phase: 'Read + clarify · restate before asking anything' },
  { time: 'T+8–15', phase: "Approach + compare · no code until 'sounds good'" },
  { time: 'T+15–33', phase: 'Code · narrate, helpers first, return early' },
  { time: 'T+33–40', phase: 'Dry run + tests · never skip' },
  { time: 'T+40–44', phase: 'AI fluency Q&A · conversational, no monologues' },
  { time: 'T+44–48', phase: 'Your questions · 4 ready, ask 2' },
];

const PROTOCOL_CARDS: ProtocolCard[] = [
  {
    title: 'Master clock',
    accent: 'text-[var(--pt-blue)]',
    accentBar: 'bg-[var(--pt-blue)]',
    content: (
      <>
        <div className="space-y-1">
          {CLOCK_ROWS.map(({ time, phase }) => (
            <div key={time} className="flex gap-2">
              <span className="shrink-0 font-mono text-[11px] text-[var(--pt-text-3)]">
                {time}
              </span>
              <span>{phase}</span>
            </div>
          ))}
        </div>
        <div className="mt-2">
          Two problems → compressed cycle: clarify 2 / approach 3 / code 10 / test 3. Say: “Since we
          have about 18 minutes, I&apos;ll move faster and check in more often.”
        </div>
      </>
    ),
  },
  {
    title: 'Always Five',
    accent: 'text-[var(--pt-violet)]',
    accentBar: 'bg-[var(--pt-violet)]',
    content: (
      <>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Input size? — sets the complexity target (n ≤ 20 exponential, ≤ 1e3 O(n²), ≥ 1e5 O(n log n)).</li>
          <li>Value constraints — negatives / duplicates / range?</li>
          <li>Empty or null input — what to return?</li>
          <li>May I modify the input in place?</li>
          <li>Guaranteed valid answer, or a no-solution case?</li>
        </ol>
        <div className="mt-2">Then 1–3 type-specific ones. 5–8 total, stop.</div>
      </>
    ),
  },
  {
    title: 'Approach comparison',
    accent: 'text-[var(--pt-green)]',
    accentBar: 'bg-[var(--pt-green)]',
    content: (
      <>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Announce the count: “I see two approaches.”</li>
          <li>A in one sentence + time + space.</li>
          <li>B in one sentence + the insight + time + space.</li>
          <li>Pick with a named reason that isn&apos;t only speed (readability / fewer moving parts / off-by-one risk).</li>
          <li>Concede the cost honestly.</li>
          <li>Hand over: “Does that sound reasonable?”</li>
        </ol>
        <div className="mt-2">
          Only see one? Voice the brute force, price it, reject it — never say “I only see one way.”
        </div>
      </>
    ),
  },
  {
    title: 'Think-aloud',
    accent: 'text-[var(--pt-amber)]',
    accentBar: 'bg-[var(--pt-amber)]',
    content: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Intent BEFORE action: say the sentence, then type the code.</li>
        <li>Announce every pause over ~15 s: “Let me think for a moment…” then go quiet, then close it.</li>
        <li>Bug, 4 beats: name it → locate &amp; explain → state the fix before making it → say what it teaches.</li>
        <li>Banned: “um / basically / like / sort of / I guess / hopefully this works / this is probably wrong”.</li>
      </ul>
    ),
  },
  {
    title: 'Hints & recovery',
    accent: 'text-[var(--pt-rose)]',
    accentBar: 'bg-[var(--pt-rose)]',
    content: (
      <ul className="list-disc space-y-1 pl-4">
        <li>3-beat response to every hint: acknowledge → integrate out loud → act.</li>
        <li>Restate their hint in your own words = highest-scoring move.</li>
        <li>Never defend a broken approach past one exchange; never keep typing through a hint.</li>
        <li>Gone quiet 40 s? Resynchronise: “Let me catch you up — I was working out X…”</li>
        <li>One acknowledgement, no apology, forward motion.</li>
      </ul>
    ),
  },
  {
    title: 'Hard rules',
    accent: 'text-[var(--pt-blue)]',
    accentBar: 'bg-[var(--pt-blue)]',
    content: (
      <ul className="list-disc space-y-1 pl-4">
        <li>Restate the problem before asking anything.</li>
        <li>Two approaches + both complexities + a check-in, before typing a single character.</li>
        <li>At T+30, stop coding and start the dry run — whatever state the code is in.</li>
        <li>Protect the last 8 minutes.</li>
      </ul>
    ),
  },
];

/**
 * The condensed in-interview execution protocol as a set of cards, without any
 * section chrome. Static, non-interactive; the six cards are accent-coloured by
 * rotating through the app's blue/violet/green/amber/rose families.
 */
export function ExecutionProtocolBody() {
  return (
    <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
      {PROTOCOL_CARDS.map(({ title, accent, accentBar, content }) => (
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
