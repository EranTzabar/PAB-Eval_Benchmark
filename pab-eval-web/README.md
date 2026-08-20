# PAB-Eval Web UI

Next.js dashboard for the **generate pipe** (pipe 1): pick a config, start a run, watch live progress via SSE, stop the run, and resolve failure parking decisions.

## Prerequisites

- PAB-Eval API running (see [`../pab-eval/`](../pab-eval/))
- Dataset files on the API host: `pab-eval/data/prompts.jsonl` and `chains.json`
- At least one config in R2 (`POST /configs` via Swagger or curl)
- Node.js 18+

## Setup

```powershell
cd pab-eval-web
npm install
copy .env.local.example .env.local
```

Edit `.env.local` if the API is not on the default:

```env
NEXT_PUBLIC_PAB_API_URL=http://127.0.0.1:8001
```

PAB-Eval defaults to port **8001** so a target model (e.g. Lema) can use **8000**. Override in `pab-eval/.env` if needed:

```powershell
PAB_PORT=8001
```

## Run

Terminal 1 — backend:

```powershell
cd pab-eval
.\.venv\Scripts\Activate.ps1
python main.py
```

Terminal 2 — frontend:

```powershell
cd pab-eval-web
npm run dev
```

Open http://localhost:3000

## Features (v1)

- Prerequisites banner: health, env vars, dataset
- Config dropdown (existing R2 configs only)
- Start generate run with optional smoke filter (DIR_001, DIR_002)
- Live progress via SSE (`/runs/{id}/events`)
- **Stop** → `POST /runs/{id}/cancel`
- Failure decision panel when parked (`continue` / `all` / `stop`)

Judge pipe UI is planned for a later phase.
