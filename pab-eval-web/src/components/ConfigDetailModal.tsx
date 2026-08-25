"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getConfig } from "@/lib/api";
import type { PersonaConfig, RunConfig } from "@/types/api";

function personaDetails(persona: PersonaConfig): string {
  if (persona.mode === "endpoint") {
    return "Endpoint — target owns persona";
  }
  const lines: string[] = ["Harness"];
  if (persona.persona_id) {
    lines.push(`Persona ID: ${persona.persona_id}`);
    if (persona.wrapper) lines.push(`Wrapper: ${persona.wrapper}`);
    if (persona.structured_response) {
      lines.push("Structured response: awareness / feelings / me tags");
    }
    if (persona.no_em_dash) {
      lines.push("No em dash: forbid — in replies");
    }
  } else if (persona.system_prompt) {
    lines.push(`System prompt: ${persona.system_prompt}`);
  }
  if (persona.name) lines.push(`Name: ${persona.name}`);
  if (persona.archetype) lines.push(`Archetype: ${persona.archetype}`);
  return lines.join("\n");
}

interface ConfigDetailModalProps {
  configId: string | null;
  onClose: () => void;
  editReturnTo?: string;
}

export function ConfigDetailModal({
  configId,
  onClose,
  editReturnTo = "/",
}: ConfigDetailModalProps) {
  const [config, setConfig] = useState<RunConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configId) {
      setConfig(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getConfig(configId)
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load config");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [configId]);

  useEffect(() => {
    if (!configId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [configId, onClose]);

  if (!configId) return null;

  const editHref = `/configs/${encodeURIComponent(configId)}/edit?return=${encodeURIComponent(editReturnTo)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="config-modal-title" className="text-lg font-semibold">
            Config details
          </h2>
          <button
            type="button"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {loading ? <p className="text-sm text-zinc-500">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {config ? (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">Name</dt>
              <dd className="font-medium">{config.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Config ID</dt>
              <dd className="font-mono text-xs">{config.config_id}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Model</dt>
              <dd className="font-mono text-xs">{config.target.model}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Base URL</dt>
              <dd className="break-all font-mono text-xs">{config.target.base_url}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-zinc-500">Temperature</dt>
                <dd>{config.target.temperature ?? 0.7}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Timeout (s)</dt>
                <dd>{config.target.timeout_s ?? 120}</dd>
              </div>
            </div>
            <div>
              <dt className="text-zinc-500">Persona</dt>
              <dd className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                {personaDetails(config.persona)}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-zinc-500">Created</dt>
                <dd>{new Date(config.created_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Updated</dt>
                <dd>{new Date(config.updated_at).toLocaleString()}</dd>
              </div>
            </div>
          </dl>
        ) : null}

        <div className="mt-6 flex gap-3">
          {config ? (
            <Link
              href={editHref}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Edit
            </Link>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
