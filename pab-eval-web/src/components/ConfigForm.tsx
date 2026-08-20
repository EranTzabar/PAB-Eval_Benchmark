"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createConfig, getConfig, updateConfig } from "@/lib/api";
import { returnPathLabel } from "@/lib/navigation";
import type { PersonaConfig, RunConfig, RunConfigCreate } from "@/types/api";

type HarnessSource = "system_prompt" | "persona_id";

interface ConfigFormProps {
  configId?: string;
  returnTo?: string;
}

function buildPersona(
  mode: PersonaConfig["mode"],
  harnessSource: HarnessSource,
  systemPrompt: string,
  personaId: string,
  wrapper: PersonaConfig["wrapper"],
  personaName: string,
  personaArchetype: string,
): PersonaConfig {
  if (mode === "endpoint") {
    return { mode: "endpoint" };
  }

  const persona: PersonaConfig = { mode: "harness" };
  if (personaName.trim()) persona.name = personaName.trim();
  if (personaArchetype.trim()) persona.archetype = personaArchetype.trim();

  if (harnessSource === "system_prompt") {
    persona.system_prompt = systemPrompt.trim();
  } else {
    persona.persona_id = personaId.trim();
    persona.wrapper = wrapper ?? "minimal";
  }

  return persona;
}

function validateForm(
  name: string,
  baseUrl: string,
  model: string,
  personaMode: PersonaConfig["mode"],
  harnessSource: HarnessSource,
  systemPrompt: string,
  personaId: string,
): string | null {
  if (!name.trim()) return "Name is required";
  if (!baseUrl.trim()) return "Base URL is required";
  if (!model.trim()) return "Model is required";
  if (personaMode === "harness") {
    if (harnessSource === "system_prompt" && !systemPrompt.trim()) {
      return "System prompt is required for harness mode";
    }
    if (harnessSource === "persona_id" && !personaId.trim()) {
      return "Persona ID is required for harness mode";
    }
  }
  return null;
}

function applyConfigToForm(config: RunConfig, setters: {
  setName: (v: string) => void;
  setBaseUrl: (v: string) => void;
  setModel: (v: string) => void;
  setTemperature: (v: number) => void;
  setTimeoutS: (v: number) => void;
  setPersonaMode: (v: PersonaConfig["mode"]) => void;
  setHarnessSource: (v: HarnessSource) => void;
  setSystemPrompt: (v: string) => void;
  setPersonaId: (v: string) => void;
  setWrapper: (v: PersonaConfig["wrapper"]) => void;
  setPersonaName: (v: string) => void;
  setPersonaArchetype: (v: string) => void;
}) {
  setters.setName(config.name);
  setters.setBaseUrl(config.target.base_url);
  setters.setModel(config.target.model);
  setters.setTemperature(config.target.temperature ?? 0.7);
  setters.setTimeoutS(config.target.timeout_s ?? 120);
  setters.setPersonaMode(config.persona.mode);
  if (config.persona.mode === "harness") {
    if (config.persona.persona_id) {
      setters.setHarnessSource("persona_id");
      setters.setPersonaId(config.persona.persona_id);
      setters.setWrapper(config.persona.wrapper ?? "minimal");
      setters.setSystemPrompt("");
    } else {
      setters.setHarnessSource("system_prompt");
      setters.setSystemPrompt(config.persona.system_prompt ?? "");
      setters.setPersonaId("");
    }
    setters.setPersonaName(config.persona.name ?? "");
    setters.setPersonaArchetype(config.persona.archetype ?? "");
  }
}

export function ConfigForm({ configId, returnTo = "/configs" }: ConfigFormProps) {
  const isEdit = Boolean(configId);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [timeoutS, setTimeoutS] = useState(120);
  const [personaMode, setPersonaMode] = useState<PersonaConfig["mode"]>("harness");
  const [harnessSource, setHarnessSource] = useState<HarnessSource>("system_prompt");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [wrapper, setWrapper] = useState<PersonaConfig["wrapper"]>("minimal");
  const [personaName, setPersonaName] = useState("");
  const [personaArchetype, setPersonaArchetype] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<RunConfig | null>(null);

  useEffect(() => {
    if (!configId) return;
    setLoading(true);
    setError(null);
    getConfig(configId)
      .then((config) => {
        applyConfigToForm(config, {
          setName,
          setBaseUrl,
          setModel,
          setTemperature,
          setTimeoutS,
          setPersonaMode,
          setHarnessSource,
          setSystemPrompt,
          setPersonaId,
          setWrapper,
          setPersonaName,
          setPersonaArchetype,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load config");
      })
      .finally(() => setLoading(false));
  }, [configId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm(
      name,
      baseUrl,
      model,
      personaMode,
      harnessSource,
      systemPrompt,
      personaId,
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    const body: RunConfigCreate = {
      name: name.trim(),
      target: {
        base_url: baseUrl.trim(),
        model: model.trim(),
        temperature,
        timeout_s: timeoutS,
      },
      persona: buildPersona(
        personaMode,
        harnessSource,
        systemPrompt,
        personaId,
        wrapper,
        personaName,
        personaArchetype,
      ),
    };

    setSubmitting(true);
    setError(null);
    try {
      const config = isEdit
        ? await updateConfig(configId!, body)
        : await createConfig(body);
      setSaved(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? "update" : "create"} config`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading config…</p>;
  }

  if (saved) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Config {isEdit ? "updated" : "created"}:{" "}
          <span className="font-mono">{saved.config_id}</span>
        </p>
        <div className="flex gap-3">
          <Link
            href={`/?config=${encodeURIComponent(saved.config_id)}`}
            className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Use in generate
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
          Config ID: <span className="font-mono">{configId}</span>
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">General</legend>
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
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Target</legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Base URL</span>
          <input
            type="text"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
            placeholder="https://api.openai.com/v1"
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
            <span className="text-sm font-medium">Timeout (s)</span>
            <input
              type="number"
              min="1"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              value={timeoutS}
              onChange={(e) => setTimeoutS(Number(e.target.value))}
              disabled={submitting}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Persona</legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Mode</span>
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={personaMode}
            onChange={(e) => setPersonaMode(e.target.value as PersonaConfig["mode"])}
            disabled={submitting}
          >
            <option value="harness">Harness (send system prompt)</option>
            <option value="endpoint">Endpoint (target owns persona)</option>
          </select>
        </label>

        {personaMode === "harness" ? (
          <>
            <div className="space-y-2">
              <span className="text-sm font-medium">Source</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={harnessSource === "system_prompt"}
                  onChange={() => setHarnessSource("system_prompt")}
                  disabled={submitting}
                />
                Inline system prompt
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={harnessSource === "persona_id"}
                  onChange={() => setHarnessSource("persona_id")}
                  disabled={submitting}
                />
                Persona ID (R2 pack)
              </label>
            </div>

            {harnessSource === "system_prompt" ? (
              <label className="block space-y-1">
                <span className="text-sm font-medium">System prompt</span>
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  disabled={submitting}
                />
              </label>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Persona ID</span>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    value={personaId}
                    onChange={(e) => setPersonaId(e.target.value)}
                    disabled={submitting}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Wrapper</span>
                  <select
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                    value={wrapper}
                    onChange={(e) => setWrapper(e.target.value as PersonaConfig["wrapper"])}
                    disabled={submitting}
                  >
                    <option value="minimal">minimal</option>
                    <option value="strict">strict</option>
                    <option value="none">none</option>
                  </select>
                </label>
              </>
            )}

            <label className="block space-y-1">
              <span className="text-sm font-medium">Persona name (optional)</span>
              <input
                type="text"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                disabled={submitting}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Archetype (optional)</span>
              <input
                type="text"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                value={personaArchetype}
                onChange={(e) => setPersonaArchetype(e.target.value)}
                disabled={submitting}
              />
            </label>
          </>
        ) : null}
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          disabled={submitting}
        >
          {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create config"}
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
