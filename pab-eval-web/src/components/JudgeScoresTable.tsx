"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchAllJudgeScores } from "@/lib/api";
import { computeSummary } from "@/lib/judgeMetrics";
import type { ScoreRecord } from "@/types/api";

interface JudgeScoresTableProps {
  runId: string;
  judgeRunId: string;
  refreshKey: number;
  isActive: boolean;
}

function formatScore(value: number | null): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function JudgeScoresTable({
  runId,
  judgeRunId,
  refreshKey,
  isActive,
}: JudgeScoresTableProps) {
  const [expanded, setExpanded] = useState(true);
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadScores = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setFetchError(null);
      try {
        const items = await fetchAllJudgeScores(runId, judgeRunId, { signal });
        if (!mountedRef.current || signal?.aborted) return;
        setScores(items);
      } catch (err) {
        if (!mountedRef.current || signal?.aborted) return;
        setFetchError(err instanceof Error ? err.message : "Failed to load scores");
      } finally {
        if (mountedRef.current && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [runId, judgeRunId],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadScores(controller.signal);
    return () => controller.abort();
  }, [loadScores, refreshKey]);

  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    const id = setInterval(() => {
      void loadScores(controller.signal);
    }, 3000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [isActive, loadScores]);

  const summary = useMemo(() => computeSummary(scores), [scores]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Scores
          {scores.length > 0 ? (
            <span className="ml-2 font-normal text-zinc-500">({scores.length} items)</span>
          ) : null}
        </h3>
        <button
          type="button"
          className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide results" : "Show results"}
        </button>
      </div>

      {fetchError ? <p className="text-sm text-red-600">{fetchError}</p> : null}

      {expanded ? (
        <>
          {loading && scores.length === 0 ? (
            <p className="text-sm text-zinc-500">Loading scores…</p>
          ) : scores.length === 0 ? (
            <p className="text-sm text-zinc-500">No scores yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">AID</th>
                    <th className="px-4 py-2 font-medium">LTF</th>
                    <th className="px-4 py-2 font-medium">EBC</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {scores.map((row) => (
                    <tr key={row.item_id} className="bg-white dark:bg-zinc-950">
                      <td className="px-4 py-2 font-mono text-xs">{row.item_id}</td>
                      <td className="px-4 py-2">{formatScore(row.aid)}</td>
                      <td className="px-4 py-2">{formatScore(row.ltf)}</td>
                      <td className="px-4 py-2">{formatScore(row.ebc)}</td>
                      <td className="px-4 py-2">
                        {row.parse_ok ? (
                          <span className="text-emerald-700 dark:text-emerald-400">ok</span>
                        ) : (
                          <span
                            className="text-red-700 dark:text-red-400"
                            title={row.error ?? undefined}
                          >
                            failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {scores.length > 0 ? (
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-zinc-500">Scored</dt>
                <dd>
                  {summary.okCount}/{summary.total} ok
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Mean LTF</dt>
                <dd>{summary.meanLtf != null ? summary.meanLtf.toFixed(2) : "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Mean EBC</dt>
                <dd>{summary.meanEbc != null ? summary.meanEbc.toFixed(2) : "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">AID rate</dt>
                <dd>{summary.aidRate != null ? `${summary.aidRate.toFixed(1)}%` : "—"}</dd>
              </div>
            </dl>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
