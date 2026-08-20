"use client";

import { useState } from "react";

import { startRun } from "@/lib/api";
import type { Job, OnFailure, StartRunRequest } from "@/types/api";

import { ConfigSelect } from "./ConfigSelect";
import { RunIdField } from "./RunIdField";

const RUN_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

interface StartRunFormProps {
  setupReady: boolean;
  onStarted: (startParams: StartRunRequest, job: Job) => void;
  disabled?: boolean;
  initialConfigId?: string;
}

export function StartRunForm({
  setupReady,
  onStarted,
  disabled,
  initialConfigId,
}: StartRunFormProps) {
  const [configId, setConfigId] = useState(initialConfigId ?? "");
  const [runId, setRunId] = useState("");
  const [onFailure, setOnFailure] = useState<OnFailure>("ask");
  const [smokeTest, setSmokeTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    setupReady &&
    !disabled &&
    !submitting &&
    configId &&
    RUN_ID_PATTERN.test(runId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const startParams: StartRunRequest = {
        config_id: configId,
        run_id: runId,
        on_failure: onFailure,
        filters: smokeTest ? { ids: ["DIR_001", "DIR_002"] } : undefined,
      };
      const job = await startRun(startParams);
      onStarted(startParams, job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <ConfigSelect value={configId} onChange={setConfigId} disabled={disabled || submitting} />

      <RunIdField
        value={runId}
        onChange={setRunId}
        onSelectRun={(run) => {
          if (run.manifest?.config_id) {
            setConfigId(run.manifest.config_id);
          }
        }}
        disabled={disabled || submitting}
      />

      <label className="block space-y-1">
        <span className="text-sm font-medium">On failure</span>
        <select
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={onFailure}
          onChange={(e) => setOnFailure(e.target.value as OnFailure)}
          disabled={disabled || submitting}
        >
          <option value="ask">Ask (park and wait for decision)</option>
          <option value="abort">Abort run</option>
          <option value="continue">Continue automatically</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={smokeTest}
          onChange={(e) => setSmokeTest(e.target.checked)}
          disabled={disabled || submitting}
        />
        Smoke test — first 2 prompts only (DIR_001, DIR_002)
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        disabled={!canSubmit}
      >
        {submitting ? "Starting…" : "Start generate run"}
      </button>
    </form>
  );
}
