#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[scoop] Installing backend dependencies"
npm ci --prefix backend

echo "[scoop] Installing frontend dependencies"
npm ci --prefix frontend

echo "[scoop] Building frontend"
npm run build --prefix frontend

echo "[scoop] Build complete"
