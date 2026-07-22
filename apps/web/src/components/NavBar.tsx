'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/plan', label: 'Plan' },
  { href: '/', label: 'Dashboard' },
  { href: '/problems', label: 'Problems' },
];

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--pt-border)] bg-[var(--pt-bg)]">
      {/* flex-wrap is the safety net: below ~330px of usable width the nav group
          drops to a second line instead of pushing the page into a horizontal
          scroll. The tightened mobile metrics below keep it on one line at 360. */}
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-x-1 gap-y-2 px-[clamp(16px,4vw,32px)] py-[18px] sm:gap-x-2">
        <Link
          href="/"
          className="inline-flex shrink-0 font-mono text-[14px] font-semibold tracking-[-0.02em] no-underline sm:text-[17px]"
        >
          <span className="text-[var(--pt-text-2)]">dsa</span>
          <span className="px-px text-[var(--pt-blue)]">/</span>
          <span>tracker</span>
        </Link>

        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <nav className="flex gap-0 sm:gap-1" aria-label="Primary">
            {LINKS.map((link) => {
              // `/` must match exactly — every path starts with it, so prefix
              // matching would light up Dashboard on `/plan` and `/problems` too.
              const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    // Mobile trims the horizontal padding (the three links plus
                    // the wordmark and toggle have to clear 360px) and trades it
                    // for vertical padding, which buys a ~40px tap target.
                    'rounded-[6px] px-1.5 py-2.5 text-[13px] font-medium whitespace-nowrap no-underline [transition:color_.15s_ease,background-color_.15s_ease] sm:px-3 sm:py-[7px] sm:text-[14px]',
                    'hover:bg-[var(--pt-surface)] hover:text-[var(--pt-text)]',
                    active
                      ? 'bg-[var(--pt-surface)] text-[var(--pt-text)]'
                      : 'text-[var(--pt-text-2)]',
                  )}
                  data-active={active || undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] sm:h-[30px] sm:w-[30px]',
              'border border-[var(--pt-border)] bg-[var(--pt-surface-2)] text-[var(--pt-text-2)]',
              '[transition:color_.15s_ease,background-color_.15s_ease,border-color_.15s_ease]',
              'hover:border-[var(--pt-border-2)] hover:bg-[var(--pt-surface-raised)] hover:text-[var(--pt-text)]',
            )}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}
