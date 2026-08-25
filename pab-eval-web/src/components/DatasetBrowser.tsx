"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CategoryMixPanel } from "@/components/CategoryMixPanel";
import { ResizableTable, type ResizableColumn } from "@/components/ResizableTable";
import { ScoreColumnHeader } from "@/components/ScoreColumnHeader";
import { getDatasetItems, getDatasetView, getRunResponse, listRuns, putDatasetView } from "@/lib/api";
import { SCORE_DEFINITIONS } from "@/lib/scoreDefinitions";
import { buildDatasetExport, downloadDatasetExport } from "@/lib/datasetExport";
import type {
  DatasetChainRow,
  DatasetPromptRow,
  DatasetViewRow,
  RunListItem,
} from "@/types/api";

type DatasetTab = "prompts" | "chains";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type ScoreField = "aid" | "ltf" | "ebc";

interface ManualScore {
  aid: number | null;
  ltf: number | null;
  ebc: number | null;
}

const SAVE_DEBOUNCE_MS = 500;

const SCORE_COLUMNS: ResizableColumn[] = [
  {
    id: "aid",
    header: <ScoreColumnHeader definition={SCORE_DEFINITIONS.aid} />,
    width: 72,
    minWidth: 64,
    cellClassName: "overflow-visible tabular-nums",
  },
  {
    id: "ltf",
    header: <ScoreColumnHeader definition={SCORE_DEFINITIONS.ltf} />,
    width: 72,
    minWidth: 64,
    cellClassName: "overflow-visible tabular-nums",
  },
  {
    id: "ebc",
    header: <ScoreColumnHeader definition={SCORE_DEFINITIONS.ebc} />,
    width: 72,
    minWidth: 64,
    cellClassName: "overflow-visible tabular-nums",
  },
];

const RUN_COLUMN: ResizableColumn = {
  id: "run",
  header: "Run",
  width: 200,
  minWidth: 120,
  cellClassName: "overflow-visible",
};

const RESPONSE_AND_SCORE_COLUMNS: ResizableColumn[] = [
  {
    id: "response",
    header: "Response",
    width: 480,
    minWidth: 160,
    cellClassName: "whitespace-pre-wrap break-words",
  },
  ...SCORE_COLUMNS,
];

const PROMPT_COLUMNS: ResizableColumn[] = [
  { id: "id", header: "ID", width: 120, cellClassName: "font-mono text-xs whitespace-nowrap" },
  RUN_COLUMN,
  { id: "category", header: "Category", width: 180 },
  { id: "text", header: "Text", width: 480, minWidth: 160, cellClassName: "whitespace-pre-wrap break-words" },
  ...RESPONSE_AND_SCORE_COLUMNS,
];

const CHAIN_COLUMNS: ResizableColumn[] = [
  { id: "id", header: "ID", width: 120, cellClassName: "font-mono text-xs whitespace-nowrap" },
  RUN_COLUMN,
  { id: "chain_id", header: "Chain", width: 140, cellClassName: "font-mono text-xs whitespace-nowrap" },
  { id: "turn", header: "Turn", width: 72, cellClassName: "tabular-nums" },
  { id: "category", header: "Category", width: 160 },
  { id: "archetype", header: "Archetype", width: 180 },
  { id: "text", header: "Text", width: 480, minWidth: 160, cellClassName: "whitespace-pre-wrap break-words" },
  ...RESPONSE_AND_SCORE_COLUMNS,
];

interface RunOption {
  runId: string;
  model: string;
  label: string;
}

function cacheKey(runId: string, itemId: string): string {
  return `${runId}:${itemId}`;
}

function sortRuns(runs: RunListItem[]): RunListItem[] {
  return [...runs].sort((a, b) => {
    const aTime = a.manifest?.started_at ?? a.run_id;
    const bTime = b.manifest?.started_at ?? b.run_id;
    return bTime.localeCompare(aTime);
  });
}

function buildRunOptions(runs: RunListItem[]): RunOption[] {
  return sortRuns(runs)
    .filter((run) => run.manifest)
    .map((run) => {
      const model = run.manifest!.target_model;
      return {
        runId: run.run_id,
        model,
        label: `${run.run_id} · ${model}`,
      };
    });
}

function buildViewRows(
  selectedRunByItem: Record<string, string>,
  responseCache: Record<string, string | null>,
  manualScoresByItem: Record<string, ManualScore>,
): Record<string, DatasetViewRow> {
  const rows: Record<string, DatasetViewRow> = {};
  for (const [itemId, runId] of Object.entries(selectedRunByItem)) {
    const key = cacheKey(runId, itemId);
    const scores = manualScoresByItem[itemId];
    const row: DatasetViewRow = {
      run_id: runId,
      response: key in responseCache ? responseCache[key] : null,
    };
    if (scores?.aid != null) row.aid = scores.aid;
    if (scores?.ltf != null) row.ltf = scores.ltf;
    if (scores?.ebc != null) row.ebc = scores.ebc;
    rows[itemId] = row;
  }
  return rows;
}

function hydrateFromView(rows: Record<string, DatasetViewRow>): {
  selectedRunByItem: Record<string, string>;
  responseCache: Record<string, string | null>;
  manualScoresByItem: Record<string, ManualScore>;
  needsFetch: Array<{ runId: string; itemId: string }>;
} {
  const selectedRunByItem: Record<string, string> = {};
  const responseCache: Record<string, string | null> = {};
  const manualScoresByItem: Record<string, ManualScore> = {};
  const needsFetch: Array<{ runId: string; itemId: string }> = [];

  for (const [itemId, row] of Object.entries(rows)) {
    selectedRunByItem[itemId] = row.run_id;
    const key = cacheKey(row.run_id, itemId);
    if (row.response != null) {
      responseCache[key] = row.response;
    } else {
      needsFetch.push({ runId: row.run_id, itemId });
    }
    if (row.aid != null || row.ltf != null || row.ebc != null) {
      manualScoresByItem[itemId] = {
        aid: row.aid ?? null,
        ltf: row.ltf ?? null,
        ebc: row.ebc ?? null,
      };
    }
  }

  return { selectedRunByItem, responseCache, manualScoresByItem, needsFetch };
}

function runAssignmentChanged(previousRunId: string | undefined, newRunId: string): boolean {
  return (previousRunId ?? "") !== newRunId;
}

const SELECT_CLASS =
  "w-full max-w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950";

export function DatasetBrowser() {
  const [tab, setTab] = useState<DatasetTab>("prompts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<DatasetPromptRow[]>([]);
  const [chains, setChains] = useState<DatasetChainRow[]>([]);
  const [runOptions, setRunOptions] = useState<RunOption[]>([]);
  const [selectedRunByItem, setSelectedRunByItem] = useState<Record<string, string>>({});
  const [responseCache, setResponseCache] = useState<Record<string, string | null>>({});
  const [manualScoresByItem, setManualScoresByItem] = useState<Record<string, ManualScore>>({});
  const [loadingKeys, setLoadingKeys] = useState<Record<string, true>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [viewDatasetSha, setViewDatasetSha] = useState<string | null>(null);
  const [currentDatasetSha, setCurrentDatasetSha] = useState<string | null>(null);

  const responseCacheRef = useRef(responseCache);
  const selectedRunByItemRef = useRef(selectedRunByItem);
  const manualScoresByItemRef = useRef(manualScoresByItem);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
  const hydratedRef = useRef(false);

  useEffect(() => {
    responseCacheRef.current = responseCache;
  }, [responseCache]);

  useEffect(() => {
    selectedRunByItemRef.current = selectedRunByItem;
  }, [selectedRunByItem]);

  useEffect(() => {
    manualScoresByItemRef.current = manualScoresByItem;
  }, [manualScoresByItem]);

  const scheduleSave = useCallback(() => {
    if (!hydratedRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const seq = ++saveSeqRef.current;
      const rows = buildViewRows(
        selectedRunByItemRef.current,
        responseCacheRef.current,
        manualScoresByItemRef.current,
      );

      setSaveStatus("saving");
      setSaveError(null);

      void putDatasetView({ rows })
        .then((view) => {
          if (seq !== saveSeqRef.current) return;
          setViewDatasetSha(view.dataset_sha256);
          setCurrentDatasetSha(view.current_dataset_sha256 ?? view.dataset_sha256);
          setSaveStatus("saved");
        })
        .catch((err) => {
          if (seq !== saveSeqRef.current) return;
          setSaveStatus("error");
          setSaveError(err instanceof Error ? err.message : "Failed to save view");
        });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const fetchResponse = useCallback(
    async (runId: string, itemId: string, persist = true) => {
      const key = cacheKey(runId, itemId);
      setLoadingKeys((prev) => ({ ...prev, [key]: true }));
      try {
        const record = await getRunResponse(runId, itemId);
        setResponseCache((prev) => ({ ...prev, [key]: record?.response ?? null }));
        if (persist) scheduleSave();
      } catch {
        setResponseCache((prev) => ({ ...prev, [key]: null }));
        if (persist) scheduleSave();
      } finally {
        setLoadingKeys((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [scheduleSave],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    hydratedRef.current = false;

    Promise.all([getDatasetItems(), listRuns(), getDatasetView()])
      .then(([data, runs, view]) => {
        if (cancelled) return;
        if (!data.valid) {
          setError(data.error ?? "Dataset validation failed");
          setPrompts([]);
          setChains([]);
          setRunOptions([]);
          return;
        }
        setPrompts(data.prompts);
        setChains(data.chains);
        setRunOptions(buildRunOptions(runs));

        setViewDatasetSha(view.dataset_sha256);
        setCurrentDatasetSha(view.current_dataset_sha256 ?? view.dataset_sha256);

        const hydrated = hydrateFromView(view.rows);
        setSelectedRunByItem(hydrated.selectedRunByItem);
        setResponseCache(hydrated.responseCache);
        setManualScoresByItem(hydrated.manualScoresByItem);
        hydratedRef.current = true;

        for (const { runId, itemId } of hydrated.needsFetch) {
          void fetchResponse(runId, itemId, true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dataset");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchResponse]);

  const clearScoreIfRunChanged = useCallback((itemId: string, previousRunId: string | undefined, newRunId: string) => {
    if (!runAssignmentChanged(previousRunId, newRunId)) return;
    setManualScoresByItem((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, []);

  const handleRunChange = useCallback(
    (itemId: string, runId: string) => {
      const previousRunId = selectedRunByItemRef.current[itemId];
      clearScoreIfRunChanged(itemId, previousRunId, runId);

      setSelectedRunByItem((prev) => {
        const next = { ...prev };
        if (runId) {
          next[itemId] = runId;
        } else {
          delete next[itemId];
        }
        return next;
      });

      scheduleSave();

      if (!runId) return;

      const key = cacheKey(runId, itemId);
      if (key in responseCacheRef.current) return;
      void fetchResponse(runId, itemId, true);
    },
    [clearScoreIfRunChanged, fetchResponse, scheduleSave],
  );

  const applyMixAssignments = useCallback(
    (assignments: Record<string, string>) => {
      for (const [itemId, newRunId] of Object.entries(assignments)) {
        clearScoreIfRunChanged(itemId, selectedRunByItemRef.current[itemId], newRunId);
      }

      setSelectedRunByItem((prev) => ({ ...prev, ...assignments }));
      scheduleSave();

      for (const [itemId, runId] of Object.entries(assignments)) {
        const key = cacheKey(runId, itemId);
        if (key in responseCacheRef.current) continue;
        void fetchResponse(runId, itemId, true);
      }
    },
    [clearScoreIfRunChanged, fetchResponse, scheduleSave],
  );

  const handleScoreChange = useCallback(
    (itemId: string, field: ScoreField, raw: string) => {
      const value = raw === "" ? null : Number(raw);
      setManualScoresByItem((prev) => ({
        ...prev,
        [itemId]: {
          aid: prev[itemId]?.aid ?? null,
          ltf: prev[itemId]?.ltf ?? null,
          ebc: prev[itemId]?.ebc ?? null,
          [field]: value,
        },
      }));
      scheduleSave();
    },
    [scheduleSave],
  );

  const promptCategories = useMemo(
    () => [...new Set(prompts.map((p) => p.category))].sort(),
    [prompts],
  );

  const chainCategories = useMemo(
    () => [...new Set(chains.map((c) => c.category))].sort(),
    [chains],
  );

  const promptIdsByCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of prompts) {
      (map[row.category] ??= []).push(row.id);
    }
    return map;
  }, [prompts]);

  const chainIdsByCategory = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const row of chains) {
      (map[row.category] ??= []).push(row.id);
    }
    return map;
  }, [chains]);

  const datasetStale =
    viewDatasetSha != null &&
    currentDatasetSha != null &&
    viewDatasetSha !== currentDatasetSha;

  const saveStatusLabel = useMemo(() => {
    switch (saveStatus) {
      case "saving":
        return "Saving…";
      case "saved":
        return "Saved";
      case "error":
        return saveError ?? "Save failed";
      default:
        return null;
    }
  }, [saveError, saveStatus]);

  const renderRunCell = useCallback(
    (itemId: string) => (
      <select
        className={SELECT_CLASS}
        value={selectedRunByItem[itemId] ?? ""}
        onChange={(e) => handleRunChange(itemId, e.target.value)}
      >
        <option value="">—</option>
        {runOptions.map((opt) => (
          <option key={opt.runId} value={opt.runId}>
            {opt.label}
          </option>
        ))}
      </select>
    ),
    [handleRunChange, runOptions, selectedRunByItem],
  );

  const renderScoreCell = useCallback(
    (itemId: string, field: ScoreField) => {
      if (!selectedRunByItem[itemId]) return null;

      const scores = manualScoresByItem[itemId];
      const value = scores?.[field];
      const options =
        field === "aid"
          ? [
              { v: "", label: "—" },
              { v: "0", label: "0" },
              { v: "1", label: "1" },
            ]
          : [
              { v: "", label: "—" },
              ...[1, 2, 3, 4, 5].map((n) => ({ v: String(n), label: String(n) })),
            ];

      return (
        <select
          className={SELECT_CLASS}
          value={value == null ? "" : String(value)}
          onChange={(e) => handleScoreChange(itemId, field, e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.v || "empty"} value={opt.v}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    },
    [handleScoreChange, manualScoresByItem, selectedRunByItem],
  );

  const renderResponseCell = useCallback(
    (itemId: string) => {
      const runId = selectedRunByItem[itemId];
      if (!runId) return null;

      const key = cacheKey(runId, itemId);
      if (loadingKeys[key]) {
        return <span className="text-zinc-500">Loading…</span>;
      }

      if (!(key in responseCache)) {
        return <span className="text-zinc-500">Loading…</span>;
      }

      const text = responseCache[key];
      if (text == null) {
        return <span className="text-zinc-500">No response</span>;
      }

      return text;
    },
    [loadingKeys, responseCache, selectedRunByItem],
  );

  const renderPromptCell = useCallback(
    (row: DatasetPromptRow, columnId: string) => {
      switch (columnId) {
        case "id":
          return row.id;
        case "category":
          return row.category;
        case "text":
          return row.text;
        case "run":
          return renderRunCell(row.id);
        case "response":
          return renderResponseCell(row.id);
        case "aid":
          return renderScoreCell(row.id, "aid");
        case "ltf":
          return renderScoreCell(row.id, "ltf");
        case "ebc":
          return renderScoreCell(row.id, "ebc");
        default:
          return null;
      }
    },
    [renderResponseCell, renderRunCell, renderScoreCell],
  );

  const renderChainCell = useCallback(
    (row: DatasetChainRow, columnId: string) => {
      switch (columnId) {
        case "id":
          return row.id;
        case "chain_id":
          return row.chain_id;
        case "turn":
          return row.turn;
        case "category":
          return row.category;
        case "archetype":
          return row.archetype;
        case "text":
          return row.text;
        case "run":
          return renderRunCell(row.id);
        case "response":
          return renderResponseCell(row.id);
        case "aid":
          return renderScoreCell(row.id, "aid");
        case "ltf":
          return renderScoreCell(row.id, "ltf");
        case "ebc":
          return renderScoreCell(row.id, "ebc");
        default:
          return null;
      }
    },
    [renderResponseCell, renderRunCell, renderScoreCell],
  );

  const handleExportJson = useCallback(() => {
    const datasetSha = currentDatasetSha ?? viewDatasetSha ?? "";
    const data = buildDatasetExport(
      prompts,
      chains,
      selectedRunByItemRef.current,
      responseCacheRef.current,
      manualScoresByItemRef.current,
      datasetSha,
    );
    downloadDatasetExport(data);
  }, [chains, currentDatasetSha, prompts, viewDatasetSha]);

  const summary = useMemo(
    () => `${prompts.length} prompts · ${chains.length} chain turns · ${runOptions.length} runs`,
    [prompts.length, chains.length, runOptions.length],
  );

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading dataset…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  return (
    <div className="w-full space-y-4">
      {datasetStale ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          Saved view was created for a different dataset version. Row selections may not match current
          items.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{summary}</p>
        <div className="flex flex-wrap items-center gap-3">
          {saveStatusLabel ? (
            <span
              className={`text-xs ${
                saveStatus === "error"
                  ? "text-red-600 dark:text-red-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {saveStatusLabel}
            </span>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
            onClick={handleExportJson}
          >
            Export JSON
          </button>
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === "prompts"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
              onClick={() => setTab("prompts")}
            >
              Prompts ({prompts.length})
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === "chains"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
              onClick={() => setTab("chains")}
            >
              Chains ({chains.length})
            </button>
          </div>
        </div>
      </div>

      {runOptions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No generate runs yet. Complete a generate run to compare model responses per row.
        </p>
      ) : null}

      <div className={tab === "prompts" ? "block space-y-4" : "hidden"}>
        <CategoryMixPanel
          key="prompts-mix"
          categories={promptCategories}
          itemIdsByCategory={promptIdsByCategory}
          runOptions={runOptions}
          onApply={applyMixAssignments}
        />
        <ResizableTable
          columns={PROMPT_COLUMNS}
          rows={prompts}
          getRowKey={(row) => row.id}
          renderCell={renderPromptCell}
          emptyMessage="No prompts."
        />
      </div>

      <div className={tab === "chains" ? "block space-y-4" : "hidden"}>
        <CategoryMixPanel
          key="chains-mix"
          categories={chainCategories}
          itemIdsByCategory={chainIdsByCategory}
          runOptions={runOptions}
          onApply={applyMixAssignments}
        />
        <ResizableTable
          columns={CHAIN_COLUMNS}
          rows={chains}
          getRowKey={(row) => row.id}
          renderCell={renderChainCell}
          emptyMessage="No chain turns."
        />
      </div>
    </div>
  );
}
