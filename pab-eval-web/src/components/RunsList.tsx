"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ConfigDetailModal } from "@/components/ConfigDetailModal";
import { deleteRun, listConfigSummaries, listRuns, renameRun } from "@/lib/api";
import { isTrackableJobState } from "@/lib/runs";
import type { ConfigSummary, JobState, RenameStatus, RunListItem } from "@/types/api";

const RUN_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

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

function displayState(run: RunListItem): JobState | "idle" {
  return run.job?.state ?? "idle";
}

function isRunEditable(run: RunListItem): boolean {
  const state = run.job?.state;
  return state !== "running" && state !== "awaiting_decision";
}

function sortRuns(runs: RunListItem[]): RunListItem[] {
  return [...runs].sort((a, b) => {
    const aTime = a.manifest?.started_at ?? a.run_id;
    const bTime = b.manifest?.started_at ?? b.run_id;
    return bTime.localeCompare(aTime);
  });
}

function formatRenameStatus(status: RenameStatus): string {
  const { old_run_id, new_run_id, phase, copied, total, skipped } = status;
  if (phase === "deleting") {
    return `Renaming ${old_run_id} → ${new_run_id}: deleting old folder…`;
  }
  if (phase === "done" || status.status === "completed") {
    return `Renamed ${old_run_id} → ${new_run_id}`;
  }
  const done = copied + skipped;
  const suffix = skipped > 0 ? ` (${skipped} already copied)` : "";
  return `Renaming ${old_run_id} → ${new_run_id}: ${done}/${total} files${suffix}`;
}

export function RunsList() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [configs, setConfigs] = useState<Map<string, ConfigSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [draftRunId, setDraftRunId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [renameStatus, setRenameStatus] = useState<RenameStatus | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [runItems, configItems] = await Promise.all([listRuns(), listConfigSummaries()]);
      setRuns(sortRuns(runItems));
      setConfigs(new Map(configItems.map((c) => [c.config_id, c])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (runId: string) => {
    setEditingRunId(runId);
    setDraftRunId(runId);
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingRunId(null);
    setDraftRunId("");
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editingRunId) return;
    const trimmed = draftRunId.trim();
    if (!RUN_ID_PATTERN.test(trimmed)) {
      setSaveError("Use 1–64 chars: letters, digits, . _ -");
      return;
    }
    if (trimmed === editingRunId) {
      cancelEdit();
      return;
    }

    setSaving(true);
    setSaveError(null);
    setRenameStatus(null);
    try {
      await renameRun(editingRunId, trimmed, setRenameStatus);
      cancelEdit();
      setRenameStatus(null);
      await load({ silent: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to rename run");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (runId: string) => {
    if (
      !window.confirm(
        `Delete run "${runId}"? All responses, checkpoints, and judge scores for this run will be removed.`,
      )
    ) {
      return;
    }
    setDeletingRunId(runId);
    setError(null);
    try {
      await deleteRun(runId);
      setRuns((prev) => prev.filter((run) => run.run_id !== runId));
      if (editingRunId === runId) {
        cancelEdit();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete run");
    } finally {
      setDeletingRunId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading runs…</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No runs yet.{" "}
        <Link href="/" className="underline">
          Start one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
          onClick={() => void load()}
          disabled={saving}
        >
          Refresh
        </button>
      </div>

      {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
      {renameStatus && saving ? (
        <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
          <p>{formatRenameStatus(renameStatus)}</p>
          {renameStatus.total > 0 ? (
            <div className="h-2 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
              <div
                className="h-full rounded-full bg-sky-600 transition-all dark:bg-sky-400"
                style={{
                  width: `${Math.min(100, Math.round(((renameStatus.copied + renameStatus.skipped) / renameStatus.total) * 100))}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 ${saving || deletingRunId ? "pointer-events-none opacity-60" : ""}`}
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Run ID</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Config</th>
              <th className="px-4 py-2 font-medium">Config ID</th>
              <th className="px-4 py-2 font-medium">Progress</th>
              <th className="px-4 py-2 font-medium">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {runs.map((run) => {
              const state = displayState(run);
              const configId = run.manifest?.config_id ?? "—";
              const config = configId !== "—" ? configs.get(configId) : undefined;
              const configLabel = config?.name ?? run.manifest?.target_model ?? "—";
              const progress = run.job?.progress;
              const isEditing = editingRunId === run.run_id;
              const editable = isRunEditable(run);

              return (
                <tr key={run.run_id} className="bg-white dark:bg-zinc-950">
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          className="min-w-[10rem] rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
                          value={draftRunId}
                          onChange={(e) => setDraftRunId(e.target.value)}
                          disabled={saving}
                        />
                        <button
                          type="button"
                          className="text-xs font-medium text-zinc-900 underline dark:text-zinc-100"
                          onClick={() => void saveEdit()}
                          disabled={saving}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-zinc-500 underline"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{run.run_id}</span>
                        {state !== "idle" && isTrackableJobState(state) ? (
                          <Link
                            href={`/?track=${encodeURIComponent(run.run_id)}`}
                            className="text-xs font-medium text-sky-700 underline hover:text-sky-900 dark:text-sky-300"
                          >
                            Track
                          </Link>
                        ) : null}
                        {editable ? (
                          <>
                            <button
                              type="button"
                              className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                              onClick={() => startEdit(run.run_id)}
                              disabled={editingRunId !== null || deletingRunId !== null}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-xs text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              onClick={() => void handleDelete(run.run_id)}
                              disabled={
                                editingRunId !== null ||
                                deletingRunId !== null ||
                                deletingRunId === run.run_id
                              }
                            >
                              {deletingRunId === run.run_id ? "Deleting…" : "Delete"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase ${stateBadgeClass(state)}`}
                    >
                      {state.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {configId !== "—" ? (
                      <button
                        type="button"
                        className="text-left underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:decoration-zinc-600 dark:hover:decoration-zinc-300"
                        onClick={() => setSelectedConfigId(configId)}
                      >
                        {configLabel}
                      </button>
                    ) : (
                      configLabel
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {configId !== "—" ? (
                      <button
                        type="button"
                        className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:decoration-zinc-600 dark:hover:decoration-zinc-300"
                        onClick={() => setSelectedConfigId(configId)}
                      >
                        {configId}
                      </button>
                    ) : (
                      configId
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {progress
                      ? `${progress.completed} done · ${progress.failed} failed · ${progress.remaining} left`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {run.manifest?.started_at
                      ? new Date(run.manifest.started_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfigDetailModal
        configId={selectedConfigId}
        onClose={() => setSelectedConfigId(null)}
        editReturnTo="/"
      />
    </div>
  );
}
