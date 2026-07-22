import { DifficultyBar } from '@/components/DifficultyBar';
import { EmptyState } from '@/components/EmptyState';
import { HeroStats } from '@/components/HeroStats';
import { RecentList } from '@/components/RecentList';
import type { CumulativePoint } from '@/components/SolvesOverTimeChart';
import { SolvesOverTimeChart } from '@/components/SolvesOverTimeChart';
import { SourceBars } from '@/components/SourceBars';
import { getDashboardStats } from '@/lib/dashboard-stats';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const isEmpty = stats.totals.lcUnique === 0 && stats.totals.other === 0;

  let running = 0;
  const cumulative: CumulativePoint[] = stats.overTime.map((d) => {
    running += d.count;
    return { date: d.date, cumulative: running, daily: d.count };
  });

  return (
    <main className="page">
      <HeroStats totals={stats.totals} />

      {isEmpty ? (
        <EmptyState
          title="No solves logged yet"
          body="Install the browser extension and solve a problem on LeetCode, NeetCode, or Striver's A2Z sheet — it'll show up here automatically. Numbers, charts, and your recent activity all fill in from that point on."
        />
      ) : (
        <>
          <DifficultyBar byDifficulty={stats.byDifficulty} />
          <SolvesOverTimeChart points={cumulative} />
          {/* `.grid-2` collapses at 760px, but `.recent-row`'s fixed tracks
              (52px + chip + source badge + 64px date ≈ 310px) do not fit a
              half-width column until the page is at its 1000px cap — between
              761px and ~900px the title track was squeezed to a few pixels of
              ellipsis. Hold one column until `lg`. */}
          <div className="grid-2 grid-cols-1 lg:grid-cols-2">
            <SourceBars bySource={stats.bySource} />
            <RecentList recent={stats.recent} />
          </div>
        </>
      )}
    </main>
  );
}
