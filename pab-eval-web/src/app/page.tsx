"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { GenerateRunPanel } from "@/components/GenerateRunPanel";
import { SetupBanner, useSetupStatus } from "@/components/SetupBanner";
import { StartRunForm } from "@/components/StartRunForm";
import { attachToActiveRun, findActiveGenerateRun } from "@/lib/api";
import { isTrackableJobState } from "@/lib/runs";
import type { Job, StartRunRequest } from "@/types/api";

function HomeContent() {
  const setup = useSetupStatus();
  const searchParams = useSearchParams();
  const initialConfigId = searchParams.get("config") ?? undefined;
  const trackRunId = searchParams.get("track") ?? undefined;
  const [activeRun, setActiveRun] = useState<{ startParams: StartRunRequest; job: Job } | null>(
    null,
  );
  const [liveJob, setLiveJob] = useState<Job | null>(null);
  const [discovering, setDiscovering] = useState(true);
  const [trackError, setTrackError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDiscovering(true);
    setTrackError(null);

    const load = trackRunId
      ? attachToActiveRun(trackRunId)
      : findActiveGenerateRun();

    load
      .then((attached) => {
        if (cancelled) return;
        if (attached) {
          setActiveRun(attached);
          setLiveJob(attached.job);
        } else if (trackRunId) {
          setTrackError(`Run "${trackRunId}" is not active on the server.`);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTrackError(err instanceof Error ? err.message : "Failed to attach to run");
        }
      })
      .finally(() => {
        if (!cancelled) setDiscovering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackRunId]);

  const handleStarted = (startParams: StartRunRequest, job: Job) => {
    setActiveRun({ startParams, job });
    setLiveJob(job);
  };

  const handleLeaveRun = () => {
    setActiveRun(null);
    setLiveJob(null);
  };

  const jobState = liveJob?.state ?? activeRun?.job.state;
  const runInProgress = Boolean(jobState && isTrackableJobState(jobState));
  const showStartForm = !discovering && !activeRun;
  const showStartNewRun = Boolean(activeRun && jobState && !isTrackableJobState(jobState));

  return (
    <>
      <SetupBanner status={setup} />

      {discovering ? (
        <p className="text-sm text-zinc-500">Checking for active runs…</p>
      ) : null}

      {trackError && !activeRun && !discovering ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">{trackError}</p>
      ) : null}

      {runInProgress && activeRun ? (
        <p className="text-sm text-sky-800 dark:text-sky-200">
          A generate run is in progress. Finish or stop it before starting another.
        </p>
      ) : null}

      {activeRun ? (
        <>
          <GenerateRunPanel
            key={activeRun.startParams.run_id}
            runId={activeRun.startParams.run_id}
            initialJob={activeRun.job}
            resumeParams={activeRun.startParams}
            onJobUpdate={setLiveJob}
          />
          {showStartNewRun ? (
            <button
              type="button"
              className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              onClick={handleLeaveRun}
            >
              Start new run
            </button>
          ) : null}
        </>
      ) : null}

      {showStartForm ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <h2 className="mb-4 text-lg font-semibold">New run</h2>
          <StartRunForm
            setupReady={setup.ready}
            initialConfigId={initialConfigId}
            onStarted={handleStarted}
          />
        </section>
      ) : null}
    </>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">PAB-Eval — Generate</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Start and monitor the generate pipe (pipe 1). Judge scoring is not in this UI yet.
        </p>
        <Link
          href="/configs"
          className="mt-2 inline-block text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Configurations manage
        </Link>
        <span className="mx-2 text-zinc-400">·</span>
        <Link
          href="/runs"
          className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          All runs
        </Link>
      </header>

      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
