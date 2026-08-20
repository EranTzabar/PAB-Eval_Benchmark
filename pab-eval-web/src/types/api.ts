export type JobState =
  | "running"
  | "awaiting_decision"
  | "completed"
  | "failed"
  | "stopped"
  | "cancelled";

export type OnFailure = "ask" | "abort" | "continue";

export type FailureDecision = "continue" | "all" | "stop";

export interface Progress {
  completed: number;
  failed: number;
  remaining: number;
  current_item_id: string | null;
}

export interface FailureDetail {
  item_id: string;
  pipe: "generate" | "judge";
  run_id: string;
  judge_run_id: string | null;
  kind: string;
  attempts: Array<{ attempt: number; error: string; kind: string }>;
  cumulative_attempts: number;
  hint: string;
  failed_at: string;
}

export interface Job {
  job_id: string;
  kind: "generate" | "judge";
  run_id: string;
  judge_run_id: string | null;
  state: JobState;
  progress: Progress;
  pending_decision: FailureDetail | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface RunFilters {
  ids?: string[] | null;
  category?: string | null;
  archetype?: string | null;
  max_chains?: number | null;
}

export interface StartRunRequest {
  config_id: string;
  run_id: string;
  filters?: RunFilters;
  on_failure?: OnFailure;
  force?: boolean;
}

export interface TargetConfig {
  base_url: string;
  model: string;
  temperature?: number;
  timeout_s?: number;
}

export interface PersonaConfig {
  mode: "harness" | "endpoint";
  name?: string | null;
  archetype?: string | null;
  wrapper?: "minimal" | "strict" | "none";
  system_prompt?: string | null;
  persona_id?: string | null;
}

export interface RunConfig {
  config_id: string;
  name: string;
  target: TargetConfig;
  persona: PersonaConfig;
  created_at: string;
  updated_at: string;
}

export interface RunConfigCreate {
  name: string;
  target: TargetConfig;
  persona: PersonaConfig;
}

export interface ConfigSummary {
  config_id: string;
  name: string;
  model: string;
  persona_mode: string;
}

export interface RunManifest {
  run_id: string;
  config_id: string;
  persona_mode: string;
  target_base_url: string;
  target_model: string;
  temperature: number;
  started_at: string;
}

export interface RunDetail {
  run_id: string;
  manifest?: RunManifest;
  checkpoint?: Record<string, unknown>;
  job?: Job;
}

export interface RunListItem {
  run_id: string;
  manifest?: RunManifest;
  job?: Job;
}

export interface DatasetStatus {
  valid: boolean;
  singles?: number;
  chains?: number;
  turns?: number;
  total_instances?: number;
  error?: string;
}

export interface RunEvent {
  type: string;
  job: Job;
  detail: FailureDetail | null;
  at: string;
}

export interface ApiError {
  detail: string | Array<{ msg: string }>;
}

export type RenamePhase = "copying" | "deleting" | "done";

export interface RenameStatus {
  old_run_id: string;
  new_run_id: string;
  status: "in_progress" | "completed" | "failed";
  phase: RenamePhase;
  copied: number;
  total: number;
  skipped: number;
  error: string | null;
}
