import { sourceLabel } from '@/lib/format';

const CLASS: Record<string, string> = {
  leetcode: 'src-leetcode',
  neetcode: 'src-neetcode',
  tuf: 'src-tuf',
  backfill: 'src-backfill',
};

export function SourceBadge({ source }: { source: string }) {
  const cls = CLASS[source] ?? 'src-other';
  return (
    <span className="src-badge">
      <span className={`src-dot ${cls}`} aria-hidden="true" />
      {sourceLabel(source)}
    </span>
  );
}
