#!/usr/bin/env bash
# Installs the local tooling the coloring-book factory needs: uv + mflux (images), Ollama + vision model (QA).
# Idempotent. Run by hand (`pnpm setup:coloring-book`) or as `--auto` from postinstall.
# Docs: docs/ops/product-factory.md
set -uo pipefail

AUTO=0
[[ "${1:-}" == "--auto" ]] && AUTO=1

MODEL="${PF_OLLAMA_MODEL:-qwen3-vl:8b-instruct}"
HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
[[ "$HOST" == http* ]] || HOST="http://$HOST"

say() { echo "[coloring-book setup] $*"; }

# postinstall must never break `pnpm install`: skip quietly where the local stack cannot run.
if [[ $AUTO == 1 ]]; then
  if [[ -n "${CI:-}" || -n "${ZIBBY_SKIP_LOCAL_AI:-}" ]]; then exit 0; fi
  if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    say "not Apple Silicon: skipping (use PF_IMAGE_PROVIDER=fal, PF_VISION_PROVIDER=haiku)"
    exit 0
  fi
  trap 'exit 0' ERR EXIT
fi

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  say "mflux needs Apple Silicon macOS. Use PF_IMAGE_PROVIDER=fal (FAL_KEY) and PF_VISION_PROVIDER=haiku instead."
  exit 1
fi

if ! command -v brew >/dev/null; then
  say "Homebrew missing: https://brew.sh"
  exit 1
fi

command -v uv >/dev/null || { say "installing uv"; brew install uv; }

if uv tool list 2>/dev/null | grep -q '^mflux '; then
  say "mflux already installed"
else
  say "installing mflux"
  uv tool install mflux
fi

command -v ollama >/dev/null || { say "installing ollama"; brew install ollama; }

if ! curl -fsS --max-time 3 "$HOST/api/tags" >/dev/null 2>&1; then
  say "starting ollama service"
  brew services start ollama
  for _ in $(seq 1 20); do
    curl -fsS --max-time 2 "$HOST/api/tags" >/dev/null 2>&1 && break
    sleep 1
  done
fi

if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$MODEL"; then
  say "$MODEL already pulled"
else
  say "pulling $MODEL (~6 GB)"
  ollama pull "$MODEL"
fi

say "done. FLUX.2 klein weights (several GB) download on the first image run."
pnpm exec product-factory doctor || true
