import Link from "next/link";

import { JudgeRunsList } from "@/components/JudgeRunsList";
import { JudgesList } from "@/components/JudgesList";

export default function JudgesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Judges manage</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Judge definitions stored in R2. API keys are set in pab-eval/.env via each judge&apos;s{" "}
          <span className="font-mono">api_key_env</span> name.
        </p>
        <Link
          href="/judges/new"
          className="mt-2 inline-block text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
        >
          Add judge
        </Link>
      </header>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="text-lg font-semibold">Judge runs</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Status of scoring jobs already started. Active runs refresh every 5 seconds.
        </p>
        <JudgeRunsList />
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h2 className="text-lg font-semibold">Judge definitions</h2>
        <JudgesList />
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/judges/activate" className="text-zinc-600 underline dark:text-zinc-400">
          Run judge
        </Link>
        <Link href="/" className="text-zinc-600 underline dark:text-zinc-400">
          Back to generate
        </Link>
        <Link href="/runs" className="text-zinc-600 underline dark:text-zinc-400">
          All runs
        </Link>
        <Link href="/dataset" className="text-zinc-600 underline dark:text-zinc-400">
          Dataset
        </Link>
      </div>
    </main>
  );
}
