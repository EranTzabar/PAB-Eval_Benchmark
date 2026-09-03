"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FillProgressBar } from "@/components/FillProgressBar";
import {
  createInitialExportProgress,
  exportJudgeRuns,
  judgeRunRowKey,
  overallProgressPct,
  runProgressPct,
  type JudgeRunsExportFormat,
  type JudgeRunsExportProgress,
  type RunExportStatus,
} from "@/lib/judgeRunsExport";
import type { JudgeRunListItem } from "@/types/api";

interface JudgeRunsExportModalProps {
  open: boolean;
  items: JudgeRunListItem[];
  format: JudgeRunsExportFormat;
  onClose: () => void;
}

function statusLabel(state: RunExportStatus["state"]): string {
  switch (state) {
    case "pending":
      return "Pending";
    case "fetching":
      return "Downloading";
    case "done":
      return "Done";
    case "error":
      return "Error";
  }
}

function statusClass(state: RunExportStatus["state"]): string {
  switch (state) {
    case "pending":
      return "text-zinc-500 dark:text-zinc-400";
    case "fetching":
      return "text-sky-600 dark:text-sky-400";
    case "done":
      return "text-emerald-600 dark:text-emerald-400";
    case "error":
      return "text-red-600 dark:text-red-400";
  }
}

function scoreCountLabel(run: RunExportStatus): string {
  if (run.state === "pending") return "—";
  if (run.scoresTotal != null) {
    return `${run.scoresLoaded.toLocaleString()} / ${run.scoresTotal.toLocaleString()}`;
  }
  return `${run.scoresLoaded.toLocaleString()} loaded`;
}

function RunExportRow({ run }: { run: RunExportStatus }) {
  const pct = runProgressPct(run);
  const indeterminate = run.state === "fetching" && pct == null;

  return (
    <li className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-zinc-900 dark:text-zinc-100">{run.run_id}</p>
          <p className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {run.judge_run_id}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xs font-medium ${statusClass(run.state)}`}>{statusLabel(run.state)}</p>
          <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {scoreCountLabel(run)}
          </p>
        </div>
      </div>
      <div className="mt-2">
        <FillProgressBar
          compact
          showLabel={false}
          value={pct ?? 0}
          indeterminate={indeterminate}
          label={`${run.run_id} / ${run.judge_run_id}`}
        />
      </div>
      {run.error ? <p className="mt-1 text-xs text-red-600">{run.error}</p> : null}
    </li>
  );
}

export function JudgeRunsExportModal({
  open,
  items,
  format,
  onClose,
}: JudgeRunsExportModalProps) {
  const [progress, setProgress] = useState<JudgeRunsExportProgress>(() =>
    createInitialExportProgress(items),
  );
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [savedRunCount, setSavedRunCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const onCloseRef = useRef(onClose);
  const exportSessionRef = useRef(0);
  /** Ensures one export per modal-open, surviving React Strict Mode remounts. */
  const startedForOpenRef = useRef(false);
  const itemsRef = useRef(items);
  const formatRef = useRef(format);

  onCloseRef.current = onClose;
  itemsRef.current = items;
  formatRef.current = format;

  const closeModal = useCallback(() => {
    abortRef.current?.abort();
    startedForOpenRef.current = false;
    onCloseRef.current();
  }, []);

  const runExport = useCallback((snapshotItems: JudgeRunListItem[], snapshotFormat: JudgeRunsExportFormat) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const session = ++exportSessionRef.current;

    setRunning(true);
    setCompleted(false);
    setSavedRunCount(0);
    setError(null);
    setProgress(createInitialExportProgress(snapshotItems));

    void (async () => {
      try {
        const exported = await exportJudgeRuns(snapshotItems, snapshotFormat, {
          signal: controller.signal,
          onProgress: (next) => {
            if (session === exportSessionRef.current) {
              setProgress(next);
            }
          },
        });
        if (session !== exportSessionRef.current || controller.signal.aborted) return;
        setSavedRunCount(exported.length);
        setCompleted(true);
      } catch (err) {
        if (controller.signal.aborted || session !== exportSessionRef.current) return;
        setError(err instanceof Error ? err.message : "Export failed");
      } finally {
        if (session === exportSessionRef.current) {
          setRunning(false);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!open) {
      // User closed the modal — cancel any in-flight work and allow a fresh start next open.
      startedForOpenRef.current = false;
      abortRef.current?.abort();
      setCompleted(false);
      setError(null);
      return;
    }

    // Do not restart (or abort) on Strict Mode remount / parent re-render.
    if (startedForOpenRef.current) return;
    startedForOpenRef.current = true;

    runExport(itemsRef.current, formatRef.current);
  }, [open, runExport]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeModal]);

  if (!open) return null;

  const overallPct = completed ? 100 : overallProgressPct(progress);
  const { overall } = progress;
  const overallIndeterminate =
    !completed &&
    progress.phase === "fetching" &&
    overall.scoresTotal == null &&
    overall.runsDone === 0 &&
    progress.runs.some((run) => run.state === "fetching");

  const overallLabel = completed
    ? savedRunCount === 1
      ? `Saved 1 file as <Generate run>__<Judge>.${format}`
      : `Saved ZIP with ${savedRunCount} files named <Generate run>__<Judge>.${format}`
    : progress.phase === "building"
      ? savedRunCount > 1 || items.length > 1
        ? `Building ZIP…`
        : `Saving ${format.toUpperCase()} file…`
      : overall.scoresTotal != null
        ? `${overall.scoresLoaded.toLocaleString()} / ${overall.scoresTotal.toLocaleString()} scores · ${overall.runsDone} / ${overall.runsTotal} runs done`
        : `${overall.scoresLoaded.toLocaleString()} scores loaded · ${overall.runsDone} / ${overall.runsTotal} runs done`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => {
        if (!running) closeModal();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-lg border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="judge-runs-export-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="judge-runs-export-modal-title" className="text-lg font-semibold">
          {completed ? "Download complete" : "Downloading judge runs"}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {items.length} judge run{items.length === 1 ? "" : "s"} · {format.toUpperCase()}
          {completed && items.length > 1 ? " · packaged as ZIP" : ""}
        </p>

        <div className="mt-4 shrink-0 space-y-3">
          <FillProgressBar
            value={overallPct}
            label={overallLabel}
            indeterminate={overallIndeterminate}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {completed ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {savedRunCount === 1 ? (
                <>
                  File named like{" "}
                  <span className="font-mono text-xs">
                    gemini_3.6_flash_trump_1__Gemini_36_Flash.{format}
                  </span>
                </>
              ) : (
                <>
                  Open the ZIP — inside you&apos;ll find one{" "}
                  <span className="font-mono text-xs">
                    {"<Generate run>__<Judge>."}
                    {format}
                  </span>{" "}
                  per run
                </>
              )}
            </p>
          ) : null}
        </div>

        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {progress.runs.map((run) => (
            <RunExportRow key={judgeRunRowKey(run)} run={run} />
          ))}
        </ul>

        <div className="mt-4 flex shrink-0 justify-end gap-2">
          {error ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              onClick={() => {
                startedForOpenRef.current = true;
                runExport(itemsRef.current, formatRef.current);
              }}
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            onClick={closeModal}
          >
            {running ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
