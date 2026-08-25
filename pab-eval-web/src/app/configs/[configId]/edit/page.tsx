"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ConfigForm } from "@/components/ConfigForm";
import { safeReturnPath } from "@/lib/navigation";

function EditConfigContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const configId = params.configId as string;
  const returnTo = safeReturnPath(searchParams.get("return"), "/configs");

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Edit config</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Update a run config in R2. Config ID cannot be changed.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <ConfigForm configId={configId} returnTo={returnTo} />
      </section>
    </main>
  );
}

export default function EditConfigPage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">Loading…</p>}>
      <EditConfigContent />
    </Suspense>
  );
}
