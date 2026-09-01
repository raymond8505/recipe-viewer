# Deployment

## Deploy Workflow — Env Var Enforcement

All server-side env vars are validated at app startup via `src/env.ts` (`@t3-oss/env-nextjs` + zod). A missing or malformed var crashes the container immediately — the deploy health check catches it and fails the deploy. No more silent 503s.

`docker-compose.yml` uses `env_file: .env` — never add vars to the `environment:` block. Adding a new var requires:
1. Add to `src/env.ts` `server:` and `runtimeEnv:` (this is the single source of truth)
2. Add the GitHub Secret in repo Settings → Secrets
3. Wire through `deploy.yml` in 3 places (`env:` block, `envs:` list, `.env` heredoc)

`scripts/validate-deploy-env.sh` enforces step 3 in the CI build job (wired June 2026 — it had been dormant: the `*.sh` gitignore rule kept it out of the repo, so it's committed via `git add -f`; future edits to it need `-f` only if it's ever re-deleted). `SKIP_ENV_VALIDATION` and `NODE_ENV` are excluded from its Rule 1.

**`SKIP_ENV_VALIDATION=1` is set in two places — both load-bearing:**
- `Dockerfile` builder stage: server vars aren't available during `next build`
- `vitest.config.ts` `env:` block: must use `env:` not `setupFiles` (module-level code runs before setup files)

**`vi.stubEnv` doesn't work in tests for vars from `@/env`** — `createEnv` is a module-level singleton; `runtimeEnv` is captured once at import time. Use `vi.mock("@/env", () => ({ env: { VAR: "value" } }))` instead.

**zod `.default()`s in env.ts do NOT apply under vitest** — `skipValidation` returns `runtimeEnv` unparsed, so `env.X` is `undefined` in tests even when the schema has a default. Any test whose import chain reaches the real `@/env` must mock it (with inline literals — `vi.mock` factories are hoisted and can't close over module consts).

## Per-PR Staging Deployments

`.github/workflows/staging.yml` gives every open PR its own live container, separate from the prod `deploy.yml` flow.

- **URL:** `<branch-slug>.new.raymonds.recipes` — the branch name slugified to a DNS label. This rides the existing `*.new.raymonds.recipes` wildcard DNS + Traefik `mytlschallenge` cert resolver. (It is **not** `new-<branch>.raymonds.recipes`, which would need an apex `*.raymonds.recipes` wildcard that doesn't exist.)
- **Identity is keyed on PR number**, not branch: container `recipe-viewer-staging-pr-<n>`, compose project `recipe-viewer-staging-pr-<n>`, Traefik router/service/middleware names all suffixed with `pr-<n>`, and VPS dir `${VPS_DEPLOY_PATH}/staging/pr-<n>`. The branch slug is used **only** for the public host. This keeps `synchronize`/teardown deterministic even if the branch is renamed/deleted.
- **Triggers:** `pull_request` `[opened, synchronize, reopened]` → `deploy-staging`; `[closed]` (merged OR not) → `teardown-staging`. `concurrency: staging-<pr-number>` with `cancel-in-progress` supersedes in-flight deploys.
- **The preview link is surfaced as a GitHub Deployment** (Vercel-style "View deployment" button in the PR / Environments), **not** a comment. The deploy job opens a deployment in environment `staging-pr-<n>` (`in_progress`), then finalizes it `success` with `environment_url=https://<host>` (or `failure`/`inactive`). Teardown marks all deployments in that environment `inactive` (and best-effort deletes the environment — usually 403 under the default `GITHUB_TOKEN`, which is fine). Requires `permissions: deployments: write`.
- **`docker-compose.staging.yml`** is a templated mirror of `docker-compose.yml`: every fixed identifier is interpolated from `PR_ID` / `STAGING_HOST` exported in the deploy script. Keep the two compose files in sync when changing the service (ports, network `n8n_default`, logging, build args).
- **Env:** staging reuses **all** prod secrets and **shares the production Supabase** — reviewers can mutate real data. The only per-PR override is `MCP_PUBLIC_URL`, pointed at the staging host so OAuth/MCP callbacks resolve. **No new GitHub secret** — staging lives under the existing `VPS_DEPLOY_PATH/staging/`.
- **`scripts/validate-deploy-env.sh` now validates BOTH `deploy.yml` and `staging.yml`** (loops over both; each must be self-consistent across the 3 rules). So adding a runtime var means wiring it through staging.yml's `env:`/`envs:`/`.env` heredoc too, not just deploy.yml. Workflow steps that write `$GITHUB_OUTPUT` must use `printf`, **not** the double-quoted `echo` form, or the validator misparses them as `.env` heredoc lines.
- **A PR branched from main before staging.yml + docker-compose.staging.yml were merged won't have these files**, so its staging deploy fails until rebased onto an up-to-date main. Inherent to self-hosting the workflow in-repo.
