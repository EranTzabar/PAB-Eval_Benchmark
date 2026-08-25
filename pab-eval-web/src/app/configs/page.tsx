import Link from "next/link";

import { ConfigsList } from "@/components/ConfigsList";

export default function ConfigsPage() {
  return (
    <main className="min-h-screen w-full space-y-8 px-4 py-10">
      <Link href="/" className="inline-block text-sm text-zinc-600 underline dark:text-zinc-400">
        Back to generate
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Configurations manage</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Run configs stored in R2. Click a name to use it on the generate page.
        </p>
        <Link
          href="/configs/new"
          className="mt-2 inline-block text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Add config
        </Link>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <ConfigsList />
      </section>
    </main>
  );
}
