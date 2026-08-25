"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { listConfigs } from "@/lib/api";
import type { PersonaConfig, RunConfig } from "@/types/api";

function personaLabel(persona: PersonaConfig): string {
  if (persona.mode === "endpoint") {
    return "endpoint";
  }
  if (persona.persona_id) {
    return `harness · ${persona.persona_id}${persona.wrapper ? ` (${persona.wrapper})` : ""}${persona.structured_response ? " · structured" : ""}${persona.no_em_dash ? " · no em dash" : ""}`;
  }
  if (persona.system_prompt) {
    const preview = persona.system_prompt.replace(/\s+/g, " ").trim();
    return preview.length > 48 ? `harness · "${preview.slice(0, 48)}…"` : `harness · "${preview}"`;
  }
  return "harness";
}

export function ConfigsList() {
  const [configs, setConfigs] = useState<RunConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConfigs(await listConfigs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load configs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading configs…</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No configs in R2.{" "}
        <Link href="/configs/new" className="underline">
          Add one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Config ID</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium">Base URL</th>
              <th className="px-4 py-2 font-medium">Persona</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {configs.map((cfg) => (
              <tr key={cfg.config_id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3">
                  <Link
                    href={`/?config=${encodeURIComponent(cfg.config_id)}`}
                    className="font-medium underline hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    {cfg.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {cfg.config_id}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{cfg.target.model}</td>
                <td className="max-w-[14rem] truncate px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {cfg.target.base_url}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {personaLabel(cfg.persona)}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {new Date(cfg.updated_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/configs/${encodeURIComponent(cfg.config_id)}/edit?return=${encodeURIComponent("/configs")}`}
                    className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
