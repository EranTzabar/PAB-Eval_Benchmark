import Link from "next/link";

import { PersonaForm } from "@/components/PersonaForm";

export default async function EditPersonaPage({
  params,
}: PageProps<"/personas/[personaId]/edit">) {
  const { personaId } = await params;

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Edit persona</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Persona ID: <span className="font-mono">{personaId}</span>
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <PersonaForm personaId={personaId} returnTo="/personas" />
      </section>

      <Link href="/personas" className="text-sm text-zinc-600 underline dark:text-zinc-400">
        Back to personas
      </Link>
    </main>
  );
}
