#!/usr/bin/env bash
# Validates that every process.env.X used in src/ is wired through the deploy
# workflows. Checks BOTH the production workflow (deploy.yml) and the per-PR
# staging workflow (staging.yml) — each must be self-consistent.
#
# Rules (applied per workflow file):
#   1. Every process.env.X in src/ (except NODE_ENV) must appear as a
#      left-hand name in that file's .env heredoc
#   2. Every ${REFVAR} referenced in the heredoc must be in that file's env: block
#   3. Every ${REFVAR} referenced in the heredoc must be in that file's envs: list
#
# Limitations:
#   - Does not detect dynamic env access via process.env[key]
#   - Assumes heredoc lines follow the pattern: echo "NAME=${REFVAR}"
#     (workflow steps that write GITHUB_OUTPUT must use printf, not echo "...",
#      or they'll be misparsed as heredoc lines)
#
# Run locally:  bash scripts/validate-deploy-env.sh
# Run in CI:    called automatically by the build job in deploy.yml

set -euo pipefail

DEPLOY_FILES=(".github/workflows/deploy.yml" ".github/workflows/staging.yml")
SRC_DIR="src"
ERRORS=0

fail() { echo "ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); }

# process.env.X names in src/ (no tests/stories/NODE_ENV).
# SKIP_ENV_VALIDATION is excluded: it's the build/test-time flag that controls
# t3-env validation itself, never a runtime .env var.
SRC_VARS=$(grep -rh --include="*.ts" --include="*.tsx" \
    --exclude="*.test.ts" --exclude="*.test.tsx" --exclude="*.stories.tsx" \
    --exclude-dir="__tests__" \
    -oE 'process\.env\.[A-Z_]+' "$SRC_DIR" \
  | sed 's/process\.env\.//' \
  | sort -u | grep -v '^NODE_ENV$' | grep -v '^SKIP_ENV_VALIDATION$')

for DEPLOY_FILE in "${DEPLOY_FILES[@]}"; do
  echo "=== Validating ${DEPLOY_FILE} ==="

  # Heredoc lines look like: echo "NAME=${REFVAR}"
  # Left-hand names: extract NAME (part between opening " and =)
  HEREDOC_NAMES=$(grep -F 'echo "' "$DEPLOY_FILE" \
    | sed 's/.*echo "//; s/=.*//' \
    | grep -E '^[A-Z_]+$' \
    | sort -u)

  # Right-hand refs: extract REFVAR (part between ${ and })
  # s/.*=[$]{// removes everything up to and including =${
  # s/[}"].*// removes from } or " onwards
  HEREDOC_REFS=$(grep -F 'echo "' "$DEPLOY_FILE" \
    | sed 's/.*=[$]{//; s/[}"].*//' \
    | grep -E '^[A-Z_]+$' \
    | sort -u)

  # Keys in env: block — lines like "  KEY: ${{ secrets.X }}"
  ENV_BLOCK_KEYS=$(grep -F ': ${{' "$DEPLOY_FILE" \
    | sed 's/^[[:space:]]*//; s/:.*//' \
    | grep -E '^[A-Z_]+$' \
    | sort -u)

  # Vars in the envs: list (union of every envs: line in the file)
  ENVS_LIST=$(grep -F 'envs:' "$DEPLOY_FILE" \
    | sed 's/.*envs:[[:space:]]*//' \
    | tr ',' '\n' \
    | grep -E '^[A-Z_]+$' \
    | sort -u)

  echo "--- Rule 1: process.env vars in src/ must be in .env heredoc ---"
  while IFS= read -r var; do
    [ -z "$var" ] && continue
    echo "$HEREDOC_NAMES" | grep -qx "$var" \
      || fail "[$DEPLOY_FILE] process.env.$var used in src/ but NOT written to .env"
  done <<< "$SRC_VARS"

  echo "--- Rule 2: heredoc \${REFVAR}s must be in env: block ---"
  while IFS= read -r var; do
    [ -z "$var" ] && continue
    echo "$ENV_BLOCK_KEYS" | grep -qx "$var" \
      || fail "[$DEPLOY_FILE] \${$var} referenced in heredoc but NOT in env: block"
  done <<< "$HEREDOC_REFS"

  echo "--- Rule 3: heredoc \${REFVAR}s must be in envs: list ---"
  while IFS= read -r var; do
    [ -z "$var" ] && continue
    echo "$ENVS_LIST" | grep -qx "$var" \
      || fail "[$DEPLOY_FILE] \${$var} referenced in heredoc but NOT in envs: list"
  done <<< "$HEREDOC_REFS"
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "FAILED: $ERRORS env sync error(s). See above." >&2
  exit 1
fi

echo "All env sync checks passed."
