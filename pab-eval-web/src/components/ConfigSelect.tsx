"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listConfigSummaries } from "@/lib/api";
import type { ConfigSummary } from "@/types/api";

interface ConfigSelectProps {
  value: string;
  onChange: (configId: string) => void;
  disabled?: boolean;
}

export function ConfigSelect({ value, onChange, disabled }: ConfigSelectProps) {
  const [configs, setConfigs] = useState<ConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listConfigSummaries()
      .then((items) => {
        if (!cancelled) {
          setConfigs(items);
          setError(null);
          if (items.length > 0 && !value) {
            onChange(items[0].config_id);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load configs");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onChange]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading configs…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (configs.length === 0) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        No configs in R2.{" "}
        <Link href="/configs/new" className="underline hover:text-amber-900 dark:hover:text-amber-200">
          Add a config
        </Link>
        .
      </p>
    );
  }

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">Config</span>
      <select
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {configs.map((c) => (
          <option key={c.config_id} value={c.config_id}>
            {c.name} — {c.model} ({c.persona_mode})
          </option>
        ))}
      </select>
    </label>
  );
}
