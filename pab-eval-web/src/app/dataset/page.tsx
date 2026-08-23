import Link from "next/link";

import { DatasetBrowser } from "@/components/DatasetBrowser";

export default function DatasetPage() {
  return (
    <main className="w-full space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Dataset</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Read-only view of benchmark prompts and chain turns. Pick a generate run per row to compare
          model responses. Drag column edges to resize.
        </p>
      </header>

      <section className="w-full rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <DatasetBrowser />
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/" className="text-zinc-600 underline dark:text-zinc-400">
          Back to generate
        </Link>
        <Link href="/configs" className="text-zinc-600 underline dark:text-zinc-400">
          Configurations manage
        </Link>
        <Link href="/runs" className="text-zinc-600 underline dark:text-zinc-400">
          All runs
        </Link>
        <Link href="/judges" className="text-zinc-600 underline dark:text-zinc-400">
          Judges manage
        </Link>
      </div>
    </main>
  );
}
