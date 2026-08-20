"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { GenerateRunPanel } from "@/components/GenerateRunPanel";
import { SetupBanner, useSetupStatus } from "@/components/SetupBanner";
import { StartRunForm } from "@/components/StartRunForm";
import type { Job, StartRunRequest } from "@/types/api";

function HomeContent() {
  const setup = useSetupStatus();
  const searchParams = useSearchParams();
  const initialConfigId = searchParams.get("config") ?? undefined;
  const [activeRun, setActiveRun] = useState<{ startParams: StartRunRequest; job: Job } | null>(
    null,
  );

  const handleLeaveRun = () => {
    setActiveRun(null);
  };

  return (
    <>
      <SetupBanner status={setup} />

      {!activeRun ? (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <h2 className="mb-4 text-lg font-semibold">New run</h2>
          <StartRunForm
            setupReady={setup.ready}
            initialConfigId={initialConfigId}
            onStarted={(startParams, job) => setActiveRun({ startParams, job })}
          />
        </section>
      ) : (
        <>
          <GenerateRunPanel
            key={activeRun.startParams.run_id}
            runId={activeRun.startParams.run_id}
            initialJob={activeRun.job}
            resumeParams={activeRun.startParams}
          />
          <button
            type="button"
            className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            onClick={handleLeaveRun}
          >
            Start another run
          </button>
        </>
      )}
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
