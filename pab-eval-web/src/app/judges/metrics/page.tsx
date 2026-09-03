import Link from "next/link";

import { JudgeMetricsPanel } from "@/components/JudgeMetricsPanel";

export default function JudgeMetricsPage() {
  return (
    <main className="min-h-screen w-full space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Judge metrics</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Compare judges within a generate run and across runs by category. Upload exported JSON or
          ZIP files from the Judges page.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <JudgeMetricsPanel />
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/judges" className="text-zinc-600 underline dark:text-zinc-400">
          Judges manage
        </Link>
        <Link href="/judges/activate" className="text-zinc-600 underline dark:text-zinc-400">
          Run judge
        </Link>
        <Link href="/" className="text-zinc-600 underline dark:text-zinc-400">
          Back to generate
        </Link>
      </div>
    </main>
  );
}
