import type { JudgeRunExportEntry } from "@/lib/judgeRunsExport";
import { judgeRunRowKey } from "@/lib/judgeRunsExport";
import { CATEGORY_ORDER } from "@/lib/judgeMetrics";
import type { JudgeRunMetrics, RunJudgeMetrics, ScoreBucket, ScoreRecord } from "@/types/api";

const PREFIX_TO_CATEGORY: Record<string, string> = {
  DIR: "direct_ai_probe",
  EPI: "epistemic_trap",
  SAF: "safety_refusal",
  OVR: "instruction_override",
  DFT: "multi_turn_drift",
};

export function categoryFromItemId(itemId: string): string | null {
  const prefix = itemId.split("_")[0]?.toUpperCase();
  if (!prefix) return null;
  return PREFIX_TO_CATEGORY[prefix] ?? null;
}

export function bucketFromScores(scores: ScoreRecord[]): ScoreBucket {
  const ok = scores.filter((s) => s.parse_ok);
  const okCount = ok.length;
  if (okCount === 0) {
    return {
      count: scores.length,
      ok_count: 0,
      mean_ltf: null,
      mean_ebc: null,
      aid_rate: null,
    };
  }

  const ltfSum = ok.reduce((sum, s) => sum + (s.ltf ?? 0), 0);
  const ebcSum = ok.reduce((sum, s) => sum + (s.ebc ?? 0), 0);
  const aidHits = ok.filter((s) => s.aid === 1).length;

  return {
    count: scores.length,
    ok_count: okCount,
    mean_ltf: ltfSum / okCount,
    mean_ebc: ebcSum / okCount,
    aid_rate: (aidHits / okCount) * 100,
  };
}

function aggregateByCategory(scores: ScoreRecord[]): Record<string, ScoreBucket> {
  const byCategory: Record<string, ScoreBucket> = {};
  for (const category of CATEGORY_ORDER) {
    const catScores = scores.filter((s) => categoryFromItemId(s.item_id) === category);
    byCategory[category] = bucketFromScores(catScores);
  }
  return byCategory;
}

export function judgeRunMetricsFromExport(entry: JudgeRunExportEntry): JudgeRunMetrics {
  const overall = bucketFromScores(entry.scores);
  return {
    judge_run_id: entry.judge_run_id,
    judge_id: entry.judge_id,
    judge_model: entry.judge_model,
    prompt_version: entry.prompt_version,
    started_at: entry.started_at,
    overall,
    by_category: aggregateByCategory(entry.scores),
  };
}

export function metricsFromExportEntries(entries: JudgeRunExportEntry[]): RunJudgeMetrics[] {
  const byRun = new Map<string, Map<string, JudgeRunMetrics>>();

  for (const entry of entries) {
    let judgeRuns = byRun.get(entry.run_id);
    if (!judgeRuns) {
      judgeRuns = new Map();
      byRun.set(entry.run_id, judgeRuns);
    }
    judgeRuns.set(judgeRunRowKey(entry), judgeRunMetricsFromExport(entry));
  }

  const runs: RunJudgeMetrics[] = [];
  for (const [runId, judgeRunsMap] of byRun) {
    const judge_runs = [...judgeRunsMap.values()].sort((a, b) =>
      a.judge_run_id.localeCompare(b.judge_run_id),
    );
    runs.push({
      run_id: runId,
      target_model: "—",
      judge_runs,
    });
  }

  runs.sort((a, b) => a.run_id.localeCompare(b.run_id));
  return runs;
}
