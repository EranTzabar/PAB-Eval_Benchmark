"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { createJudge, getEnvStatus, getJudge, updateJudge } from "@/lib/api";
import { returnPathLabel } from "@/lib/navigation";
import type { JudgeConfig, JudgeConfigCreate, JudgeConfigUpdate } from "@/types/api";

const JUDGE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;

interface JudgeFormProps {
  judgeId?: string;
  returnTo?: string;
}

function buildBody(
  name: string,
  baseUrl: string,
  model: string,
  apiKeyEnv: string,
  temperature: number,
  maxTokens: string,
  notes: string,
): JudgeConfigUpdate {
  const trimmedMax = maxTokens.trim();
  return {
    name: name.trim(),
    base_url: baseUrl.trim(),
    model: model.trim(),
    api_key_env: apiKeyEnv.trim(),
    temperature,
    max_tokens: trimmedMax ? Number(trimmedMax) : null,
    notes: notes.trim(),
  };
}

function validateForm(
  isEdit: boolean,
  judgeId: string,
  name: string,
  baseUrl: string,
  model: string,
  apiKeyEnv: string,
  maxTokens: string,
): string | null {
  if (!isEdit && !JUDGE_ID_PATTERN.test(judgeId.trim())) {
    return "Judge ID must be 1–64 chars: letters, digits, . _ -";
  }
  if (!name.trim()) return "Name is required";
  if (!baseUrl.trim()) return "Base URL is required";
  if (!model.trim()) return "Model is required";
  if (!ENV_VAR_PATTERN.test(apiKeyEnv.trim())) {
    return "API key env must match [A-Z][A-Z0-9_]* (e.g. OPENAI_JUDGE_KEY)";
  }
  if (maxTokens.trim() && Number.isNaN(Number(maxTokens))) {
    return "Max tokens must be a number";
  }
  return null;
}

export function JudgeForm({ judgeId, returnTo = "/judges" }: JudgeFormProps) {
  const isEdit = Boolean(judgeId);
  const [idDraft, setIdDraft] = useState(judgeId ?? "");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("");
  const [apiKeyEnv, setApiKeyEnv] = useState("OPENAI_JUDGE_KEY");
  const [temperature, setTemperature] = useState(0);
  const [maxTokens, setMaxTokens] = useState("");
  const [notes, setNotes] = useState("");
  const [envVars, setEnvVars] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<JudgeConfig | null>(null);

  const refreshEnv = useCallback(() => {
    getEnvStatus()
      .then(setEnvVars)
      .catch(() => setEnvVars({}));
  }, []);

  useEffect(() => {
    refreshEnv();
  }, [refreshEnv]);

  useEffect(() => {
    if (!judgeId) return;
    setLoading(true);
    getJudge(judgeId)
      .then((cfg) => {
        setName(cfg.name);
        setBaseUrl(cfg.base_url);
        setModel(cfg.model);
        setApiKeyEnv(cfg.api_key_env);
        setTemperature(cfg.temperature ?? 0);
        setMaxTokens(cfg.max_tokens != null ? String(cfg.max_tokens) : "");
        setNotes(cfg.notes ?? "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load judge");
      })
      .finally(() => setLoading(false));
  }, [judgeId]);

  const apiKeyMissing = apiKeyEnv.trim() && envVars[apiKeyEnv.trim()] === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm(isEdit, idDraft, name, baseUrl, model, apiKeyEnv, maxTokens);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = buildBody(name, baseUrl, model, apiKeyEnv, temperature, maxTokens, notes);
      const config = isEdit
        ? await updateJudge(judgeId!, body)
        : await createJudge({ judge_id: idDraft.trim(), ...body } as JudgeConfigCreate);
      setSaved(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? "update" : "create"} judge`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading judge…</p>;
  }

  if (saved) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Judge {isEdit ? "updated" : "created"}:{" "}
          <span className="font-mono">{saved.judge_id}</span>
        </p>
        {!saved.api_key_set ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Set <span className="font-mono">{saved.api_key_env}</span> in pab-eval/.env and restart
            the server before running this judge.
          </p>
        ) : null}
        <div className="flex gap-3">
          <Link
            href="/judges/activate"
            className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Run judge
          </Link>
          <Link
            href={returnTo}
            className="inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            {returnPathLabel(returnTo)}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      {isEdit ? (
        <p className="text-sm text-zinc-500">
          Judge ID: <span className="font-mono">{judgeId}</span>
        </p>
      ) : (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Judge ID</span>
          <input
            type="text"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
            placeholder="gpt4o_judge"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            disabled={submitting}
          />
        </label>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">Name</span>
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Base URL</span>
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Model</span>
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">API key env var</span>
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={apiKeyEnv}
          onChange={(e) => setApiKeyEnv(e.target.value)}
          disabled={submitting}
        />
        {apiKeyMissing ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-mono">{apiKeyEnv.trim()}</span> is not set in pab-eval/.env.
            Add it and restart the server before running this judge.
          </p>
        ) : null}
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Temperature</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            disabled={submitting}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Max tokens (optional)</span>
          <input
            type="text"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            disabled={submitting}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Notes (optional)</span>
        <textarea
          rows={2}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          disabled={submitting}
        >
          {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create judge"}
        </button>
        <Link
          href={returnTo}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
