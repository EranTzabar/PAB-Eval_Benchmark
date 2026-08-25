"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createPersona, getPersona, updatePersona } from "@/lib/api";
import { returnPathLabel } from "@/lib/navigation";
import type { PersonaManifest } from "@/types/api";

const PERSONA_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

interface PersonaFormProps {
  personaId?: string;
  returnTo?: string;
}

async function loadMdFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function validateForm(
  isEdit: boolean,
  idDraft: string,
  facts: string,
  nature: string,
): string | null {
  if (!isEdit && !PERSONA_ID_PATTERN.test(idDraft.trim())) {
    return "Persona ID must be 1–64 characters: letters, digits, . _ -";
  }
  if (!facts.trim()) return "Persona facts are required";
  if (!nature.trim()) return "Persona nature is required";
  return null;
}

export function PersonaForm({ personaId, returnTo = "/personas" }: PersonaFormProps) {
  const isEdit = Boolean(personaId);
  const [idDraft, setIdDraft] = useState(personaId ?? "");
  const [name, setName] = useState("");
  const [archetype, setArchetype] = useState("");
  const [facts, setFacts] = useState("");
  const [nature, setNature] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<PersonaManifest | null>(null);

  useEffect(() => {
    if (!personaId) return;
    setLoading(true);
    setError(null);
    getPersona(personaId)
      .then((detail) => {
        setIdDraft(detail.manifest.persona_id);
        setName(detail.manifest.name ?? "");
        setArchetype(detail.manifest.archetype ?? "");
        setFacts(detail.facts);
        setNature(detail.nature);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load persona");
      })
      .finally(() => setLoading(false));
  }, [personaId]);

  const handleMdLoad = async (file: File | undefined, setter: (value: string) => void) => {
    if (!file) return;
    try {
      setter(await loadMdFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm(isEdit, idDraft, facts, nature);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = {
        facts: facts.trim(),
        nature: nature.trim(),
        name: name.trim() || undefined,
        archetype: archetype.trim() || undefined,
      };
      const manifest = isEdit
        ? await updatePersona(personaId!, body)
        : await createPersona({
            ...body,
            persona_id: idDraft.trim(),
          });
      setSaved(manifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEdit ? "update" : "create"} persona`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading persona…</p>;
  }

  if (saved) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Persona {isEdit ? "updated" : "created"}:{" "}
          <span className="font-mono">{saved.persona_id}</span>
        </p>
        <div className="flex gap-3">
          <Link
            href={`/personas/${encodeURIComponent(saved.persona_id)}/edit`}
            className="inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            Edit again
          </Link>
          <Link
            href={returnTo}
            className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {returnPathLabel(returnTo)}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Persona ID</span>
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
          value={idDraft}
          onChange={(e) => setIdDraft(e.target.value)}
          disabled={submitting || isEdit}
          placeholder="e.g. lema"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Name (optional)</span>
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Archetype (optional)</span>
        <input
          type="text"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={archetype}
          onChange={(e) => setArchetype(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Persona facts</span>
        <textarea
          rows={8}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={facts}
          onChange={(e) => setFacts(e.target.value)}
          disabled={submitting}
        />
        <input
          type="file"
          accept=".md,text/markdown,text/plain"
          className="text-sm"
          disabled={submitting}
          onChange={(e) => void handleMdLoad(e.target.files?.[0], setFacts)}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Persona nature</span>
        <textarea
          rows={8}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={nature}
          onChange={(e) => setNature(e.target.value)}
          disabled={submitting}
        />
        <input
          type="file"
          accept=".md,text/markdown,text/plain"
          className="text-sm"
          disabled={submitting}
          onChange={(e) => void handleMdLoad(e.target.files?.[0], setNature)}
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          disabled={submitting}
        >
          {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create persona"}
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
