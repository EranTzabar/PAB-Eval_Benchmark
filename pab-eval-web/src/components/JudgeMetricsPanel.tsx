"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  allJudgeRunPairs,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  distinctJudgeIds,
  formatMetricCell,
  formatScored,
  latestJudgeRunById,
  pairKey,
  parsePairKey,
} from "@/lib/judgeMetrics";
import { metricsFromExportEntries } from "@/lib/judgeMetricsFromExport";
import { importJudgeRunsFromFiles, mergeExportEntries } from "@/lib/judgeRunsImport";
import type { JudgeRunExportEntry } from "@/lib/judgeRunsExport";
import { SCORE_DEFINITIONS } from "@/lib/scoreDefinitions";
import type { JudgeRunMetrics, RunJudgeMetrics, ScoreBucket } from "@/types/api";

import { ScoreColumnHeader } from "./ScoreColumnHeader";

type ViewMode = "within" | "cross-id" | "cross-run";

const VIEW_TABS: { id: ViewMode; label: string }[] = [
  { id: "within", label: "Within run" },
  { id: "cross-id", label: "Across runs (judge ID)" },
  { id: "cross-run", label: "Across runs (judge run)" },
];

function bucketForRow(judgeRun: JudgeRunMetrics, rowKey: string): ScoreBucket {
  if (rowKey === "__overall__") {
    return judgeRun.overall;
  }
  return (
    judgeRun.by_category[rowKey] ?? {
      count: 0,
      ok_count: 0,
      mean_ltf: null,
      mean_ebc: null,
      aid_rate: null,
    }
  );
}

function judgeColumnLabel(judgeRun: JudgeRunMetrics): string {
  const parts = [judgeRun.judge_id, judgeRun.judge_model];
  if (judgeRun.prompt_version) {
    parts.push(`v${judgeRun.prompt_version}`);
  }
  return parts.join(" · ");
}

function judgeColumnSubLabel(judgeRun: JudgeRunMetrics): string {
  return judgeRun.judge_run_id;
}

interface MetricsTableProps {
  rowKeys: string[];
  rowLabel: (key: string) => string;
  columns: { id: string; label: string; subLabel?: string; judgeRun: JudgeRunMetrics }[];
  getBucket: (columnId: string, rowKey: string) => ScoreBucket;
}

function MetricsTable({ rowKeys, rowLabel, columns, getBucket }: MetricsTableProps) {
  if (columns.length === 0) {
    return <p className="text-sm text-zinc-500">No columns to compare.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2 font-medium">Category</th>
            {columns.map((col) => (
              <th key={col.id} className="px-3 py-2 font-medium">
                <div>{col.label}</div>
                {col.subLabel ? (
                  <div className="font-normal text-xs text-zinc-500">{col.subLabel}</div>
                ) : null}
              </th>
            ))}
          </tr>
          <tr className="border-b border-zinc-200 text-xs font-normal text-zinc-500 dark:border-zinc-700">
            <th className="px-3 py-1.5" />
            {columns.map((col) => (
              <th key={col.id} className="px-3 py-1.5 font-normal">
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <ScoreColumnHeader definition={SCORE_DEFINITIONS.ltf} />
                  <span>/</span>
                  <ScoreColumnHeader definition={SCORE_DEFINITIONS.ebc} />
                  <span>/</span>
                  <ScoreColumnHeader definition={SCORE_DEFINITIONS.aid} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {rowKeys.map((rowKey) => (
            <tr key={rowKey} className="bg-white dark:bg-zinc-950">
              <td className="px-3 py-2 font-medium">{rowLabel(rowKey)}</td>
              {columns.map((col) => {
                const bucket = getBucket(col.id, rowKey);
                return (
                  <td key={col.id} className="px-3 py-2 font-mono text-xs">
                    <span title={`Scored: ${formatScored(bucket)}`}>
                      {formatMetricCell(bucket)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JudgeMetricsPanel() {
  const [entries, setEntries] = useState<JudgeRunExportEntry[]>([]);
  const [metrics, setMetrics] = useState<RunJudgeMetrics[]>([]);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{ source: string; message: string }[]>([]);
  const [view, setView] = useState<ViewMode>("within");
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  const [selectedJudgeId, setSelectedJudgeId] = useState<string>("");
  const [selectedPairKeys, setSelectedPairKeys] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;

    setImporting(true);
    setImportErrors([]);

    try {
      const result = await importJudgeRunsFromFiles(list);
      if (result.entries.length === 0 && result.errors.length > 0) {
        setImportErrors(result.errors);
        setStatusMessage(null);
        return;
      }

      const merged = mergeExportEntries(entries, result.entries);
      setEntries(merged);
      setMetrics(metricsFromExportEntries(merged));

      const judgeRunCount = merged.length;
      setStatusMessage(
        `Loaded ${judgeRunCount} judge run${judgeRunCount === 1 ? "" : "s"} from ${result.fileCount} file${result.fileCount === 1 ? "" : "s"}`,
      );
      setImportErrors(result.errors);
    } catch (err) {
      setImportErrors([
        {
          source: "import",
          message: err instanceof Error ? err.message : "Failed to import files",
        },
      ]);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [entries]);

  const clearData = useCallback(() => {
    setEntries([]);
    setMetrics([]);
    setStatusMessage(null);
    setImportErrors([]);
    setSelectedRunIds(new Set());
    setSelectedJudgeId("");
    setSelectedPairKeys(new Set());
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const hasMetrics = metrics.some((r) => r.judge_runs.length > 0);

  useEffect(() => {
    if (metrics.length === 0) return;
    setSelectedRunIds((prev) => {
      if (prev.size > 0) return prev;
      return new Set(metrics.map((r) => r.run_id));
    });
  }, [metrics]);

  const judgeIds = useMemo(() => distinctJudgeIds(metrics), [metrics]);

  useEffect(() => {
    if (judgeIds.length === 0) return;
    setSelectedJudgeId((prev) => (prev && judgeIds.includes(prev) ? prev : judgeIds[0]));
  }, [judgeIds]);

  const pairs = useMemo(() => allJudgeRunPairs(metrics), [metrics]);

  useEffect(() => {
    if (pairs.length === 0) return;
    setSelectedPairKeys((prev) => {
      if (prev.size > 0) return prev;
      return new Set(pairs.slice(0, Math.min(3, pairs.length)).map((p) => pairKey(p.runId, p.judgeRun.judge_run_id)));
    });
  }, [pairs]);

  const rowKeys = useMemo(() => [...CATEGORY_ORDER, "__overall__"], []);
  const rowLabel = useCallback(
    (key: string) => (key === "__overall__" ? "Overall" : CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS]),
    [],
  );

  const toggleRun = (runId: string) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const togglePair = (key: string) => {
    setSelectedPairKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const withinRuns = metrics.filter((r) => selectedRunIds.has(r.run_id));

  const crossIdRuns = useMemo(() => {
    if (!selectedJudgeId) return [];
    return metrics
      .map((run) => ({ run, judgeRun: latestJudgeRunById(run, selectedJudgeId) }))
      .filter((entry): entry is { run: RunJudgeMetrics; judgeRun: JudgeRunMetrics } => entry.judgeRun != null);
  }, [metrics, selectedJudgeId]);

  const crossRunColumns = useMemo(() => {
    return pairs
      .filter((p) => selectedPairKeys.has(pairKey(p.runId, p.judgeRun.judge_run_id)))
      .map((p) => ({
        id: pairKey(p.runId, p.judgeRun.judge_run_id),
        label: `${p.runId} · ${p.judgeRun.judge_id}`,
        subLabel: `${p.targetModel} / ${p.judgeRun.judge_run_id}`,
        judgeRun: p.judgeRun,
      }));
  }, [pairs, selectedPairKeys]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600">
          {importing ? "Importing…" : "Upload JSON / ZIP"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            multiple
            className="sr-only"
            disabled={importing}
            onChange={(event) => {
              const selected = event.target.files;
              if (selected?.length) {
                void handleFiles(selected);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-600"
          disabled={!hasMetrics && !statusMessage}
          onClick={clearData}
        >
          Clear
        </button>
        {statusMessage ? (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{statusMessage}</span>
        ) : null}
      </div>

      {importErrors.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Import warnings</p>
          <ul className="mt-1 list-inside list-disc">
            {importErrors.map((err) => (
              <li key={`${err.source}:${err.message}`}>
                <span className="font-mono text-xs">{err.source}</span>: {err.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!hasMetrics ? (
        <p className="text-sm text-zinc-500">
          Upload exported judge-run JSON files (or a ZIP from the Judges page). Files should match
          export format v1, named like{" "}
          <span className="font-mono text-xs">generate_run__judge_id.json</span>.
        </p>
      ) : (
        <>
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${
                  view === tab.id
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
                onClick={() => setView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {view === "within" ? (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Generate runs</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {metrics.map((run) => (
                    <label key={run.run_id} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedRunIds.has(run.run_id)}
                        onChange={() => toggleRun(run.run_id)}
                      />
                      <span>
                        {run.run_id}
                        <span className="ml-1 text-zinc-500">({run.target_model})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {withinRuns.length === 0 ? (
                <p className="text-sm text-zinc-500">Select at least one generate run.</p>
              ) : (
                withinRuns.map((run) => (
                  <div key={run.run_id} className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      {run.run_id}
                      <span className="ml-2 font-normal text-zinc-500">{run.target_model}</span>
                    </h3>
                    <MetricsTable
                      rowKeys={rowKeys}
                      rowLabel={rowLabel}
                      columns={run.judge_runs.map((jr) => ({
                        id: jr.judge_run_id,
                        label: judgeColumnLabel(jr),
                        subLabel: judgeColumnSubLabel(jr),
                        judgeRun: jr,
                      }))}
                      getBucket={(columnId, rowKey) => {
                        const jr = run.judge_runs.find((j) => j.judge_run_id === columnId);
                        if (!jr) {
                          return {
                            count: 0,
                            ok_count: 0,
                            mean_ltf: null,
                            mean_ebc: null,
                            aid_rate: null,
                          };
                        }
                        return bucketForRow(jr, rowKey);
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          ) : null}

          {view === "cross-id" ? (
            <div className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Judge ID</span>
                <select
                  className="max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
                  value={selectedJudgeId}
                  onChange={(e) => setSelectedJudgeId(e.target.value)}
                >
                  {judgeIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <MetricsTable
                rowKeys={rowKeys}
                rowLabel={rowLabel}
                columns={crossIdRuns.map(({ run, judgeRun }) => ({
                  id: run.run_id,
                  label: run.run_id,
                  subLabel: `${run.target_model} · ${judgeRun.judge_run_id}`,
                  judgeRun,
                }))}
                getBucket={(columnId, rowKey) => {
                  const entry = crossIdRuns.find((e) => e.run.run_id === columnId);
                  if (!entry) {
                    return {
                      count: 0,
                      ok_count: 0,
                      mean_ltf: null,
                      mean_ebc: null,
                      aid_rate: null,
                    };
                  }
                  return bucketForRow(entry.judgeRun, rowKey);
                }}
              />
            </div>
          ) : null}

          {view === "cross-run" ? (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Judge run pairs</legend>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
                  {pairs.map((p) => {
                    const key = pairKey(p.runId, p.judgeRun.judge_run_id);
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedPairKeys.has(key)}
                          onChange={() => togglePair(key)}
                        />
                        <span>
                          {p.runId} / {p.judgeRun.judge_run_id}
                          <span className="ml-1 text-zinc-500">
                            ({p.judgeRun.judge_id} · {p.judgeRun.judge_model})
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <MetricsTable
                rowKeys={rowKeys}
                rowLabel={rowLabel}
                columns={crossRunColumns}
                getBucket={(columnId, rowKey) => {
                  const { runId, judgeRunId } = parsePairKey(columnId);
                  const pair = pairs.find(
                    (p) => p.runId === runId && p.judgeRun.judge_run_id === judgeRunId,
                  );
                  if (!pair) {
                    return {
                      count: 0,
                      ok_count: 0,
                      mean_ltf: null,
                      mean_ebc: null,
                      aid_rate: null,
                    };
                  }
                  return bucketForRow(pair.judgeRun, rowKey);
                }}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
