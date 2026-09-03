import { zipSync } from "fflate";

import { fetchAllJudgeScores } from "@/lib/api";
import type { JudgeRunListItem, ScoreRecord } from "@/types/api";

export type JudgeRunsExportFormat = "json" | "csv";

export interface JudgeRunExportEntry {
  run_id: string;
  judge_run_id: string;
  judge_id: string;
  judge_model: string;
  prompt_version?: string;
  started_at?: string;
  scores: ScoreRecord[];
}

export interface JudgeRunsExport {
  export_version: 1;
  exported_at: string;
  format: "json";
  judge_runs: JudgeRunExportEntry[];
}

export type RunExportState = "pending" | "fetching" | "done" | "error";

export interface RunExportStatus {
  run_id: string;
  judge_run_id: string;
  state: RunExportState;
  scoresLoaded: number;
  scoresTotal: number | null;
  error?: string;
}

export interface JudgeRunsExportProgress {
  phase: "fetching" | "building";
  runs: RunExportStatus[];
  overall: {
    scoresLoaded: number;
    scoresTotal: number | null;
    runsDone: number;
    runsTotal: number;
  };
}

export function judgeRunRowKey(item: Pick<JudgeRunListItem, "run_id" | "judge_run_id">): string {
  return `${item.run_id}::${item.judge_run_id}`;
}

export function expectedScoreCount(item: JudgeRunListItem): number | null {
  const progress = item.progress ?? item.job?.progress;
  if (!progress) return null;
  const total = progress.completed + progress.failed;
  return total > 0 ? total : null;
}

export function createInitialExportProgress(items: JudgeRunListItem[]): JudgeRunsExportProgress {
  const runs = items.map((item) => ({
    run_id: item.run_id,
    judge_run_id: item.judge_run_id,
    state: "pending" as const,
    scoresLoaded: 0,
    scoresTotal: expectedScoreCount(item),
  }));

  return {
    phase: "fetching",
    runs,
    overall: computeOverall(runs),
  };
}

function computeOverall(runs: RunExportStatus[]): JudgeRunsExportProgress["overall"] {
  const runsDone = runs.filter((run) => run.state === "done").length;
  const scoresLoaded = runs.reduce((sum, run) => sum + run.scoresLoaded, 0);

  const knownTotals = runs
    .map((run) => run.scoresTotal)
    .filter((total): total is number => total != null);
  const scoresTotal =
    knownTotals.length === runs.length
      ? knownTotals.reduce((sum, total) => sum + total, 0)
      : knownTotals.length > 0
        ? knownTotals.reduce((sum, total) => sum + total, 0)
        : null;

  return {
    scoresLoaded,
    scoresTotal,
    runsDone,
    runsTotal: runs.length,
  };
}

function patchRun(
  progress: JudgeRunsExportProgress,
  key: string,
  patch: Partial<RunExportStatus>,
): JudgeRunsExportProgress {
  const runs = progress.runs.map((run) => {
    if (judgeRunRowKey(run) !== key) return run;
    return { ...run, ...patch };
  });
  return { ...progress, runs, overall: computeOverall(runs) };
}

export function overallProgressPct(progress: JudgeRunsExportProgress): number {
  if (progress.phase === "building") return 100;
  const { scoresLoaded, scoresTotal, runsDone, runsTotal } = progress.overall;
  if (scoresTotal != null && scoresTotal > 0) {
    return (scoresLoaded / scoresTotal) * 100;
  }
  if (runsTotal > 0) {
    return (runsDone / runsTotal) * 100;
  }
  return 0;
}

export function runProgressPct(run: RunExportStatus): number | null {
  if (run.state === "done") return 100;
  if (run.scoresTotal != null && run.scoresTotal > 0) {
    return (run.scoresLoaded / run.scoresTotal) * 100;
  }
  return null;
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function fetchJudgeRunsForExport(
  items: JudgeRunListItem[],
  opts?: {
    onProgress?: (progress: JudgeRunsExportProgress) => void;
    signal?: AbortSignal;
  },
): Promise<JudgeRunExportEntry[]> {
  const exported: JudgeRunExportEntry[] = [];
  let progress = createInitialExportProgress(items);
  opts?.onProgress?.(progress);

  for (const item of items) {
    if (opts?.signal?.aborted) {
      throw new DOMException("Export aborted", "AbortError");
    }

    const key = judgeRunRowKey(item);
    progress = patchRun(progress, key, { state: "fetching", scoresLoaded: 0 });
    opts?.onProgress?.(progress);

    try {
      const scores = await fetchAllJudgeScores(item.run_id, item.judge_run_id, {
        signal: opts?.signal,
        onPage: (loaded) => {
          progress = patchRun(progress, key, { scoresLoaded: loaded });
          opts?.onProgress?.(progress);
        },
      });

      exported.push({
        run_id: item.run_id,
        judge_run_id: item.judge_run_id,
        judge_id: item.manifest?.judge_id ?? item.judge_run_id,
        judge_model: item.manifest?.judge_model ?? "—",
        prompt_version: item.manifest?.prompt_version,
        started_at: item.manifest?.started_at,
        scores,
      });

      progress = patchRun(progress, key, {
        state: "done",
        scoresLoaded: scores.length,
        scoresTotal: scores.length,
      });
      opts?.onProgress?.(progress);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed";
      progress = patchRun(progress, key, { state: "error", error: message });
      opts?.onProgress?.(progress);
      throw err;
    }
  }

  return exported;
}

export function buildJudgeRunsExport(judgeRuns: JudgeRunExportEntry[]): JudgeRunsExport {
  return {
    export_version: 1,
    exported_at: new Date().toISOString(),
    format: "json",
    judge_runs: judgeRuns,
  };
}

export function buildJudgeRunsCsv(judgeRuns: JudgeRunExportEntry[]): string {
  const header = [
    "run_id",
    "judge_run_id",
    "judge_id",
    "judge_model",
    "prompt_version",
    "item_id",
    "aid",
    "ltf",
    "ebc",
    "parse_ok",
    "error",
    "scored_at",
  ];

  const rows: string[] = [header.join(",")];

  for (const run of judgeRuns) {
    for (const score of run.scores) {
      rows.push(
        [
          run.run_id,
          run.judge_run_id,
          run.judge_id,
          run.judge_model,
          run.prompt_version ?? "",
          score.item_id,
          score.aid ?? "",
          score.ltf ?? "",
          score.ebc ?? "",
          score.parse_ok ? "true" : "false",
          score.error ?? "",
          score.scored_at,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  return rows.join("\n");
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_");
}

/** `<Generate run>__<Judge>.json|csv` */
export function judgeRunExportFilename(
  run: Pick<JudgeRunExportEntry, "run_id" | "judge_id" | "judge_run_id">,
  format: JudgeRunsExportFormat,
): string {
  const generateRun = sanitizeFilenamePart(run.run_id);
  const judge = sanitizeFilenamePart(run.judge_id || run.judge_run_id);
  return `${generateRun}__${judge}.${format}`;
}

function uniqueExportFilenames(
  judgeRuns: JudgeRunExportEntry[],
  format: JudgeRunsExportFormat,
): string[] {
  const used = new Set<string>();
  return judgeRuns.map((run) => {
    let name = judgeRunExportFilename(run, format);
    if (used.has(name)) {
      name = `${sanitizeFilenamePart(run.run_id)}__${sanitizeFilenamePart(run.judge_run_id)}.${format}`;
    }
    let suffix = 2;
    const base = name.replace(new RegExp(`\\.${format}$`), "");
    while (used.has(name)) {
      name = `${base}_${suffix}.${format}`;
      suffix += 1;
    }
    used.add(name);
    return name;
  });
}

function fileContentsForRun(run: JudgeRunExportEntry, format: JudgeRunsExportFormat): string {
  if (format === "json") {
    return JSON.stringify(buildJudgeRunsExport([run]), null, 2);
  }
  return buildJudgeRunsCsv([run]);
}

export async function exportJudgeRuns(
  items: JudgeRunListItem[],
  format: JudgeRunsExportFormat,
  opts?: {
    onProgress?: (progress: JudgeRunsExportProgress) => void;
    signal?: AbortSignal;
  },
): Promise<JudgeRunExportEntry[]> {
  const judgeRuns = await fetchJudgeRunsForExport(items, opts);
  if (opts?.signal?.aborted) {
    throw new DOMException("Export aborted", "AbortError");
  }
  if (judgeRuns.length !== items.length) {
    throw new Error(
      `Export incomplete: fetched ${judgeRuns.length} of ${items.length} judge runs`,
    );
  }

  const buildingProgress: JudgeRunsExportProgress = {
    phase: "building",
    runs: judgeRuns.map((run) => ({
      run_id: run.run_id,
      judge_run_id: run.judge_run_id,
      state: "done",
      scoresLoaded: run.scores.length,
      scoresTotal: run.scores.length,
    })),
    overall: {
      scoresLoaded: judgeRuns.reduce((sum, run) => sum + run.scores.length, 0),
      scoresTotal: judgeRuns.reduce((sum, run) => sum + run.scores.length, 0),
      runsDone: judgeRuns.length,
      runsTotal: judgeRuns.length,
    },
  };
  opts?.onProgress?.(buildingProgress);

  const filenames = uniqueExportFilenames(judgeRuns, format);
  const encoder = new TextEncoder();

  if (judgeRuns.length === 1) {
    const text = fileContentsForRun(judgeRuns[0], format);
    const blob = new Blob([text], {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    });
    downloadBlob(filenames[0], blob);
  } else {
    // One ZIP download — browsers block 3+ consecutive automatic file downloads.
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < judgeRuns.length; i++) {
      files[filenames[i]] = encoder.encode(fileContentsForRun(judgeRuns[i], format));
    }
    const zipped = zipSync(files, { level: 6 });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(`judge-runs-${judgeRuns.length}files-${date}.zip`, new Blob([zipped], { type: "application/zip" }));
  }

  return judgeRuns;
}
