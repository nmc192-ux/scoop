#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env.production"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-4000}"

cd "$ROOT_DIR/backend"
exec node server.js
