# Contributing

Thanks for wanting to help with **PAB-Eval** (Persona Adherence & AI Non-Disclosure Benchmark).

## Where to start

- **Questions and ideas** → [Discussions](https://github.com/EranTzabar/PAB-Eval_Benchmark/discussions)
- **Bugs** → [open an issue](https://github.com/EranTzabar/PAB-Eval_Benchmark/issues/new/choose)
- **Security problems** → follow [SECURITY.md](SECURITY.md). Do not file a public issue.
- **Larger code changes** → start a Discussion first so the approach can be agreed.

## Code of Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up a development copy

Prerequisites: **Python 3.10+**, **Node.js 20+**, a **Cloudflare R2** bucket (or compatible S3 API), and API access to a target OpenAI-compatible model. Judge API keys are optional until you run scoring.

```powershell
git clone https://github.com/EranTzabar/PAB-Eval_Benchmark.git
cd PAB-Eval_Benchmark
```

### Backend

```powershell
cd pab-eval
pip install -r requirements.txt
copy .env.example .env
```

Fill `pab-eval/.env` with `R2_*`, `TARGET_API_KEY`, and any judge key vars (see `.env.example`). Then:

```powershell
python main.py
```

API docs: http://127.0.0.1:8001/docs

### Web UI

In a second terminal:

```powershell
cd pab-eval-web
npm install
npm run dev
```

The UI listens on **http://localhost:3005** and talks to `http://127.0.0.1:8001` by default. Override with `NEXT_PUBLIC_PAB_API_URL` in `pab-eval-web/.env.local`.

### Both processes in one terminal

From the repo root:

```powershell
.\start-dev.ps1
```

Optional: `.\start-dev.ps1 -Port 8005`. Ctrl+C stops both.

More usage detail is in the root [README.md](README.md) and [pab-eval/README.md](pab-eval/README.md).

## Project layout

| Path | Purpose |
|------|---------|
| [`PAB_Eval_Benchmark.md`](PAB_Eval_Benchmark.md) | Benchmark specification |
| [`pab-eval/`](pab-eval/) | FastAPI backend (generate + judge pipes, R2 storage) |
| [`pab-eval/data/`](pab-eval/data/) | Prompt dataset (`prompts.jsonl`, `chains.json`) |
| [`pab-eval/tests/`](pab-eval/tests/) | Backend pytest suite |
| [`pab-eval-web/`](pab-eval-web/) | Next.js web UI |
| [`docs/`](docs/) | Architecture diagrams |
| [`start-dev.ps1`](start-dev.ps1) | Starts API + web UI together |

Run results, configs, personas, and scores live in **R2**, not in this git tree.

## Making a change

1. Branch from `main`.
2. Match the surrounding style in the files you edit.
3. Keep these in sync when they apply:
   - `pab-eval/.env.example` if you add or rename an environment variable
   - the root [README.md](README.md) and [pab-eval/README.md](pab-eval/README.md) if setup or security notes change
   - [PAB_Eval_Benchmark.md](PAB_Eval_Benchmark.md) if you change the scoring or dataset contract
4. Do **not** commit `pab-eval/.env` or `pab-eval-web/.env.local`. Do not put raw `api_key` values in config JSON.
5. Do not rewrite `pab-eval/data/prompts.jsonl` or `pab-eval/data/chains.json` unless that is the point of the change and it was discussed first. The harness does not edit prompts at runtime.
6. The API has **no authentication** and should stay bound to `127.0.0.1` unless you are also adding auth.

### Tests, lint, and types

Backend (from `pab-eval/`; no network, no real credentials):

```powershell
python -m pytest tests -v
```

Web UI (from `pab-eval-web/`):

```powershell
npm run lint
```

There is no separate type-check script. `pab-eval-web` is TypeScript; keep new UI code typed.

## Pull requests

- One topic per PR, keep it small.
- Explain **why**, not only what changed. Link an issue with `Fixes #123` when there is one.
- Include tests for backend behavior you change.
- Include a screenshot or short clip for UI changes.
- Do not add extra docs, refactors, or files beyond the request.

## License

Contributions are licensed under the [MIT License](LICENSE).
