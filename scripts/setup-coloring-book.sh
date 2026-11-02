#!/usr/bin/env bash
# Installs the local tooling the coloring-book factory needs: uv + mflux (local images).
# Idempotent. Run by hand (`pnpm setup:coloring-book`) or as `--auto` from postinstall.
# Docs: docs/ops/product-factory.md
set -uo pipefail

AUTO=0
[[ "${1:-}" == "--auto" ]] && AUTO=1

say() { echo "[coloring-book setup] $*"; }

# postinstall must never break `pnpm install`: skip quietly where the local stack cannot run.
if [[ $AUTO == 1 ]]; then
  if [[ -n "${CI:-}" || -n "${ZIBBY_SKIP_LOCAL_AI:-}" ]]; then exit 0; fi
  if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
    say "not Apple Silicon: skipping (use PF_IMAGE_PROVIDER=openai with OPENAI_API_KEY)"
    exit 0
  fi
  trap 'exit 0' ERR EXIT
fi

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  say "mflux needs Apple Silicon macOS. Use PF_IMAGE_PROVIDER=openai (OPENAI_API_KEY) instead."
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

say "done. FLUX.2 klein weights (several GB) download on the first image run."
pnpm exec product-factory doctor || true
