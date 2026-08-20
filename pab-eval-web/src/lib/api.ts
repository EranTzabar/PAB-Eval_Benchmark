import type {
  ConfigSummary,
  DatasetStatus,
  FailureDecision,
  Job,
  RunConfig,
  RunConfigCreate,
  RunDetail,
  RunListItem,
  RenameStatus,
  StartRunRequest,
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

export async function startRun(body: StartRunRequest): Promise<Job> {
  return request("/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listRuns(): Promise<RunListItem[]> {
  return request("/runs");
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
