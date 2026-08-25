import Link from "next/link";

import { PersonasList } from "@/components/PersonasList";

export default function PersonasPage() {
  return (
    <main className="min-h-screen w-full space-y-8 px-4 py-10">
      <Link href="/" className="inline-block text-sm text-zinc-600 underline dark:text-zinc-400">
        Back to generate
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Personas</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Persona packs stored in R2. Each pack includes persona facts and persona nature.
          Configurations reference a persona by ID.
        </p>
        <Link
          href="/personas/new"
          className="mt-2 inline-block text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
        >
          Add persona
        </Link>
      </header>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="text-lg font-semibold">Persona packs</h2>
        <PersonasList />
      </section>
    </main>
  );
}
