"use client";

import { useEffect, useState } from "react";

import { listRuns } from "@/lib/api";
import type { JobState, RunListItem } from "@/types/api";

const RUN_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function sortRuns(runs: RunListItem[]): RunListItem[] {
  return [...runs].sort((a, b) => {
    const aTime = a.manifest?.started_at ?? a.run_id;
    const bTime = b.manifest?.started_at ?? b.run_id;
    return bTime.localeCompare(aTime);
  });
}

function displayState(run: RunListItem): JobState | "idle" {
  return run.job?.state ?? "idle";
}

interface RunIdFieldProps {
  value: string;
  onChange: (runId: string) => void;
  onSelectRun?: (run: RunListItem) => void;
  disabled?: boolean;
}

export function RunIdField({ value, onChange, onSelectRun, disabled }: RunIdFieldProps) {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useExisting, setUseExisting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRuns()
      .then((items) => {
        if (!cancelled) {
          setRuns(sortRuns(items));
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load runs");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasExisting = runs.length > 0;

  const handleModeChange = (existing: boolean) => {
    setUseExisting(existing);
    if (existing && runs.length > 0) {
      const first = runs[0];
      onChange(first.run_id);
      onSelectRun?.(first);
    } else {
      onChange("");
    }
  };

  const handleExistingChange = (runId: string) => {
    onChange(runId);
    const run = runs.find((r) => r.run_id === runId);
    if (run) onSelectRun?.(run);
  };

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Run ID</span>

      {loading ? <p className="text-sm text-zinc-500">Loading runs…</p> : null}
      {loadError ? <p className="text-xs text-amber-700 dark:text-amber-400">{loadError}</p> : null}

      {hasExisting && !loading ? (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="run-id-mode"
              checked={!useExisting}
              onChange={() => handleModeChange(false)}
              disabled={disabled}
            />
            New run ID
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="run-id-mode"
              checked={useExisting}
              onChange={() => handleModeChange(true)}
              disabled={disabled}
            />
            Existing run
          </label>
        </div>
      ) : null}

      {useExisting && hasExisting ? (
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={value}
          onChange={(e) => handleExistingChange(e.target.value)}
          disabled={disabled}
        >
          {runs.map((run) => (
            <option key={run.run_id} value={run.run_id}>
              {run.run_id} ({displayState(run).replace("_", " ")})
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          placeholder="lema-run-2026-03-19"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}

      {value && !RUN_ID_PATTERN.test(value) ? (
        <p className="text-xs text-red-600">Use 1–64 chars: letters, digits, . _ -</p>
      ) : null}
    </div>
  );
}
