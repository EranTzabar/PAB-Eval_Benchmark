import type {
  DatasetChainRow,
  DatasetExport,
  DatasetExportItem,
  DatasetPromptRow,
} from "@/types/api";

interface ManualScore {
  aid: number | null;
  ltf: number | null;
  ebc: number | null;
}

function cacheKey(runId: string, itemId: string): string {
  return `${runId}:${itemId}`;
}

function exportFieldsForItem(
  itemId: string,
  selectedRunByItem: Record<string, string>,
  responseCache: Record<string, string | null>,
  manualScoresByItem: Record<string, ManualScore>,
): Pick<DatasetExportItem, "run_id" | "response" | "aid" | "ltf" | "ebc"> {
  const runId = selectedRunByItem[itemId] ?? null;
  if (!runId) {
    return { run_id: null, response: null, aid: null, ltf: null, ebc: null };
  }

  const key = cacheKey(runId, itemId);
  const response = key in responseCache ? responseCache[key] : null;
  const scores = manualScoresByItem[itemId];

  return {
    run_id: runId,
    response,
    aid: scores?.aid ?? null,
    ltf: scores?.ltf ?? null,
    ebc: scores?.ebc ?? null,
  };
}

function hasAnyScore(item: Pick<DatasetExportItem, "aid" | "ltf" | "ebc">): boolean {
  return item.aid != null || item.ltf != null || item.ebc != null;
}

export function buildDatasetExport(
  prompts: DatasetPromptRow[],
  chains: DatasetChainRow[],
  selectedRunByItem: Record<string, string>,
  responseCache: Record<string, string | null>,
  manualScoresByItem: Record<string, ManualScore>,
  datasetSha: string,
): DatasetExport {
  const items: DatasetExportItem[] = [];

  for (const row of prompts) {
    const fields = exportFieldsForItem(row.id, selectedRunByItem, responseCache, manualScoresByItem);
    items.push({
      id: row.id,
      kind: "prompt",
      category: row.category,
      text: row.text,
      chain_id: null,
      turn: null,
      archetype: null,
      ...fields,
    });
  }

  for (const row of chains) {
    const fields = exportFieldsForItem(row.id, selectedRunByItem, responseCache, manualScoresByItem);
    items.push({
      id: row.id,
      kind: "chain_turn",
      category: row.category,
      text: row.text,
      chain_id: row.chain_id,
      turn: row.turn,
      archetype: row.archetype,
      ...fields,
    });
  }

  const withRun = items.filter((item) => item.run_id != null).length;
  const withScores = items.filter((item) => hasAnyScore(item)).length;

  return {
    export_version: 1,
    exported_at: new Date().toISOString(),
    dataset_sha256: datasetSha,
    summary: {
      prompts: prompts.length,
      chain_turns: chains.length,
      total_items: items.length,
      with_run: withRun,
      with_scores: withScores,
    },
    items,
  };
}

export function downloadDatasetExport(data: DatasetExport): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = data.exported_at.slice(0, 10);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dataset-export-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
