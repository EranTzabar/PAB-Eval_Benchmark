interface ProgressBarProps {
  completed: number;
  failed: number;
  remaining: number;
}

export function ProgressBar({ completed, failed, remaining }: ProgressBarProps) {
  const total = completed + failed + remaining;
  const donePct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failedPct = total > 0 ? Math.round((failed / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="bg-emerald-500 transition-all duration-300"
          style={{ width: `${donePct}%` }}
        />
        <div
          className="bg-amber-500 transition-all duration-300"
          style={{ width: `${failedPct}%` }}
        />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {completed} completed · {failed} failed · {remaining} remaining
        {total > 0 ? ` (${total} total)` : ""}
      </p>
    </div>
  );
}
