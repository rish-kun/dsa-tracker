import type { Metadata } from 'next';
import { EmptyState } from '@/components/EmptyState';
import { ProblemTimeTable } from '@/components/ProblemTimeTable';
import { requireUser } from '@/lib/auth';
import { formatDuration, getProblemTimeSummaries } from '@/lib/time-tracking';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Problem time — DSA Tracker',
};

export default async function TimePage() {
  const userId = await requireUser();
  const rows = await getProblemTimeSummaries(userId);
  const totalSeconds = rows.reduce((sum, row) => sum + row.totalSeconds, 0);

  return (
    <main className="page">
      <div className="page-header time-page-header">
        <div>
          <h1 className="page-title">Problem time</h1>
          <p className="page-subtitle">
            Focused time on recognized problem pages. Lists and editorials still count toward site time,
            so problem totals can be lower.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="time-page-total">
            <span className="micro-label">Tracked across problems</span>
            <strong>{formatDuration(totalSeconds)}</strong>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No problem time yet"
          body="Open a supported problem and keep its tab focused while you work. Your first active segment will appear here automatically."
        />
      ) : (
        <ProblemTimeTable rows={rows} />
      )}
    </main>
  );
}
