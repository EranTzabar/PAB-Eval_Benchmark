import { unzipSync } from "fflate";

import type { JudgeRunExportEntry, JudgeRunsExport } from "@/lib/judgeRunsExport";

export interface ImportError {
  source: string;
  message: string;
}

export interface ImportResult {
  entries: JudgeRunExportEntry[];
  errors: ImportError[];
  fileCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScoreRecord(value: unknown, source: string, index: number): JudgeRunExportEntry["scores"][number] | null {
  if (!isRecord(value)) return null;
  if (typeof value.item_id !== "string") {
    throw new Error(`${source}: scores[${index}].item_id must be a string`);
  }
  return {
    item_id: value.item_id,
    aid: typeof value.aid === "number" ? value.aid : null,
    ltf: typeof value.ltf === "number" ? value.ltf : null,
    ebc: typeof value.ebc === "number" ? value.ebc : null,
    parse_ok: Boolean(value.parse_ok),
    error: typeof value.error === "string" ? value.error : null,
    scored_at: typeof value.scored_at === "string" ? value.scored_at : "",
  };
}

function parseJudgeRunEntry(value: unknown, source: string, index: number): JudgeRunExportEntry {
  if (!isRecord(value)) {
    throw new Error(`${source}: judge_runs[${index}] must be an object`);
  }
  if (typeof value.run_id !== "string" || !value.run_id) {
    throw new Error(`${source}: judge_runs[${index}].run_id is required`);
  }
  if (typeof value.judge_run_id !== "string" || !value.judge_run_id) {
    throw new Error(`${source}: judge_runs[${index}].judge_run_id is required`);
  }
  if (!Array.isArray(value.scores)) {
    throw new Error(`${source}: judge_runs[${index}].scores must be an array`);
  }

  const judge_id =
    typeof value.judge_id === "string" && value.judge_id ? value.judge_id : value.judge_run_id;
  const judge_model = typeof value.judge_model === "string" ? value.judge_model : "—";

  return {
    run_id: value.run_id,
    judge_run_id: value.judge_run_id,
    judge_id,
    judge_model,
    prompt_version: typeof value.prompt_version === "string" ? value.prompt_version : undefined,
    started_at: typeof value.started_at === "string" ? value.started_at : undefined,
    scores: value.scores.map((score, scoreIndex) => {
      const parsed = parseScoreRecord(score, source, scoreIndex);
      if (!parsed) {
        throw new Error(`${source}: scores[${scoreIndex}] must be an object`);
      }
      return parsed;
    }),
  };
}

export function parseJudgeRunsExportJson(text: string, source: string): JudgeRunExportEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${source}: invalid JSON`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${source}: root must be an object`);
  }
  if (parsed.export_version !== 1) {
    throw new Error(`${source}: export_version must be 1`);
  }
  if (!Array.isArray(parsed.judge_runs)) {
    throw new Error(`${source}: judge_runs must be an array`);
  }

  return parsed.judge_runs.map((entry, index) =>
    parseJudgeRunEntry(entry, source, index),
  );
}

function collectJsonFromZip(bytes: Uint8Array, zipName: string): { name: string; text: string }[] {
  const files: { name: string; text: string }[] = [];
  const unzipped = unzipSync(bytes);

  for (const [name, content] of Object.entries(unzipped)) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    const baseName = name.split("/").pop() ?? name;
    files.push({
      name: `${zipName}/${baseName}`,
      text: new TextDecoder().decode(content),
    });
  }

  if (files.length === 0) {
    throw new Error(`${zipName}: no .json files found in ZIP`);
  }

  return files;
}

export async function importJudgeRunsFromFiles(files: File[]): Promise<ImportResult> {
  const entries: JudgeRunExportEntry[] = [];
  const errors: ImportError[] = [];
  let fileCount = 0;

  for (const file of files) {
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".zip")) {
      try {
        const buffer = await file.arrayBuffer();
        const jsonFiles = collectJsonFromZip(new Uint8Array(buffer), file.name);
        for (const jsonFile of jsonFiles) {
          fileCount += 1;
          try {
            entries.push(...parseJudgeRunsExportJson(jsonFile.text, jsonFile.name));
          } catch (err) {
            errors.push({
              source: jsonFile.name,
              message: err instanceof Error ? err.message : "Failed to parse JSON",
            });
          }
        }
      } catch (err) {
        errors.push({
          source: file.name,
          message: err instanceof Error ? err.message : "Failed to read ZIP",
        });
      }
      continue;
    }

    if (lower.endsWith(".json")) {
      fileCount += 1;
      try {
        const text = await file.text();
        entries.push(...parseJudgeRunsExportJson(text, file.name));
      } catch (err) {
        errors.push({
          source: file.name,
          message: err instanceof Error ? err.message : "Failed to parse JSON",
        });
      }
      continue;
    }

    errors.push({
      source: file.name,
      message: "Unsupported file type (use .json or .zip)",
    });
  }

  return { entries, errors, fileCount };
}

export function mergeExportEntries(
  existing: JudgeRunExportEntry[],
  incoming: JudgeRunExportEntry[],
): JudgeRunExportEntry[] {
  const map = new Map<string, JudgeRunExportEntry>();
  for (const entry of existing) {
    map.set(`${entry.run_id}::${entry.judge_run_id}`, entry);
  }
  for (const entry of incoming) {
    map.set(`${entry.run_id}::${entry.judge_run_id}`, entry);
  }
  return [...map.values()];
}

export type { JudgeRunsExport };
