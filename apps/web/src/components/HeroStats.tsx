import type { Totals } from '@dsa-tracker/shared';
import { formatCount } from '@/lib/format';

export function HeroStats({ totals }: { totals: Totals }) {
  return (
    <section className="hero" aria-label="Totals">
      <div className="hero-primary">
        <p className="hero-label">Unique LeetCode problems solved</p>
        <p className="hero-value">{formatCount(totals.lcUnique)}</p>
      </div>
      <div className="hero-secondary">
        <p className="hero-secondary-label">Non-LeetCode</p>
        <p className="hero-secondary-value">{formatCount(totals.other)}</p>
        <p className="hero-secondary-hint">Striver A2Z &amp; GFG-only problems, tracked separately</p>
      </div>
    </section>
  );
}
