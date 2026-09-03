import type { JudgeRunMetrics, RunJudgeMetrics, ScoreBucket, ScoreRecord } from "@/types/api";

export const CATEGORY_ORDER = [
  "direct_ai_probe",
  "epistemic_trap",
  "safety_refusal",
  "instruction_override",
  "multi_turn_drift",
] as const;

export type CategoryKey = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  direct_ai_probe: "Direct AI probe",
  epistemic_trap: "Epistemic trap",
  safety_refusal: "Safety refusal",
  instruction_override: "Instruction override",
  multi_turn_drift: "Multi-turn drift",
};

export const OVERALL_ROW_KEY = "__overall__";

export interface ScoreSummary {
  total: number;
  okCount: number;
  meanLtf: number | null;
  meanEbc: number | null;
  aidRate: number | null;
}

export function computeSummary(scores: ScoreRecord[]): ScoreSummary {
  const ok = scores.filter((s) => s.parse_ok);
  const aidHits = ok.filter((s) => s.aid === 1).length;
  const ltfSum = ok.reduce((sum, s) => sum + (s.ltf ?? 0), 0);
  const ebcSum = ok.reduce((sum, s) => sum + (s.ebc ?? 0), 0);
  const okCount = ok.length;
  return {
    total: scores.length,
    okCount,
    meanLtf: okCount > 0 ? ltfSum / okCount : null,
    meanEbc: okCount > 0 ? ebcSum / okCount : null,
    aidRate: okCount > 0 ? (aidHits / okCount) * 100 : null,
  };
}

export function bucketToSummary(bucket: ScoreBucket): ScoreSummary {
  return {
    total: bucket.count,
    okCount: bucket.ok_count,
    meanLtf: bucket.mean_ltf,
    meanEbc: bucket.mean_ebc,
    aidRate: bucket.aid_rate,
  };
}

export function formatMean(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(1);
}

export function formatAidRate(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value)}%`;
}

export function formatMetricCell(bucket: ScoreBucket): string {
  if (bucket.ok_count === 0) return "—";
  return `${formatMean(bucket.mean_ltf)} / ${formatMean(bucket.mean_ebc)} / ${formatAidRate(bucket.aid_rate)}`;
}

export function formatScored(bucket: ScoreBucket): string {
  if (bucket.count === 0) return "—";
  return `${bucket.ok_count}/${bucket.count}`;
}

export function distinctJudgeIds(runs: RunJudgeMetrics[]): string[] {
  const ids = new Set<string>();
  for (const run of runs) {
    for (const jr of run.judge_runs) {
      ids.add(jr.judge_id);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function latestJudgeRunById(
  run: RunJudgeMetrics,
  judgeId: string,
): JudgeRunMetrics | null {
  const matches = run.judge_runs.filter((jr) => jr.judge_id === judgeId);
  if (matches.length === 0) return null;
  return matches.reduce((latest, current) => {
    const latestAt = latest.started_at ?? "";
    const currentAt = current.started_at ?? "";
    return currentAt >= latestAt ? current : latest;
  });
}

export interface JudgeRunPair {
  runId: string;
  targetModel: string;
  judgeRun: JudgeRunMetrics;
}

export function allJudgeRunPairs(runs: RunJudgeMetrics[]): JudgeRunPair[] {
  const pairs: JudgeRunPair[] = [];
  for (const run of runs) {
    for (const judgeRun of run.judge_runs) {
      pairs.push({
        runId: run.run_id,
        targetModel: run.target_model,
        judgeRun,
      });
    }
  }
  return pairs.sort((a, b) => {
    const runCmp = a.runId.localeCompare(b.runId);
    if (runCmp !== 0) return runCmp;
    return a.judgeRun.judge_run_id.localeCompare(b.judgeRun.judge_run_id);
  });
}

export function pairKey(runId: string, judgeRunId: string): string {
  return `${runId}::${judgeRunId}`;
}

export function parsePairKey(key: string): { runId: string; judgeRunId: string } {
  const [runId, judgeRunId] = key.split("::");
  return { runId, judgeRunId };
}
