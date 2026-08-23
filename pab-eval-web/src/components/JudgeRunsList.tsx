"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { listAllJudgeRuns } from "@/lib/api";
import { isTrackableJobState } from "@/lib/runs";
import type { JobState, JudgeRunListItem, Progress } from "@/types/api";

function stateBadgeClass(state: JobState | "idle"): string {
  switch (state) {
    case "running":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200";
    case "awaiting_decision":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-200";
    case "completed":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "stopped":
    case "cancelled":
      return "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200";
    case "idle":
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
    default:
      return "bg-zinc-100 text-zinc-800";
  }
}

function progressForItem(item: JudgeRunListItem): Progress | null {
  if (item.job?.progress) return item.job.progress;
  if (item.progress) return item.progress;
  return null;
}

function displayState(item: JudgeRunListItem): JobState | "idle" {
  if (item.job?.state) return item.job.state;
  const p = progressForItem(item);
  if (p && p.remaining === 0 && p.completed + p.failed > 0) return "completed";
  if (p && (p.completed > 0 || p.failed > 0)) return "stopped";
  return "idle";
}

function formatProgress(p: Progress | null): string {
  if (!p) return "—";
  return `${p.completed} ok · ${p.failed} failed · ${p.remaining} left`;
}

export function JudgeRunsList() {
  const [runs, setRuns] = useState<JudgeRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listAllJudgeRuns();
      setRuns(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load judge runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && runs.length === 0) {
    return <p className="text-sm text-zinc-500">Loading judge runs…</p>;
  }

  if (error && runs.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{error}</p>
        <button type="button" className="text-sm underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No judge runs yet.{" "}
        <Link href="/judges/activate" className="underline">
          Start one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" className="text-sm underline" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Generate run</th>
              <th className="px-4 py-2 font-medium">Judge run</th>
              <th className="px-4 py-2 font-medium">Judge</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Progress</th>
              <th className="px-4 py-2 font-medium">Started</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {runs.map((item) => {
              const state = displayState(item);
              const progress = progressForItem(item);
              const judgeId = item.manifest?.judge_id ?? item.judge_run_id;
              const started = item.manifest?.started_at ?? item.job?.started_at;
              const trackable = item.job ? isTrackableJobState(item.job.state) : false;
              const trackHref = `/judges/activate?trackRun=${encodeURIComponent(item.run_id)}&trackJudge=${encodeURIComponent(item.judge_run_id)}`;

              return (
                <tr key={`${item.run_id}:${item.judge_run_id}`} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-3 font-mono text-xs">{item.run_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.judge_run_id}</td>
                  <td className="px-4 py-3 font-mono text-xs">{judgeId}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {item.manifest?.judge_model ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase ${stateBadgeClass(state)}`}
                    >
                      {state.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatProgress(progress)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {started ? new Date(started).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={trackHref}
                      className={`text-xs font-medium underline ${
                        trackable
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {trackable ? "Track" : "View"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
