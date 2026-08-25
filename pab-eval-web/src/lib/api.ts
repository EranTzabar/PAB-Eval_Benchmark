import type {
  ConfigSummary,
  DatasetItems,
  DatasetStatus,
  DatasetView,
  DatasetViewUpdate,
  FailureDecision,
  Job,
  JudgeConfig,
  JudgeConfigCreate,
  JudgeConfigUpdate,
  JudgeRunDetail,
  JudgeRunListItem,
  PersonaCreate,
  PersonaDetail,
  PersonaManifest,
  PersonaUpdate,
  RunConfig,
  RunConfigCreate,
  RunDetail,
  RunListItem,
  ResponseRecord,
  RenameStatus,
  StartJudgeRequest,
  StartRunRequest,
  ScoreRecord,
  ScoresPage,
} from "@/types/api";

import { canAttachToRun, isTrackableJobState, startParamsFromRunDetail } from "./runs";

export function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_PAB_API_URL ?? "http://127.0.0.1:8001";
  return url.replace(/\/$/, "");
}

async function requestRaw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await requestRaw(path, init);

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail.map((d) => String((d as { msg?: string }).msg ?? d)).join("; ");
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function getHealth(): Promise<{ status: string }> {
  return request("/health");
}

export async function getEnvStatus(): Promise<Record<string, boolean>> {
  return request("/env/status");
}

export async function getDatasetStatus(): Promise<DatasetStatus> {
  try {
    return await request("/dataset");
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "dataset unavailable" };
  }
}

export async function getDatasetItems(): Promise<DatasetItems> {
  try {
    return await request("/dataset/items");
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "dataset unavailable",
      prompts: [],
      chains: [],
    };
  }
}

export async function getDatasetView(): Promise<DatasetView> {
  return request("/dataset/view");
}

export async function putDatasetView(body: DatasetViewUpdate): Promise<DatasetView> {
  return request("/dataset/view", { method: "PUT", body: JSON.stringify(body) });
}

export async function listConfigIds(): Promise<string[]> {
  return request("/configs");
}

export async function getConfig(configId: string): Promise<RunConfig> {
  return request(`/configs/${encodeURIComponent(configId)}`);
}

export async function listConfigs(): Promise<RunConfig[]> {
  const ids = await listConfigIds();
  const configs = await Promise.all(ids.map((id) => getConfig(id)));
  return configs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function listConfigSummaries(): Promise<ConfigSummary[]> {
  const ids = await listConfigIds();
  const configs = await Promise.all(
    ids.map(async (config_id) => {
      const cfg = await getConfig(config_id);
      return {
        config_id,
        name: cfg.name,
        model: cfg.target.model,
        persona_mode: cfg.persona.mode,
      };
    }),
  );
  return configs;
}

export async function createConfig(body: RunConfigCreate): Promise<RunConfig> {
  return request("/configs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateConfig(
  configId: string,
  body: RunConfigCreate,
): Promise<RunConfig> {
  return request(`/configs/${encodeURIComponent(configId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function createPersona(body: PersonaCreate): Promise<PersonaManifest> {
  return request("/personas", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listPersonas(): Promise<PersonaManifest[]> {
  return request("/personas");
}

export async function getPersona(personaId: string): Promise<PersonaDetail> {
  return request(`/personas/${encodeURIComponent(personaId)}`);
}

export async function updatePersona(
  personaId: string,
  body: PersonaUpdate,
): Promise<PersonaManifest> {
  return request(`/personas/${encodeURIComponent(personaId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deletePersona(personaId: string): Promise<void> {
  return request(`/personas/${encodeURIComponent(personaId)}`, {
    method: "DELETE",
  });
}

export async function startRun(body: StartRunRequest): Promise<Job> {
  return request("/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listRuns(): Promise<RunListItem[]> {
  return request("/runs");
}

export async function deleteRun(runId: string): Promise<void> {
  return request(`/runs/${encodeURIComponent(runId)}`, {
    method: "DELETE",
  });
}

export async function getRunResponse(
  runId: string,
  itemId: string,
): Promise<ResponseRecord | null> {
  const res = await requestRaw(
    `/runs/${encodeURIComponent(runId)}/responses/${encodeURIComponent(itemId)}`,
  );
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return (await res.json()) as ResponseRecord;
}

export async function listAllJudgeRuns(): Promise<JudgeRunListItem[]> {
  return request("/runs/judge-runs");
}

export async function getRenameStatus(oldRunId: string): Promise<RenameStatus> {
  return request(`/runs/${encodeURIComponent(oldRunId)}/rename-status`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function renameRun(
  oldRunId: string,
  newRunId: string,
  onStatus?: (status: RenameStatus) => void,
): Promise<RenameStatus> {
  const res = await requestRaw(`/runs/${encodeURIComponent(oldRunId)}`, {
    method: "PATCH",
    body: JSON.stringify({ run_id: newRunId }),
  });

  if (!res.ok && res.status !== 202) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const initial = (await res.json()) as RenameStatus;
  onStatus?.(initial);
  if (initial.status === "completed") {
    return initial;
  }

  while (true) {
    await sleep(500);
    const status = await getRenameStatus(oldRunId);
    onStatus?.(status);
    if (status.status === "completed") {
      return status;
    }
    if (status.status === "failed") {
      throw new Error(status.error ?? "Rename failed");
    }
  }
}

export async function getRun(runId: string, signal?: AbortSignal): Promise<RunDetail> {
  return request(`/runs/${encodeURIComponent(runId)}`, { signal });
}

export async function attachToActiveRun(
  runId: string,
  fallback?: Partial<StartRunRequest>,
): Promise<{ startParams: StartRunRequest; job: Job } | null> {
  const detail = await getRun(runId);
  if (!canAttachToRun(detail)) return null;
  const startParams = startParamsFromRunDetail(detail, fallback);
  if (!startParams) return null;
  return { startParams, job: detail.job };
}

export async function findActiveGenerateRun(): Promise<{
  startParams: StartRunRequest;
  job: Job;
} | null> {
  const runs = await listRuns();
  for (const run of runs) {
    if (!run.job || !isTrackableJobState(run.job.state)) continue;
    const attached = await attachToActiveRun(run.run_id);
    if (attached) return attached;
  }
  return null;
}

export async function cancelRun(runId: string): Promise<{ ok: boolean }> {
  return request(`/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
}

export async function submitRunDecision(
  runId: string,
  decision: FailureDecision,
): Promise<{ ok: boolean }> {
  return request(`/runs/${encodeURIComponent(runId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function runEventsUrl(runId: string): string {
  return `${apiBaseUrl()}/runs/${encodeURIComponent(runId)}/events`;
}

export async function listJudgeIds(): Promise<string[]> {
  const judges = await request<JudgeConfig[]>("/judges");
  return judges.map((j) => j.judge_id);
}

export async function listJudges(): Promise<JudgeConfig[]> {
  const items = await request<JudgeConfig[]>("/judges");
  return items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getJudge(judgeId: string): Promise<JudgeConfig> {
  return request(`/judges/${encodeURIComponent(judgeId)}`);
}

export async function createJudge(body: JudgeConfigCreate): Promise<JudgeConfig> {
  return request("/judges", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateJudge(
  judgeId: string,
  body: JudgeConfigUpdate,
): Promise<JudgeConfig> {
  return request(`/judges/${encodeURIComponent(judgeId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteJudge(judgeId: string): Promise<void> {
  return request(`/judges/${encodeURIComponent(judgeId)}`, { method: "DELETE" });
}

export async function startJudges(
  runId: string,
  body: StartJudgeRequest,
): Promise<Job[]> {
  return request(`/runs/${encodeURIComponent(runId)}/judges`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getJudgeRun(
  runId: string,
  judgeRunId: string,
  signal?: AbortSignal,
): Promise<JudgeRunDetail> {
  return request(
    `/runs/${encodeURIComponent(runId)}/judges/${encodeURIComponent(judgeRunId)}`,
    { signal },
  );
}

export async function cancelJudgeRun(
  runId: string,
  judgeRunId: string,
): Promise<{ ok: boolean }> {
  return request(
    `/runs/${encodeURIComponent(runId)}/judges/${encodeURIComponent(judgeRunId)}/cancel`,
    { method: "POST" },
  );
}

export async function submitJudgeDecision(
  runId: string,
  judgeRunId: string,
  decision: FailureDecision,
): Promise<{ ok: boolean }> {
  return request(
    `/runs/${encodeURIComponent(runId)}/judges/${encodeURIComponent(judgeRunId)}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ decision }),
    },
  );
}

export function judgeEventsUrl(runId: string, judgeRunId: string): string {
  return `${apiBaseUrl()}/runs/${encodeURIComponent(runId)}/judges/${encodeURIComponent(judgeRunId)}/events`;
}

export async function listJudgeScores(
  runId: string,
  judgeRunId: string,
  opts?: { limit?: number; cursor?: string; signal?: AbortSignal },
): Promise<ScoresPage> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return request(
    `/runs/${encodeURIComponent(runId)}/judges/${encodeURIComponent(judgeRunId)}/scores${qs ? `?${qs}` : ""}`,
    { signal: opts?.signal },
  );
}

export async function fetchAllJudgeScores(
  runId: string,
  judgeRunId: string,
  signal?: AbortSignal,
): Promise<ScoreRecord[]> {
  const all: ScoreRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await listJudgeScores(runId, judgeRunId, {
      limit: 500,
      cursor,
      signal,
    });
    all.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return all.sort((a, b) => a.item_id.localeCompare(b.item_id));
}
