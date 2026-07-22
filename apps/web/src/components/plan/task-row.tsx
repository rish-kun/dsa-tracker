'use client';

import { TAG_LABELS, type Tag } from '@dsa-tracker/plan-data';
import { cn } from '@/lib/utils';

/** Tag -> badge tint. Labels come from plan-data; only the colours live here. */
const TAG_CLASS: Record<Tag, string> = {
  dsa: 'bg-[var(--pt-blue-bg)] text-[var(--pt-blue)]',
  cpp: 'bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
  res: 'bg-[var(--pt-amber-bg)] text-[var(--pt-amber)]',
  oth: 'bg-[var(--pt-violet-bg)] text-[var(--pt-violet)]',
};

type Props = {
  id: string;
  label: string;
  tag?: Tag;
  checked: boolean;
  /**
   * True when `checked` was derived from a real detected solve rather than a
   * manual tick. Purely presentational — the row stays clickable so the user
   * can override the derivation.
   */
  auto?: boolean;
  onChange: (id: string, val: boolean) => void;
};

export function TaskRow({ id, label, tag, checked, auto = false, onChange }: Props) {
  const autoTicked = checked && auto;
  const hint = autoTicked
    ? 'Ticked automatically from a detected solve — click to override'
    : undefined;

  return (
    // The <label> is the only interactive surface: it drives the real input.
    // The box below is decorative, so a click cannot toggle twice.
    <label
      title={hint}
      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-[14px] transition-colors hover:bg-[var(--pt-surface-raised)] max-sm:min-h-[44px]"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(id, e.target.checked)}
        aria-label={autoTicked ? `${label} — ticked automatically from a detected solve` : label}
        className="peer sr-only"
      />

      {/* checkbox — presentational only; state and events belong to the input */}
      <span
        aria-hidden="true"
        className={cn(
          'relative mt-[2px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-all',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--pt-blue-ring)] peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[var(--pt-surface)]',
          !checked && 'border-[var(--pt-border-2)] bg-transparent',
          checked && !auto && 'border-[var(--pt-green)] bg-[var(--pt-green)] text-[var(--pt-bg)]',
          // auto ticks read as an outline rather than a solid fill
          autoTicked && 'border-[var(--pt-green)] bg-[var(--pt-green-bg)] text-[var(--pt-green)]',
        )}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4l2.5 2.5L9 1"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      {/* tag badge */}
      {tag && (
        <span
          className={cn(
            'mt-[1px] shrink-0 rounded-md px-1.5 py-[2px] font-mono text-[10px] font-bold uppercase leading-[1.4] tracking-[0.08em]',
            TAG_CLASS[tag],
          )}
        >
          {TAG_LABELS[tag]}
        </span>
      )}

      {/* label */}
      <span
        className={cn(
          'min-w-0 flex-1 break-words leading-relaxed transition-colors',
          checked ? 'text-[var(--pt-text-3)] line-through' : 'text-[var(--pt-text)]',
        )}
      >
        {label}
      </span>

      {/* auto affordance */}
      {autoTicked && (
        <span
          aria-hidden="true"
          className="mt-[3px] shrink-0 rounded-md border border-[color-mix(in_srgb,var(--pt-green)_45%,transparent)] bg-[var(--pt-green-bg)] px-1 py-[2px] font-mono text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-[var(--pt-green)]"
        >
          auto
        </span>
      )}
    </label>
  );
}
