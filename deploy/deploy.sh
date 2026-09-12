#!/usr/bin/env bash
#
# Redeploy AlgaCarbon if origin/main has moved.
#
# Poll-based rather than a GitHub Actions push: no deploy key on the box, no
# secret in the repo, and nothing to break when a token scope changes. The
# trade-off is up to one poll interval of latency, which for a hackathon is
# irrelevant.
#
# Safe to run repeatedly — it exits immediately when there is nothing new.
#
#   ./deploy/deploy.sh          normal, skips when unchanged
#   ./deploy/deploy.sh --force  rebuild even if HEAD is unchanged
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
LOG="$ROOT/deploy/last-deploy.log"
# The last commit that deployed AND passed health. Comparing against HEAD was a
# trap: a failed deploy has already reset HEAD, so every later poll saw
# "unchanged" and never retried.
DEPLOYED="$ROOT/deploy/.deployed-sha"

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 22 >/dev/null 2>&1 || true

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

git fetch --quiet origin main
LOCAL=$(cat "$DEPLOYED" 2>/dev/null || git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi

: > "$LOG"
log "deploying ${LOCAL:0:7} -> ${REMOTE:0:7}"

git reset --hard origin/main --quiet
log "npm install"
npm install --no-audit --no-fund >>"$LOG" 2>&1

# Rust only when the crate actually changed — it is the slowest step by far.
if ! git diff --quiet "$LOCAL" "$REMOTE" -- packages/physics/src packages/physics/Cargo.toml 2>/dev/null; then
  log "physics changed, rebuilding wasm"
  npm run physics:build >>"$LOG" 2>&1
fi

# The schema is idempotent by design, so applying it every deploy is safe and
# picks up additive migrations without a separate migration runner.
set -a; . ./.env; set +a
log "applying schema"
npm run db:setup >>"$LOG" 2>&1

log "building web"
NODE_OPTIONS=--max-old-space-size=1536 npm run build --workspace=apps/web >>"$LOG" 2>&1

log "restarting"
pm2 restart algacarbon-api algacarbon-web --update-env >>"$LOG" 2>&1

sleep 4
if curl -sf --max-time 10 "http://127.0.0.1:${API_PORT:-4300}/health" >/dev/null; then
  echo "$REMOTE" > "$DEPLOYED"
  log "deployed ${REMOTE:0:7} — health OK"
else
  # Loud, because a silent failed deploy is worse than no deploy.
  log "DEPLOYED BUT HEALTH CHECK FAILED — check: pm2 logs algacarbon-api"
  exit 1
fi
