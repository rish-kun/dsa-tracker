import type { Metadata } from 'next';
import { EmptyState } from '@/components/EmptyState';
import { ProblemsTable } from '@/components/ProblemsTable';
import { getAllSolved } from '@/lib/queries';
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
  const rows = await loadRows(await requireUser());

  return (
    <main className="page">
      <div className="page-header">
        <h1 className="page-title">Solved problems</h1>
        <p className="page-subtitle">Every unique problem you've cleared, across every source.</p>
      </div>

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
