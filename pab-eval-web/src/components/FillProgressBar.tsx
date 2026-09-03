interface FillProgressBarProps {
  value: number;
  label?: string;
  indeterminate?: boolean;
  compact?: boolean;
  showLabel?: boolean;
}

export function FillProgressBar({
  value,
  label,
  indeterminate = false,
  compact = false,
  showLabel = true,
}: FillProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div
        className={`overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700 ${compact ? "h-1.5" : "h-3"}`}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy={indeterminate || undefined}
        aria-label={label ?? "Loading progress"}
      >
        {indeterminate ? (
          <div
            className="h-full w-1/3 rounded-full bg-sky-500"
            style={{ animation: "progress-indeterminate 1.2s ease-in-out infinite" }}
          />
        ) : (
          <div
            className="h-full bg-sky-500 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {label && showLabel ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p> : null}
    </div>
  );
}
