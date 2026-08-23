import Link from "next/link";
import { Suspense } from "react";

import { ActivateJudgeForm } from "@/components/ActivateJudgeForm";

export default function ActivateJudgePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Run judge</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Score stored generate responses with one or more persona-blind judges.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
          <ActivateJudgeForm />
        </Suspense>
      </section>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/judges" className="text-zinc-600 underline dark:text-zinc-400">
          Judges manage
        </Link>
        <Link href="/" className="text-zinc-600 underline dark:text-zinc-400">
          Back to generate
        </Link>
      </div>
    </main>
  );
}
