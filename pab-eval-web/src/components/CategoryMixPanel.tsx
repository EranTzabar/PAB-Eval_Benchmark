"use client";

import { useCallback, useMemo, useState } from "react";

import {
  assignRunsByPercent,
  mixTotalPercent,
  parseMixSlots,
} from "@/lib/categoryMix";

interface RunOption {
  runId: string;
  label: string;
}

interface MixSlotRow {
  runId: string;
  percent: string;
}

interface CategoryMixPanelProps {
  categories: string[];
  itemIdsByCategory: Record<string, string[]>;
  runOptions: RunOption[];
  onApply: (assignments: Record<string, string>) => void;
}

function emptySlot(): MixSlotRow {
  return { runId: "", percent: "" };
}

function defaultMixState(categories: string[]): Record<string, MixSlotRow[]> {
  return Object.fromEntries(categories.map((c) => [c, [emptySlot()]]));
}

export function CategoryMixPanel({
  categories,
  itemIdsByCategory,
  runOptions,
  onApply,
}: CategoryMixPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [mixByCategory, setMixByCategory] = useState<Record<string, MixSlotRow[]>>(() =>
    defaultMixState(categories),
  );
  const [errorsByCategory, setErrorsByCategory] = useState<Record<string, string>>({});

  const categoryStats = useMemo(
    () =>
      categories.map((category) => ({
        category,
        count: itemIdsByCategory[category]?.length ?? 0,
        total: mixTotalPercent(mixByCategory[category] ?? []),
        slots: mixByCategory[category] ?? [],
        ready:
          (itemIdsByCategory[category]?.length ?? 0) > 0 &&
          (mixByCategory[category] ?? []).some((s) => s.runId) &&
          Math.abs(mixTotalPercent(mixByCategory[category] ?? []) - 100) < 0.001,
      })),
    [categories, itemIdsByCategory, mixByCategory],
  );

  const clearCategoryError = useCallback((category: string) => {
    setErrorsByCategory((prev) => {
      if (!(category in prev)) return prev;
      const next = { ...prev };
      delete next[category];
      return next;
    });
  }, []);

  const updateSlot = useCallback(
    (category: string, index: number, patch: Partial<MixSlotRow>) => {
      setMixByCategory((prev) => {
        const rows = [...(prev[category] ?? [emptySlot()])];
        rows[index] = { ...rows[index]!, ...patch };
        return { ...prev, [category]: rows };
      });
      clearCategoryError(category);
    },
    [clearCategoryError],
  );

  const addSlot = useCallback(
    (category: string) => {
      setMixByCategory((prev) => ({
        ...prev,
        [category]: [...(prev[category] ?? [emptySlot()]), emptySlot()],
      }));
      clearCategoryError(category);
    },
    [clearCategoryError],
  );

  const removeSlot = useCallback(
    (category: string, index: number) => {
      setMixByCategory((prev) => {
        const rows = [...(prev[category] ?? [emptySlot()])];
        if (rows.length <= 1) return prev;
        rows.splice(index, 1);
        return { ...prev, [category]: rows };
      });
      clearCategoryError(category);
    },
    [clearCategoryError],
  );

  const handleApplyCategory = useCallback(
    (category: string) => {
      const itemIds = itemIdsByCategory[category] ?? [];
      const slots = mixByCategory[category] ?? [];

      if (itemIds.length === 0) {
        setErrorsByCategory((prev) => ({
          ...prev,
          [category]: "No rows in this category.",
        }));
        return;
      }

      if (!slots.some((s) => s.runId)) {
        setErrorsByCategory((prev) => ({
          ...prev,
          [category]: "Select at least one run.",
        }));
        return;
      }

      const total = mixTotalPercent(slots);
      if (Math.abs(total - 100) >= 0.001) {
        setErrorsByCategory((prev) => ({
          ...prev,
          [category]: `Percent total must equal 100% (currently ${total.toFixed(0)}%).`,
        }));
        return;
      }

      const ok = window.confirm(
        `Apply mix to ${category} (${itemIds.length} row(s))? This will overwrite current run selections for those rows.`,
      );
      if (!ok) return;

      const parsed = parseMixSlots(slots);
      const assignments = assignRunsByPercent(itemIds, parsed);
      if (Object.keys(assignments).length === 0) {
        setErrorsByCategory((prev) => ({
          ...prev,
          [category]: "Nothing to apply.",
        }));
        return;
      }

      clearCategoryError(category);
      onApply(assignments);
    },
    [clearCategoryError, itemIdsByCategory, mixByCategory, onApply],
  );

  if (runOptions.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Category run mix</h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Set percent shares per run for each category, then apply one category at a time.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {expanded ? (
        <div className="space-y-4">
          {categoryStats.map(({ category, count, total, slots, ready }) => (
            <div
              key={category}
              className="space-y-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-medium">{category}</span>
                <span className="text-xs text-zinc-500">{count} rows</span>
              </div>

              {slots.map((slot, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <select
                    className="min-w-[12rem] flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    value={slot.runId}
                    onChange={(e) =>
                      updateSlot(category, index, { runId: e.target.value })
                    }
                  >
                    <option value="">Select run…</option>
                    {runOptions.map((opt) => (
                      <option key={opt.runId} value={opt.runId}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="w-16 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950"
                      value={slot.percent}
                      onChange={(e) =>
                        updateSlot(category, index, { percent: e.target.value })
                      }
                      placeholder="0"
                    />
                    %
                  </label>
                  <button
                    type="button"
                    className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:opacity-40 dark:hover:text-zinc-200"
                    disabled={slots.length <= 1}
                    onClick={() => removeSlot(category, index)}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400"
                  onClick={() => addSlot(category)}
                >
                  Add run
                </button>
                <span
                  className={`text-xs ${
                    Math.abs(total - 100) < 0.001
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  Total: {total.toFixed(0)}%
                </span>
              </div>

              {errorsByCategory[category] ? (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errorsByCategory[category]}
                </p>
              ) : null}

              <button
                type="button"
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                disabled={!ready}
                onClick={() => handleApplyCategory(category)}
              >
                Apply to {category}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
