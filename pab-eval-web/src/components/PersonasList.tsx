"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { deletePersona, listPersonas } from "@/lib/api";
import type { PersonaManifest } from "@/types/api";

export function PersonasList() {
  const [personas, setPersonas] = useState<PersonaManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPersonas(await listPersonas());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load personas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (personaId: string) => {
    if (!window.confirm(`Delete persona "${personaId}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(personaId);
    setError(null);
    try {
      await deletePersona(personaId);
      setPersonas((prev) => prev.filter((p) => p.persona_id !== personaId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete persona");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading personas…</p>;
  }

  if (error && personas.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{error}</p>
        <button type="button" className="text-sm underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (personas.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No personas in R2.{" "}
        <Link href="/personas/new" className="underline">
          Add one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-end">
        <button type="button" className="text-sm underline" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Persona ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Archetype</th>
              <th className="px-4 py-2 font-medium">Memories</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {personas.map((persona) => (
              <tr key={persona.persona_id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3 font-mono text-xs">{persona.persona_id}</td>
                <td className="px-4 py-3">{persona.name ?? "—"}</td>
                <td className="px-4 py-3">{persona.archetype ?? "—"}</td>
                <td className="px-4 py-3">{persona.memory_files.length}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {new Date(persona.updated_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <Link
                      href={`/personas/${encodeURIComponent(persona.persona_id)}/edit`}
                      className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="text-xs text-red-600 underline disabled:opacity-40"
                      disabled={deletingId === persona.persona_id}
                      onClick={() => void handleDelete(persona.persona_id)}
                    >
                      {deletingId === persona.persona_id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
