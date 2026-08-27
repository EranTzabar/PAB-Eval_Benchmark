"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { deleteJudge, listJudges } from "@/lib/api";
import type { JudgeConfig } from "@/types/api";

export function JudgesList() {
  const [judges, setJudges] = useState<JudgeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingJudgeId, setDeletingJudgeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJudges(await listJudges());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load judges");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (judge: JudgeConfig) => {
    if (
      !window.confirm(
        `Delete judge "${judge.name}" (${judge.judge_id})? This removes the judge definition only; past judge runs and scores are kept.`,
      )
    ) {
      return;
    }
    setDeletingJudgeId(judge.judge_id);
    setError(null);
    try {
      await deleteJudge(judge.judge_id);
      setJudges((prev) => prev.filter((j) => j.judge_id !== judge.judge_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete judge");
    } finally {
      setDeletingJudgeId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading judges…</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{error}</p>
        <button type="button" className="text-sm underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (judges.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No judges in R2.{" "}
        <Link href="/judges/new" className="underline">
          Add one
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

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Judge ID</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">API key env</th>
              <th className="px-4 py-2 font-medium">Key status</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {judges.map((judge) => (
              <tr key={judge.judge_id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3 font-medium">{judge.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {judge.judge_id}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{judge.model}</td>
                <td className="px-4 py-3 font-mono text-xs">{judge.api_key_env}</td>
                <td className="px-4 py-3">
                  {judge.api_key_set ? (
                    <span className="text-emerald-700 dark:text-emerald-400">Set</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">Key missing</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {new Date(judge.updated_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/judges/${encodeURIComponent(judge.judge_id)}/edit?return=${encodeURIComponent("/judges")}`}
                      className="text-xs underline"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="text-xs text-red-600 underline disabled:opacity-40 dark:text-red-400"
                      disabled={deletingJudgeId === judge.judge_id}
                      onClick={() => void handleDelete(judge)}
                    >
                      {deletingJudgeId === judge.judge_id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
