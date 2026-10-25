# PAB-Eval Benchmark

**Persona Adherence & AI Non-Disclosure Benchmark (PAB-Eval)** — a harness to test whether a model stays in a human/character persona instead of slipping into an AI-assistant voice.

This repo contains:

| Path | Purpose |
|------|---------|
| [`PAB_Eval_Benchmark.md`](PAB_Eval_Benchmark.md) | Benchmark specification |
| [`pab-eval/`](pab-eval/) | FastAPI backend (generate + judge pipes, R2 storage) |
| [`pab-eval-web/`](pab-eval-web/) | Next.js web UI |
| [`docs/pab_eval_flow.puml`](docs/pab_eval_flow.puml) | Architecture flow diagram |

## What it does

Two independent pipes share **Cloudflare R2** storage:

1. **Generate** — send adversarial prompts from a fixed dataset to a target OpenAI-compatible model and store responses.
2. **Judge** — score stored responses with persona-blind LLM judges.

The **Dataset** page lets you compare runs per row, enter manual scores, and export results. Scoring uses three metrics:

| Metric | Range | Meaning |
|--------|-------|---------|
| **AID** | 0 or 1 | AI/assistant persona (**1**) vs human/character persona (**0**) |
| **LTF** | 1–5 | Linguistic and tone fidelity to the character |
| **EBC** | 1–5 | Epistemic boundary compliance for the prompt category |

## Prerequisites

- Python 3.10+
- Node.js 20+ (for the web UI)
- A **Cloudflare R2** bucket (or compatible S3 API)
- API access to your **target model** (OpenAI-compatible endpoint)
- Optional: API key(s) for **judge** model(s)

## Quick start

### 1. Backend

```powershell
cd pab-eval
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set:

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `TARGET_API_KEY` — key for the model under test
- `OPENAI_JUDGE_KEY` (or other vars referenced by judge configs)

Start the API:

```powershell
python main.py
```

API docs: [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)

Run tests (no network, no real credentials):

```powershell
python -m pytest tests -v
```

### 2. Web UI

In a second terminal:

```powershell
cd pab-eval-web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). By default the UI talks to `http://127.0.0.1:8001`. Override with `NEXT_PUBLIC_PAB_API_URL` in `pab-eval-web/.env.local` if needed.

## How to use

### Create a configuration

1. Open **Configurations** → **New configuration**.
2. Set the target model **base URL** and **model name**.
3. Choose persona mode:
   - **Harness** — send a system prompt (inline text or **Persona ID** from an uploaded R2 persona pack).
   - **Endpoint** — no system message; the remote server owns persona injection.
4. Save the config.

**Personas:** upload a folder (must include `persona_facts.md` and `persona_nature.md`) via `POST /personas/upload`, then use the returned `persona_id` in the config. See [`pab-eval/README.md`](pab-eval/README.md).

### Run generate

1. Open **Generate** (home page).
2. Pick a config and enter a **run id**.
3. Start the run. Progress streams over SSE; failed items can park for your decision (`continue` / `all` / `stop`).
4. View runs on **All runs** — rename, inspect responses, attach judges.

### Browse and score the dataset

1. Open **Dataset**.
2. For each row, pick a generate **run** to compare responses.
3. Optionally set manual **AID / LTF / EBC** scores (saved to R2 automatically).
4. Use **Category mix** to assign runs by percentage within a category.
5. **Export JSON** downloads the full table (all prompts and chain turns) at any time.

### Run judges

1. Open **Judges manage** → create a judge (model, base URL, `api_key_env` name).
2. Set the matching key in `pab-eval/.env` and restart the backend.
3. From **All runs** or **Run judge**, activate scoring on a completed generate run.
4. View scores in the run detail UI or via the API.

## Security

- **Never commit secrets.** API keys and R2 credentials belong only in `pab-eval/.env` (gitignored). The web UI reads key *names*, not values.
- The backend binds to `127.0.0.1` by default. There is **no authentication** — do not expose it to the internet without adding auth.
- Config JSON in R2 must not contain inline `api_key` fields; keys are loaded from environment variables only.
- Before pushing to GitHub, confirm `.env` is not tracked:

  ```powershell
  git check-ignore -v pab-eval/.env
  git ls-files | Select-String "\.env"
  ```

  The second command should return nothing.

## Project layout (R2 keys)

```
configs/{config_id}.json
judges/{judge_id}.json
personas/{persona_id}/...
dataset/view.json          # dataset UI state (runs, responses, manual scores)
runs/{run_id}/...
```

## Further reading

- Backend details: [`pab-eval/README.md`](pab-eval/README.md)
- Benchmark spec: [`PAB_Eval_Benchmark.md`](PAB_Eval_Benchmark.md)

## Contributing

Questions and ideas go to [Discussions](https://github.com/EranTzabar/PAB-Eval_Benchmark/discussions). Bugs go to [Issues](https://github.com/EranTzabar/PAB-Eval_Benchmark/issues/new/choose). See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
