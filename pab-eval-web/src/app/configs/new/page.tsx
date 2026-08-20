import Link from "next/link";

import { ConfigForm } from "@/components/ConfigForm";

export default function NewConfigPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Add config</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Create a run config stored in R2. API key stays in server{" "}
          <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">.env</code> (
          TARGET_API_KEY).
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <ConfigForm />
      </section>

      <div className="flex gap-4 text-sm">
        <Link href="/" className="text-zinc-600 underline dark:text-zinc-400">
          Back to generate
        </Link>
        <Link href="/configs" className="text-zinc-600 underline dark:text-zinc-400">
          Configurations manage
        </Link>
      </div>
    </main>
  );
}
