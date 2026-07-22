'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import { PLAN_VIEWS, type PlanView } from './types';

/**
 * Evaluation scaffolding: flips `/plan` between the layout that shipped and the
 * three candidates replacing it.
 *
 * This is a real navigation rather than client state, because `view` also drives
 * the page's and the NavBar's max-width on the server — resolving that on the
 * client would flash. View switches are rare enough that a re-read is fine; the
 * per-layout state (tab, selected day) deliberately does NOT navigate.
 *
 * Delete this file, `PlanView`, and the two losing shells once one wins.
 */
const LABELS: Record<PlanView, string> = {
  now: 'Now',
  a: 'A · Stack',
  b: 'B · Tabs',
  c: 'C · Cockpit',
};

export function ViewSwitcher({ view }: { view: PlanView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', isPending && 'opacity-60')}
      aria-busy={isPending}
    >
      <span className="micro-label mr-0.5">Layout</span>
      {PLAN_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          data-active={v === view || undefined}
          aria-pressed={v === view}
          onClick={() => startTransition(() => router.push(`/plan?view=${v}`))}
          className="filter-chip max-sm:min-h-[36px]"
        >
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
}
