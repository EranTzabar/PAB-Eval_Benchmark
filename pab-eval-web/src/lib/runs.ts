import type { Job, JobState, RunDetail, StartRunRequest } from "@/types/api";

const TRACKABLE_STATES: JobState[] = ["running", "awaiting_decision"];

export function isTrackableJobState(state: JobState): boolean {
  return TRACKABLE_STATES.includes(state);
}

export function isJobAlreadyRunningMessage(message: string): boolean {
  return message.includes("job already running");
}

export function isManifestConflictMessage(message: string): boolean {
  return message.includes("manifest mismatch");
}

export function startParamsFromRunDetail(
  detail: RunDetail,
  fallback?: Partial<StartRunRequest>,
): StartRunRequest | null {
  const configId = detail.manifest?.config_id ?? fallback?.config_id;
  if (!configId) return null;
  return {
    config_id: configId,
    run_id: detail.run_id,
    on_failure: fallback?.on_failure ?? "ask",
    filters: fallback?.filters,
    force: fallback?.force,
  };
}

export function canAttachToRun(
  detail: RunDetail,
): detail is RunDetail & { job: Job } {
  return Boolean(detail.job && isTrackableJobState(detail.job.state));
}
