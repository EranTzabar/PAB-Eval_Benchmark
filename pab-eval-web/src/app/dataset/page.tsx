import Link from "next/link";

import { DatasetBrowser } from "@/components/DatasetBrowser";

export default function DatasetPage() {
  return (
    <main className="min-h-screen w-full space-y-8 px-4 py-10">
      <Link href="/" className="inline-block text-sm text-zinc-600 underline dark:text-zinc-400">
        Back to generate
      </Link>

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
    </main>
  );
}
