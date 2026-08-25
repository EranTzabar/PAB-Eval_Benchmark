import Link from "next/link";

import { RunsList } from "@/components/RunsList";

export default function RunsPage() {
  return (
    <main className="min-h-screen w-full space-y-8 px-4 py-10">
      <Link href="/" className="inline-block text-sm text-zinc-600 underline dark:text-zinc-400">
        Back to generate
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Runs</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          All generate runs stored in R2, with live state when the API still holds the job.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <RunsList />
      </section>
    </main>
  );
}
