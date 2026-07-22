interface Streak {
  current: number;
  longest: number;
}

export function StreakPanel({ streak }: { streak: Streak }) {
  return (
    <div className="panel">
      <h2 className="panel-title">Streak</h2>
      <div className="flex items-end gap-8">
        <div>
          <p className="micro-label mb-2">Current</p>
          <p className="font-mono text-[40px] leading-none font-semibold tracking-[-0.02em] text-[var(--pt-text)] tabular-nums">
            {streak.current}
            <span className="ml-1 text-[13px] font-normal text-[var(--pt-text-3)]">
              {streak.current === 1 ? 'day' : 'days'}
            </span>
          </p>
        </div>
        <div>
          <p className="micro-label mb-2">Longest</p>
          <p className="font-mono text-[28px] leading-none font-semibold tracking-[-0.02em] text-[var(--pt-text-2)] tabular-nums">
            {streak.longest}
            <span className="ml-1 text-[13px] font-normal text-[var(--pt-text-3)]">
              {streak.longest === 1 ? 'day' : 'days'}
            </span>
          </p>
        </div>
      </div>
      {streak.current === 0 && (
        <p className="panel-empty mt-3">Solve something today to start a new streak.</p>
      )}
    </div>
  );
}
