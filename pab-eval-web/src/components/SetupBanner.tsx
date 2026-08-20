"use client";

import { useCallback, useEffect, useState } from "react";

import { getDatasetStatus, getEnvStatus, getHealth } from "@/lib/api";

export interface SetupStatus {
  ready: boolean;
  loading: boolean;
  healthOk: boolean;
  envOk: boolean;
  datasetOk: boolean;
  envVars: Record<string, boolean>;
  datasetError: string | null;
  datasetInfo: string | null;
}

const CRITICAL_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "TARGET_API_KEY",
];

export function useSetupStatus(): SetupStatus {
  const [status, setStatus] = useState<SetupStatus>({
    ready: false,
    loading: true,
    healthOk: false,
    envOk: false,
    datasetOk: false,
    envVars: {},
    datasetError: null,
    datasetInfo: null,
  });

  const refresh = useCallback(async (alive?: { current: boolean }) => {
    setStatus((s) => ({ ...s, loading: true }));

    let healthOk = false;
    let envVars: Record<string, boolean> = {};
    let envOk = false;
    let datasetOk = false;
    let datasetError: string | null = null;
    let datasetInfo: string | null = null;

    try {
      await getHealth();
      healthOk = true;
    } catch {
      healthOk = false;
    }

    if (alive && !alive.current) return;

    if (healthOk) {
      try {
        envVars = await getEnvStatus();
        envOk = CRITICAL_ENV.every((key) => envVars[key]);
      } catch {
        envOk = false;
      }

      const ds = await getDatasetStatus();
      datasetOk = ds.valid === true;
      if (!datasetOk) {
        datasetError = ds.error ?? "Dataset validation failed";
      } else {
        datasetInfo = `${ds.total_instances ?? 0} instances (${ds.singles ?? 0} singles, ${ds.turns ?? 0} chain turns)`;
      }
    }

    if (alive && !alive.current) return;

    setStatus({
      ready: healthOk && envOk && datasetOk,
      loading: false,
      healthOk,
      envOk,
      datasetOk,
      envVars,
      datasetError,
      datasetInfo,
    });
  }, []);

  useEffect(() => {
    const alive = { current: true };
    void refresh(alive);
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  return { ...status, refresh: () => refresh() } as SetupStatus & { refresh: () => Promise<void> };
}

interface SetupBannerProps {
  status: SetupStatus;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
    />
  );
}

export function SetupBanner({ status }: SetupBannerProps) {
  if (status.loading) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Checking backend setup…</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Prerequisites
      </h2>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <StatusDot ok={status.healthOk} />
          <span>Backend reachable</span>
        </li>
        <li className="flex items-center gap-2">
          <StatusDot ok={status.envOk} />
          <span>Environment variables</span>
        </li>
        {!status.envOk && (
          <li className="ml-5 text-zinc-600 dark:text-zinc-400">
            Missing:{" "}
            {CRITICAL_ENV.filter((k) => !status.envVars[k]).join(", ") || "unknown"}
          </li>
        )}
        <li className="flex items-center gap-2">
          <StatusDot ok={status.datasetOk} />
          <span>Dataset on disk</span>
          {status.datasetOk && status.datasetInfo ? (
            <span className="text-zinc-500">— {status.datasetInfo}</span>
          ) : null}
        </li>
        {!status.datasetOk && status.datasetError ? (
          <li className="ml-5 text-red-600 dark:text-red-400">{status.datasetError}</li>
        ) : null}
      </ul>
      {!status.ready ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          Start is disabled until all checks pass. Ensure the API is running and{" "}
          <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">data/</code> files exist.
        </p>
      ) : null}
    </section>
  );
}
