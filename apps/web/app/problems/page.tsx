import type { Metadata } from 'next';
import { EmptyState } from '@/components/EmptyState';
import { ProblemsTable } from '@/components/ProblemsTable';
import { TrackPanel } from '@/components/TrackPanel';
import { getAllSolved } from '@/lib/queries';
import { getTrack } from '@/lib/tracks';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Problems — DSA Tracker',
};

async function loadRows(userId: string) {
  try {
    return await getAllSolved(userId);
  } catch (err) {
    console.error('getAllSolved failed, rendering empty state', err);
    return [];
  }
}

export default async function ProblemsPage() {
  const userId = await requireUser();
  const rows = await loadRows(userId);
  // Sequential on purpose: the postgres.js client is max: 1. getTrack never
  // throws, so an unreachable DB still renders the page without a track.
  const track = await getTrack(userId);
  const solvedKeys = new Set(rows.map((row) => row.canonicalKey));

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Solved problems</h1>
        <p className="page-subtitle">Every unique problem you've cleared, across every source.</p>
      </div>

      <TrackPanel
        name={track?.name ?? null}
        items={track?.items ?? []}
        solvedKeys={solvedKeys}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="Once you solve problems on LeetCode, NeetCode, or Striver's A2Z sheet, they'll show up in this table — searchable and filterable."
        />
      ) : (
        <ProblemsTable rows={rows} />
      )}
    </main>
  );
}
