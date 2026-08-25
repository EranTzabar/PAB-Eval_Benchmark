"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { JudgeForm } from "@/components/JudgeForm";
import { safeReturnPath } from "@/lib/navigation";

function EditJudgeContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const judgeId = params.judgeId as string;
  const returnTo = safeReturnPath(searchParams.get("return"), "/judges");

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Edit judge</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Update a judge definition in R2. Judge ID cannot be changed.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <JudgeForm judgeId={judgeId} returnTo={returnTo} />
      </section>
    </main>
  );
}

export default function EditJudgePage() {
  return (
    <Suspense fallback={<p className="p-10 text-sm text-zinc-500">Loading…</p>}>
      <EditJudgeContent />
    </Suspense>
  );
}
