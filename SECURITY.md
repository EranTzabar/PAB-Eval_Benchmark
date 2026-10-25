# Security policy

## Supported versions

Only the latest code on `main` is supported.

| Version | Supported |
|---------|-----------|
| `main`  | Yes       |

## Reporting a vulnerability

**Do not report security problems in public GitHub issues.**

Use GitHub's private advisory form:

https://github.com/EranTzabar/PAB-Eval_Benchmark/security/advisories/new

That link only works after **Private vulnerability reporting** is enabled on this repository.

### What to include

- What the problem is and who it could affect
- Steps to reproduce
- The git commit or branch you tested
- Whether API keys, R2 credentials, or other secrets were involved (do not paste live secrets)

### What happens next

We will acknowledge the report, work on a fix, and credit you in the advisory if you want that.

## Running this project safely

- Keep `R2_*`, `TARGET_API_KEY`, and judge keys only in `pab-eval/.env` (gitignored). Never commit them.
- The API binds to `127.0.0.1` by default and has **no authentication**. Do not expose it on the internet without adding auth first.
- Do not put inline `api_key` fields in config JSON stored in R2; keys load from environment variables only.
- If a secret leaks, rotate it in Cloudflare R2 and at the model provider, then update `.env`.
- Before pushing, confirm `.env` is ignored:

  ```powershell
  git check-ignore -v pab-eval/.env
  git ls-files | Select-String "\.env"
  ```

  The second command should return nothing.
