import { formatCount, formatDate } from '@/lib/format';

interface Records {
  bestDay: { date: string; count: number } | null;
  bestWeek: { weekStart: string; count: number } | null;
  avgPerDay30: number;
  daysActive: number;
}

export function RecordsPanel({ records }: { records: Records }) {
  const items: { label: string; value: string; hint: string | null }[] = [
    {
      label: 'Best day',
      value: records.bestDay ? formatCount(records.bestDay.count) : '—',
      hint: records.bestDay ? formatDate(records.bestDay.date) : null,
    },
    {
      label: 'Best week',
      value: records.bestWeek ? formatCount(records.bestWeek.count) : '—',
      hint: records.bestWeek ? `week of ${formatDate(records.bestWeek.weekStart)}` : null,
    },
    {
      label: 'Avg / day (30d)',
      value: records.avgPerDay30.toFixed(1),
      hint: null,
    },
    {
      label: 'Days active',
      value: formatCount(records.daysActive),
      hint: 'all time',
    },
  ];

  return (
    <div className="panel">
      <h2 className="panel-title">Personal records</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        {items.map((item) => (
          <div key={item.label}>
            <p className="micro-label mb-2">{item.label}</p>
            <p className="font-mono text-[22px] leading-none font-semibold tracking-[-0.02em] text-[var(--pt-text)] tabular-nums">
              {item.value}
            </p>
            {item.hint && (
              <p className="mt-1 text-[12px] text-[var(--pt-text-3)]">{item.hint}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
