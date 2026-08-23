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

export interface DatasetPromptRow {
  id: string;
  category: string;
  text: string;
}

export interface DatasetChainRow {
  id: string;
  chain_id: string;
  turn: number;
  category: string;
  archetype: string;
  text: string;
}

export interface DatasetItems {
  valid: boolean;
  error?: string;
  prompts: DatasetPromptRow[];
  chains: DatasetChainRow[];
}

export interface DatasetViewRow {
  run_id: string;
  response: string | null;
  aid?: number | null;
  ltf?: number | null;
  ebc?: number | null;
}

export interface DatasetView {
  version: number;
  updated_at: string;
  dataset_sha256: string;
  rows: Record<string, DatasetViewRow>;
  /** Present on GET /dataset/view for stale-dataset detection */
  current_dataset_sha256?: string;
}

export interface DatasetViewUpdate {
  rows: Record<string, DatasetViewRow>;
}

export interface DatasetExportItem {
  id: string;
  kind: "prompt" | "chain_turn";
  category: string;
  text: string;
  chain_id: string | null;
  turn: number | null;
  archetype: string | null;
  run_id: string | null;
  response: string | null;
  aid: number | null;
  ltf: number | null;
  ebc: number | null;
}

export interface DatasetExport {
  export_version: number;
  exported_at: string;
  dataset_sha256: string;
  summary: {
    prompts: number;
    chain_turns: number;
    total_items: number;
    with_run: number;
    with_scores: number;
  };
  items: DatasetExportItem[];
}

export interface ResponseRecord {
  item_id: string;
  run_id: string;
  category: string;
  chain_id?: string | null;
  turn?: number | null;
  prompt: string;
  response: string;
  latency_ms: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  generated_at: string;
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

export interface JudgeConfig {
  judge_id: string;
  name: string;
  base_url: string;
  model: string;
  api_key_env: string;
  temperature: number;
  max_tokens?: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  api_key_set: boolean;
}

export interface JudgeConfigCreate {
  judge_id: string;
  name: string;
  base_url: string;
  model: string;
  api_key_env: string;
  temperature?: number;
  max_tokens?: number | null;
  notes?: string;
}

export interface JudgeConfigUpdate {
  name: string;
  base_url: string;
  model: string;
  api_key_env: string;
  temperature?: number;
  max_tokens?: number | null;
  notes?: string;
}

export interface StartJudgeRequest {
  judge_ids: string[];
  judge_run_ids?: Record<string, string>;
  on_failure?: OnFailure;
}

export interface JudgeRunDetail {
  manifest?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
  job?: Job;
}

export interface JudgeRunListItem {
  run_id: string;
  judge_run_id: string;
  manifest?: {
    judge_id: string;
    judge_model: string;
    started_at: string;
    prompt_version?: string;
  };
  job?: Job;
  progress?: Progress;
}

export interface ScoreRecord {
  item_id: string;
  aid: number | null;
  ltf: number | null;
  ebc: number | null;
  parse_ok: boolean;
  error: string | null;
  scored_at: string;
}

export interface ScoresPage {
  items: ScoreRecord[];
  next_cursor: string | null;
}
