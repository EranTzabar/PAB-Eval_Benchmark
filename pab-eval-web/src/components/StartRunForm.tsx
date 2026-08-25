"use client";

import { useState } from "react";

import { attachToActiveRun, findActiveGenerateRun, startRun } from "@/lib/api";
import { isJobAlreadyRunningMessage, isManifestConflictMessage } from "@/lib/runs";
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
  const [force, setForce] = useState(false);
  const [smokeTest, setSmokeTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manifestConflict, setManifestConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    setupReady &&
    !disabled &&
    !submitting &&
    configId &&
    RUN_ID_PATTERN.test(runId);

  const buildStartParams = (useForce: boolean): StartRunRequest => ({
    config_id: configId,
    run_id: runId,
    on_failure: onFailure,
    force: useForce,
    filters: smokeTest ? { ids: ["DIR_001", "DIR_002"] } : undefined,
  });

  const startGenerateRun = async (useForce: boolean) => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setManifestConflict(false);
    const startParams = buildStartParams(useForce);
    try {
      const job = await startRun(startParams);
      onStarted(startParams, job);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start run";
      if (isJobAlreadyRunningMessage(message)) {
        try {
          const attached = await attachToActiveRun(runId, startParams);
          if (attached) {
            onStarted(attached.startParams, attached.job);
            return;
          }
        } catch {
          // fall through to error
        }
      }
      if (isManifestConflictMessage(message)) {
        setManifestConflict(true);
        setForce(true);
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await startGenerateRun(force);
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
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
          disabled={disabled || submitting}
        />
        Force — update run manifest if config/persona changed (reuse run ID)
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

      {error ? (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          {manifestConflict ? (
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Persona setup changed since this run was created (for example: no em dash, structured
              response, wrapper, or persona pack edits). Update the manifest to reuse this run ID.
            </p>
          ) : (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {manifestConflict ? (
            <button
              type="button"
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              onClick={() => void startGenerateRun(true)}
              disabled={!canSubmit}
            >
              {submitting ? "Starting…" : "Update manifest and start"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          disabled={!canSubmit}
        >
          {submitting ? "Starting…" : manifestConflict ? "Start again" : "Start generate run"}
        </button>
      </div>
    </form>
  );
}
