'use client';

import { PHASE_COUNT } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';

/** NeetCode 150, then 150 more — the 300-problem target the pace metric divides. */
const DSA_TARGET = 150;
const TOTAL_TARGET = DSA_TARGET * 2;

/** Same surface + border + radius + shadow as the dashboard's `.panel`. */
const CARD =
  'rounded-[10px] border border-[var(--pt-border)] bg-[var(--pt-surface)] px-4 py-4 shadow-[var(--pt-shadow-panel)]';
/** The one uppercase kicker recipe — defined in globals.css, shared with `.problems-table th`. */
const MICRO = 'micro-label';

/**
 * Progress *track* is `--pt-border` in every other progress affordance in the
 * app (`.diff-bar`, `.src-bar-track`, the C++ and resume bars), so it is here
 * too — a tinted track vanished on the light card. Only the arc carries hue.
 */
const RING_TRACK = 'stroke-[var(--pt-border)]';

const RING_TONES = {
  blue: {
    arc: 'stroke-[var(--pt-blue)]',
    text: 'text-[var(--pt-blue)]',
  },
  violet: {
    arc: 'stroke-[var(--pt-violet)]',
    text: 'text-[var(--pt-violet)]',
  },
  green: {
    arc: 'stroke-[var(--pt-green)]',
    text: 'text-[var(--pt-green)]',
  },
} as const;

type RingTone = keyof typeof RING_TONES;

type RingProps = {
  fraction: number;
  tone: RingTone;
  value: string;
  total: string;
};

function Ring({ fraction, tone, value, total }: RingProps) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, Math.max(0, fraction)));
  const t = RING_TONES[tone];

  return (
    <div className="relative h-[60px] w-[60px] shrink-0">
      {/* rotated so the arc starts at 12 o'clock */}
      <svg width="60" height="60" className="-rotate-90" aria-hidden="true">
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className={RING_TRACK}
        />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={cn(
            t.arc,
            'transition-[stroke-dashoffset] duration-[600ms] ease-[cubic-bezier(.4,0,.2,1)]',
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn('font-mono text-[13px] font-bold tabular-nums', t.text)}>{value}</span>
        <span className="mt-0.5 font-mono text-[9px] tabular-nums text-[var(--pt-text-3)]">
          /{total}
        </span>
      </div>
    </div>
  );
}

type Props = {
  dsaCount: number;
  dsaExtra: number;
  cppDone: number;
  streak: number;
  daysLeft: number;
};

export function StatRings({ dsaCount, dsaExtra, cppDone, streak, daysLeft }: Props) {
  const neetcodeLeft = Math.max(0, DSA_TARGET - dsaCount);
  const extraLeft = Math.max(0, DSA_TARGET - dsaExtra);
  const totalDone = dsaCount + dsaExtra;
  const totalLeft = Math.max(0, TOTAL_TARGET - totalDone);
  const phasesLeft = Math.max(0, PHASE_COUNT - cppDone);

  // questions per day needed to hit 300 by Aug 1
  const qPerDay = daysLeft > 0 ? (totalLeft / daysLeft).toFixed(1) : '0';

  return (
    // Two columns only from `sm` up. At 360px a half-width card leaves 126px of
    // content box, and the 60px ring + 12px gap leaves 54px for the label —
    // narrower than the word "NeetCode", so the text spilled past the card and
    // the "need per day / total done" row overlapped itself.
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* NeetCode 150 */}
      <div className={cn(CARD, 'flex items-center gap-3')}>
        <Ring
          fraction={dsaCount / DSA_TARGET}
          tone="blue"
          value={String(dsaCount)}
          total={String(DSA_TARGET)}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight text-[var(--pt-text)]">
            NeetCode 150
          </div>
          <div className="mt-1 text-[11px] text-[var(--pt-text-3)]">
            {neetcodeLeft > 0 ? (
              <>
                <span className="font-mono font-bold tabular-nums text-[var(--pt-blue)]">
                  {neetcodeLeft}
                </span>{' '}
                left
              </>
            ) : (
              <span className="text-[var(--pt-green)]">Complete</span>
            )}
          </div>
          <div className={cn(MICRO, 'mt-0.5')}>done Jul 18</div>
        </div>
      </div>

      {/* Extra problems */}
      <div className={cn(CARD, 'flex items-center gap-3')}>
        <Ring
          fraction={dsaExtra / DSA_TARGET}
          tone="violet"
          value={String(dsaExtra)}
          total={String(DSA_TARGET)}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight text-[var(--pt-text)]">
            Extra problems
          </div>
          <div className="mt-1 text-[11px] text-[var(--pt-text-3)]">
            {extraLeft > 0 ? (
              <>
                <span className="font-mono font-bold tabular-nums text-[var(--pt-violet)]">
                  {extraLeft}
                </span>{' '}
                left
              </>
            ) : (
              <span className="text-[var(--pt-green)]">Complete</span>
            )}
          </div>
          <div className={cn(MICRO, 'mt-0.5')}>after NeetCode</div>
        </div>
      </div>

      {/* C++ phases — denominator is PHASE_COUNT, never a literal */}
      <div className={cn(CARD, 'flex items-center gap-3')}>
        <Ring
          fraction={cppDone / PHASE_COUNT}
          tone="green"
          value={String(cppDone)}
          total={String(PHASE_COUNT)}
        />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight text-[var(--pt-text)]">
            C++ phases
          </div>
          <div className="mt-1 text-[11px] text-[var(--pt-text-3)]">
            <span className="font-mono font-bold tabular-nums text-[var(--pt-green)]">
              {phasesLeft}
            </span>{' '}
            remaining
          </div>
          <div className={cn(MICRO, 'mt-0.5')}>ship Jul 26</div>
        </div>
      </div>

      {/* Streak + pace */}
      <div className={cn(CARD, 'flex flex-col gap-3')}>
        <div className="flex items-center gap-3">
          <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-[var(--pt-amber-bg)] font-mono text-[22px] font-bold tabular-nums text-[var(--pt-amber)]">
            {streak}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[var(--pt-text)]">
              {streak === 1 ? 'day' : 'days'} streak
            </div>
            <div className={cn(MICRO, 'mt-1')}>floor + trip days</div>
          </div>
        </div>

        {/* pace divider */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--pt-border)] pt-2.5">
          <div>
            <div className={MICRO}>need per day</div>
            <div
              className={cn(
                'mt-0.5 font-mono text-[18px] font-bold tabular-nums',
                totalLeft === 0 ? 'text-[var(--pt-green)]' : 'text-[var(--pt-rose)]',
              )}
            >
              {totalLeft === 0 ? 'done' : qPerDay}
              {totalLeft > 0 && (
                <span className="ml-1 text-[11px] font-normal text-[var(--pt-text-3)]">q/day</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className={MICRO}>total done</div>
            <div className="mt-0.5 font-mono text-[18px] font-bold tabular-nums text-[var(--pt-text-2)]">
              {totalDone}
              <span className="text-[11px] font-normal text-[var(--pt-text-3)]">
                /{TOTAL_TARGET}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
