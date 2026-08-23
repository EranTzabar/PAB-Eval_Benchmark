import Link from "next/link";

import { JudgeForm } from "@/components/JudgeForm";

export default function NewJudgePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Add judge</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Create a judge definition in R2. The API key itself goes in{" "}
          <span className="font-mono">pab-eval/.env</span>, not here.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <JudgeForm returnTo="/judges" />
      </section>

      <Link href="/judges" className="text-sm text-zinc-600 underline dark:text-zinc-400">
        Back to judges manage
      </Link>
    </main>
  );
}
