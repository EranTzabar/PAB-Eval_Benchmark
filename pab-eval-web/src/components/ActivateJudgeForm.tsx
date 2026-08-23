"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  cancelJudgeRun,
  getJudgeRun,
  listJudges,
  listRuns,
  startJudges,
  submitJudgeDecision,
} from "@/lib/api";
import { useJudgeEvents } from "@/lib/sse";
import type {
  FailureDetail,
  Job,
  JobState,
  JudgeRunDetail,
  OnFailure,
  RunEvent,
  StartJudgeRequest,
} from "@/types/api";

import { FailureDecisionPanel } from "./FailureDecisionPanel";
import { JudgeScoresTable } from "./JudgeScoresTable";
import { ProgressBar } from "./ProgressBar";

const TERMINAL: JobState[] = ["completed", "failed", "stopped", "cancelled"];

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

interface JudgeRunPanelProps {
  runId: string;
  judgeRunId: string;
  judgeId: string;
  initialJob: Job;
  resumeParams: StartJudgeRequest;
  onTerminal?: () => void;
}

export function JudgeRunPanel({
  runId,
  judgeRunId,
  judgeId,
  initialJob,
  resumeParams,
  onTerminal,
}: JudgeRunPanelProps) {
  const [job, setJob] = useState<Job>(initialJob);
  const [judgeModel, setJudgeModel] = useState<string | null>(null);
  const [pendingDetail, setPendingDetail] = useState<FailureDetail | null>(
    initialJob.pending_decision,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [streamOpen, setStreamOpen] = useState(true);
  const [scoresRefreshKey, setScoresRefreshKey] = useState(0);
  const [, tick] = useState(0);
  const mountedRef = useRef(true);

  const isTerminal = isTerminalState(job.state);
  const streamEnabled = streamOpen && !isTerminal;

  const closeStream = useJudgeEvents(
    runId,
    judgeRunId,
    useCallback(
      (type: string, data: RunEvent) => {
        if (!mountedRef.current) return;
        setJob(data.job);
        if (type === "progress" || type === "awaiting_decision" || type === "finished") {
          setScoresRefreshKey((k) => k + 1);
        }
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
    if (isTerminal) setStreamOpen(false);
  }, [isTerminal]);

  useEffect(() => {
    if (isTerminal) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isTerminal]);

  useEffect(() => {
    const controller = new AbortController();
    getJudgeRun(runId, judgeRunId, controller.signal)
      .then((detail) => {
        if (!mountedRef.current) return;
        if (detail.job) setJob(detail.job);
        const model = detail.manifest?.judge_model;
        if (typeof model === "string") setJudgeModel(model);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [runId, judgeRunId]);

  useEffect(() => {
    if (isTerminal || !streamEnabled) return;
    const controller = new AbortController();
    const id = setInterval(() => {
      getJudgeRun(runId, judgeRunId, controller.signal)
        .then((detail) => {
          if (!mountedRef.current) return;
          if (detail.job) {
            setJob(detail.job);
            if (isTerminalState(detail.job.state)) setStreamOpen(false);
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [runId, judgeRunId, isTerminal, streamEnabled]);

  const handleStop = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await cancelJudgeRun(runId, judgeRunId);
      const detail = await getJudgeRun(runId, judgeRunId);
      if (!mountedRef.current) return;
      if (detail.job) setJob(detail.job);
      setStreamOpen(false);
    } catch (err) {
      if (mountedRef.current) {
        setActionError(err instanceof Error ? err.message : "Failed to stop judge run");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleDecision = async (decision: "continue" | "all" | "stop") => {
    setBusy(true);
    try {
      await submitJudgeDecision(runId, judgeRunId, decision);
      if (!mountedRef.current) return;
      setPendingDetail(null);
      if (decision === "stop") setStreamOpen(false);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const { progress } = job;

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            Judge run: {judgeRunId} on {runId}
          </h2>
          <p className="text-sm text-zinc-500">
            Judge: {judgeId}
            {judgeModel ? ` · ${judgeModel}` : ""}
          </p>
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

      <JudgeScoresTable
        runId={runId}
        judgeRunId={judgeRunId}
        refreshKey={scoresRefreshKey}
        isActive={!isTerminal}
      />

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
      ) : null}
    </section>
  );
}

interface ActiveJudgeRun {
  runId: string;
  judgeRunId: string;
  judgeId: string;
  job: Job;
  resumeParams: StartJudgeRequest;
}

function jobFromJudgeRunDetail(
  detail: JudgeRunDetail,
  runId: string,
  judgeRunId: string,
): Job {
  if (detail.job) return detail.job;

  const manifest = detail.manifest ?? {};
  const cp = detail.checkpoint as
    | {
        completed?: string[];
        failed?: Record<string, unknown>;
        last_item_id?: string | null;
      }
    | undefined;
  const completed = cp?.completed?.length ?? 0;
  const failed = cp?.failed ? Object.keys(cp.failed).length : 0;
  const startedAt =
    typeof manifest.started_at === "string" ? manifest.started_at : new Date().toISOString();

  return {
    job_id: `judge:${runId}:${judgeRunId}`,
    kind: "judge",
    run_id: runId,
    judge_run_id: judgeRunId,
    state: completed + failed > 0 ? "completed" : "stopped",
    progress: {
      completed,
      failed,
      remaining: 0,
      current_item_id: cp?.last_item_id ?? null,
    },
    pending_decision: null,
    error: null,
    started_at: startedAt,
    finished_at: null,
  };
}

export function ActivateJudgeForm() {
  const searchParams = useSearchParams();
  const trackRun = searchParams.get("trackRun");
  const trackJudge = searchParams.get("trackJudge");

  const [runs, setRuns] = useState<{ run_id: string; label: string }[]>([]);
  const [judges, setJudges] = useState<
    Array<{ judge_id: string; name: string; api_key_set: boolean }>
  >([]);
  const [runId, setRunId] = useState("");
  const [selectedJudgeIds, setSelectedJudgeIds] = useState<string[]>([]);
  const [onFailure, setOnFailure] = useState<OnFailure>("ask");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeRuns, setActiveRuns] = useState<ActiveJudgeRun[]>([]);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [discoveringTrack, setDiscoveringTrack] = useState(
    Boolean(trackRun && trackJudge),
  );

  useEffect(() => {
    if (!trackRun || !trackJudge) {
      setDiscoveringTrack(false);
      return;
    }

    let cancelled = false;
    setDiscoveringTrack(true);
    setTrackError(null);

    getJudgeRun(trackRun, trackJudge)
      .then((detail) => {
        if (cancelled) return;
        if (!detail.manifest && !detail.job) {
          setTrackError(`Judge run not found: ${trackRun} / ${trackJudge}`);
          return;
        }
        const manifest = detail.manifest ?? {};
        const judgeId =
          typeof manifest.judge_id === "string" ? manifest.judge_id : trackJudge;
        setActiveRuns([
          {
            runId: trackRun,
            judgeRunId: trackJudge,
            judgeId,
            job: jobFromJudgeRunDetail(detail, trackRun, trackJudge),
            resumeParams: { judge_ids: [judgeId], on_failure: "ask" },
          },
        ]);
      })
      .catch((err) => {
        if (!cancelled) {
          setTrackError(err instanceof Error ? err.message : "Failed to load judge run");
        }
      })
      .finally(() => {
        if (!cancelled) setDiscoveringTrack(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackRun, trackJudge]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listRuns(), listJudges()])
      .then(([runItems, judgeItems]) => {
        if (cancelled) return;
        const sorted = [...runItems].sort((a, b) => {
          const aTime = a.manifest?.started_at ?? a.run_id;
          const bTime = b.manifest?.started_at ?? b.run_id;
          return bTime.localeCompare(aTime);
        });
        setRuns(
          sorted.map((r) => ({
            run_id: r.run_id,
            label: `${r.run_id}${r.job?.state ? ` (${r.job.state.replace("_", " ")})` : ""}`,
          })),
        );
        if (sorted.length > 0) setRunId(sorted[0].run_id);
        setJudges(
          judgeItems.map((j) => ({
            judge_id: j.judge_id,
            name: j.name,
            api_key_set: j.api_key_set,
          })),
        );
        const firstReady = judgeItems.find((j) => j.api_key_set);
        if (firstReady) setSelectedJudgeIds([firstReady.judge_id]);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleJudge = (judgeId: string, enabled: boolean) => {
    if (!enabled) return;
    setSelectedJudgeIds((prev) =>
      prev.includes(judgeId) ? prev.filter((id) => id !== judgeId) : [...prev, judgeId],
    );
  };

  const canSubmit =
    !submitting && runId && selectedJudgeIds.length > 0 && selectedJudgeIds.every((id) => {
      const j = judges.find((x) => x.judge_id === id);
      return j?.api_key_set;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    const resumeParams: StartJudgeRequest = {
      judge_ids: selectedJudgeIds,
      on_failure: onFailure,
    };
    try {
      const jobs = await startJudges(runId, resumeParams);
      setActiveRuns(
        jobs.map((job, i) => ({
          runId,
          judgeRunId: job.judge_run_id ?? selectedJudgeIds[i] ?? job.job_id,
          judgeId: selectedJudgeIds[i] ?? "",
          job,
          resumeParams: {
            judge_ids: [selectedJudgeIds[i] ?? ""],
            on_failure: onFailure,
          },
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start judge run");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || discoveringTrack) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  if (trackError && activeRuns.length === 0) {
    return <p className="text-sm text-amber-700 dark:text-amber-400">{trackError}</p>;
  }

  if (activeRuns.length > 0) {
    return (
      <div className="space-y-6">
        {activeRuns.map((active) => (
          <JudgeRunPanel
            key={`${active.runId}:${active.judgeRunId}`}
            runId={active.runId}
            judgeRunId={active.judgeRunId}
            judgeId={active.judgeId}
            initialJob={active.job}
            resumeParams={active.resumeParams}
          />
        ))}
        <button
          type="button"
          className="text-sm underline"
          onClick={() => setActiveRuns([])}
        >
          Start another judge run
        </button>
      </div>
    );
  }

  if (judges.length === 0) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        No judges configured.{" "}
        <Link href="/judges/new" className="underline">
          Add a judge
        </Link>{" "}
        first.
      </p>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        No generate runs found. Complete a generate run first so responses exist to score.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Generate run</span>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          disabled={submitting}
        >
          {runs.map((r) => (
            <option key={r.run_id} value={r.run_id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Judges</legend>
        {judges.map((judge) => (
          <label
            key={judge.judge_id}
            className={`flex items-start gap-2 text-sm ${!judge.api_key_set ? "opacity-60" : ""}`}
          >
            <input
              type="checkbox"
              checked={selectedJudgeIds.includes(judge.judge_id)}
              onChange={() => toggleJudge(judge.judge_id, judge.api_key_set)}
              disabled={submitting || !judge.api_key_set}
            />
            <span>
              {judge.name}{" "}
              <span className="font-mono text-xs text-zinc-500">({judge.judge_id})</span>
              {!judge.api_key_set ? (
                <span className="block text-xs text-amber-700 dark:text-amber-400">
                  API key not set — edit judge and add env var to .env
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      <label className="block space-y-1">
        <span className="text-sm font-medium">On failure</span>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={onFailure}
          onChange={(e) => setOnFailure(e.target.value as OnFailure)}
          disabled={submitting}
        >
          <option value="ask">Ask (park and wait for decision)</option>
          <option value="abort">Abort run</option>
          <option value="continue">Continue automatically</option>
        </select>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        disabled={!canSubmit}
      >
        {submitting ? "Starting…" : "Start judge run"}
      </button>
    </form>
  );
}
