"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cancelRun, getRun, startRun, submitRunDecision } from "@/lib/api";
import { useRunEvents } from "@/lib/sse";
import type { FailureDetail, Job, JobState, RunEvent, StartRunRequest } from "@/types/api";

import { FailureDecisionPanel } from "./FailureDecisionPanel";
import { ProgressBar } from "./ProgressBar";

const TERMINAL: JobState[] = ["completed", "failed", "stopped", "cancelled"];

const RESUMABLE: JobState[] = ["stopped", "cancelled"];

function isResumableState(state: JobState): boolean {
  return RESUMABLE.includes(state);
}

function isTerminalState(state: JobState): boolean {
  return TERMINAL.includes(state);
}

function stateBadgeClass(state: JobState): string {
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
    default:
      return "bg-zinc-100 text-zinc-800";
  }
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

interface GenerateRunPanelProps {
  runId: string;
  initialJob: Job;
  resumeParams: StartRunRequest;
  onTerminal?: () => void;
}

export function GenerateRunPanel({
  runId,
  initialJob,
  resumeParams,
  onTerminal,
}: GenerateRunPanelProps) {
  const [job, setJob] = useState<Job>(initialJob);
  const [targetModel, setTargetModel] = useState<string | null>(null);
  const [pendingDetail, setPendingDetail] = useState<FailureDetail | null>(
    initialJob.pending_decision,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [streamOpen, setStreamOpen] = useState(true);
  const [, tick] = useState(0);
  const mountedRef = useRef(true);

  const isTerminal = isTerminalState(job.state);
  const streamEnabled = streamOpen && !isTerminal;

  const closeStream = useRunEvents(
    runId,
    useCallback(
      (type: string, data: RunEvent) => {
        if (!mountedRef.current) return;
        setJob(data.job);
        if (type === "awaiting_decision" && data.detail) {
          setPendingDetail(data.detail);
        }
        if (type === "decision") {
          setPendingDetail(null);
        }
        if (type === "finished" || type === "error") {
          setStreamOpen(false);
          onTerminal?.();
        }
      },
      [onTerminal],
    ),
    streamEnabled,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeStream();
    };
  }, [closeStream]);

  useEffect(() => {
    if (isTerminal) {
      setStreamOpen(false);
    }
  }, [isTerminal]);

  useEffect(() => {
    if (isTerminal) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isTerminal]);

  useEffect(() => {
    const controller = new AbortController();
    getRun(runId, controller.signal)
      .then((detail) => {
        if (!mountedRef.current) return;
        if (detail.job) setJob(detail.job);
        if (detail.manifest?.target_model) setTargetModel(detail.manifest.target_model);
      })
      .catch(() => {
        // ignore fetch errors (including abort)
      });
    return () => controller.abort();
  }, [runId]);

  useEffect(() => {
    if (isTerminal || !streamEnabled) return;
    const controller = new AbortController();
    const id = setInterval(() => {
      getRun(runId, controller.signal)
        .then((detail) => {
          if (!mountedRef.current) return;
          if (detail.job) {
            setJob(detail.job);
            if (detail.job && isTerminalState(detail.job.state)) {
              setStreamOpen(false);
            }
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [runId, isTerminal, streamEnabled]);

  const handleStop = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await cancelRun(runId);
      const detail = await getRun(runId);
      if (!mountedRef.current) return;
      if (detail.job) setJob(detail.job);
      setStreamOpen(false);
    } catch (err) {
      if (mountedRef.current) {
        setActionError(err instanceof Error ? err.message : "Failed to stop run");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleContinue = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const newJob = await startRun(resumeParams);
      if (!mountedRef.current) return;
      setJob(newJob);
      setPendingDetail(null);
      setStreamOpen(true);
    } catch (err) {
      if (mountedRef.current) {
        setActionError(err instanceof Error ? err.message : "Failed to continue run");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleDecision = async (decision: "continue" | "all" | "stop") => {
    setBusy(true);
    try {
      await submitRunDecision(runId, decision);
      if (!mountedRef.current) return;
      setPendingDetail(null);
      if (decision === "stop") {
        setStreamOpen(false);
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const { progress } = job;

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Generate run: {runId}</h2>
          {targetModel ? (
            <p className="text-sm text-zinc-500">Target model: {targetModel}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${stateBadgeClass(job.state)}`}
        >
          {job.state.replace("_", " ")}
        </span>
      </div>

      <ProgressBar
        completed={progress.completed}
        failed={progress.failed}
        remaining={progress.remaining}
      />

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-zinc-500">Current item</dt>
          <dd className="font-mono">{progress.current_item_id ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Elapsed</dt>
          <dd>{formatElapsed(job.started_at)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Started</dt>
          <dd>{new Date(job.started_at).toLocaleString()}</dd>
        </div>
      </dl>

      {job.error ? (
        <pre className="overflow-x-auto rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
          {job.error}
        </pre>
      ) : null}

      {(pendingDetail || job.pending_decision) && job.state === "awaiting_decision" ? (
        <FailureDecisionPanel
          detail={pendingDetail ?? job.pending_decision!}
          onContinue={() => void handleDecision("continue")}
          onContinueAll={() => void handleDecision("all")}
          onStop={() => void handleDecision("stop")}
          busy={busy}
        />
      ) : null}

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      {!isTerminal ? (
        <button
          type="button"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          onClick={() => void handleStop()}
          disabled={busy}
        >
          Stop
        </button>
      ) : isResumableState(job.state) ? (
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          onClick={() => void handleContinue()}
          disabled={busy}
        >
          {busy ? "Continuing…" : "Continue run"}
        </button>
      ) : null}
    </section>
  );
}
