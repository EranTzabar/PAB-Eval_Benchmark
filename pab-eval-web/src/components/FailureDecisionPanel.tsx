"use client";

import type { FailureDetail } from "@/types/api";

interface FailureDecisionPanelProps {
  detail: FailureDetail;
  onContinue: () => void;
  onContinueAll: () => void;
  onStop: () => void;
  busy?: boolean;
}

export function FailureDecisionPanel({
  detail,
  onContinue,
  onContinueAll,
  onStop,
  busy,
}: FailureDecisionPanelProps) {
  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
      <h3 className="font-semibold text-amber-900 dark:text-amber-200">
        Item failed — decision required
      </h3>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
        <strong>{detail.item_id}</strong> ({detail.kind}) — {detail.hint}
      </p>
      {detail.attempts.length > 0 ? (
        <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-amber-900/80 dark:text-amber-200/80">
          {detail.attempts.map((a) => (
            <li key={a.attempt}>
              Attempt {a.attempt}: {a.error}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
          onClick={onContinue}
          disabled={busy}
        >
          Continue
        </button>
        <button
          type="button"
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
          onClick={onContinueAll}
          disabled={busy}
        >
          Continue all
        </button>
        <button
          type="button"
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
          onClick={onStop}
          disabled={busy}
        >
          Stop run
        </button>
      </div>
    </section>
  );
}
