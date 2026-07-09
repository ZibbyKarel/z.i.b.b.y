#!/usr/bin/env bash
#
# check-deps.sh — verifies the external CLI tools this repo needs are
# installed (and, where it matters, authenticated), and prints the exact
# command to fix anything missing. Read-only — never installs anything itself.
#
# Usage: ./scripts/check-deps.sh   (or: pnpm check:deps)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NVMRC_NODE_MAJOR="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc" 2>/dev/null)"
OS="$(uname -s)"

REQUIRED_MISSING=0
OPTIONAL_MISSING=0

GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[0;33m'; RESET=$'\033[0m'

ok()   { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
bad()  { printf "  ${RED}✗${RESET} %s\n" "$1"; }
warn() { printf "  ${YELLOW}⚠${RESET} %s\n" "$1"; }
fix()  { printf "      ${YELLOW}→${RESET} %s\n" "$1"; }

echo "z.i.b.b.y — dependency check"
echo "============================"
echo
echo "Required:"

# --- Node.js -------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v)"
  NODE_MAJOR="$(echo "$NODE_VER" | sed 's/^v//' | cut -d. -f1)"
  if [ -n "$NVMRC_NODE_MAJOR" ] && [ "$NODE_MAJOR" -lt "$NVMRC_NODE_MAJOR" ] 2>/dev/null; then
    warn "node $NODE_VER found, but .nvmrc pins $NVMRC_NODE_MAJOR+"
    fix "nvm install $NVMRC_NODE_MAJOR && nvm use"
  else
    ok "node $NODE_VER"
  fi
else
  bad "node — not found"
  fix "nvm install ${NVMRC_NODE_MAJOR:-20} && nvm use   (or: https://nodejs.org)"
  REQUIRED_MISSING=$((REQUIRED_MISSING + 1))
fi

# --- pnpm ------------------------------------------------------------------
if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm -v)"
else
  bad "pnpm — not found"
  fix "corepack enable   (ships with Node 20+; or: npm i -g pnpm — see https://pnpm.io/installation)"
  REQUIRED_MISSING=$((REQUIRED_MISSING + 1))
fi

# --- git ---------------------------------------------------------------
if command -v git >/dev/null 2>&1; then
  ok "$(git --version)"
else
  bad "git — not found"
  case "$OS" in
    Darwin) fix "brew install git   (or: xcode-select --install)" ;;
    Linux)  fix "sudo apt-get install git   (Debian/Ubuntu; see https://git-scm.com/downloads for other distros)" ;;
    *)      fix "https://git-scm.com/downloads" ;;
  esac
  REQUIRED_MISSING=$((REQUIRED_MISSING + 1))
fi

# --- claude CLI (Claude Code) --------------------------------------------
if command -v claude >/dev/null 2>&1; then
  if claude auth status >/dev/null 2>&1; then
    ok "claude $(claude --version 2>/dev/null | head -1) — authenticated"
  else
    bad "claude CLI installed but not logged in — ZIBBY's own preflight will refuse every run (503)"
    fix "claude auth login   (or set ANTHROPIC_API_KEY)"
    REQUIRED_MISSING=$((REQUIRED_MISSING + 1))
  fi
else
  bad "claude CLI — not found (ZIBBY has no agent runtime without it — nothing will run)"
  fix "npm install -g @anthropic-ai/claude-code && claude auth login   (see https://claude.com/claude-code)"
  REQUIRED_MISSING=$((REQUIRED_MISSING + 1))
fi

echo
echo "Optional (degrade gracefully — feature-specific):"

# --- gh (GitHub CLI) -----------------------------------------------------
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    ok "$(gh --version | head -1) — authenticated"
  else
    warn "$(gh --version | head -1) — not logged in (top-bar open-PR panel will show none)"
    fix "gh auth login"
    OPTIONAL_MISSING=$((OPTIONAL_MISSING + 1))
  fi
else
  warn "gh (GitHub CLI) — not found (top-bar open-PR panel silently reports none)"
  case "$OS" in
    Darwin) fix "brew install gh && gh auth login" ;;
    Linux)  fix "see https://cli.github.com/manual/installation ; then gh auth login" ;;
    *)      fix "https://cli.github.com/manual/installation" ;;
  esac
  OPTIONAL_MISSING=$((OPTIONAL_MISSING + 1))
fi

# --- Playwright chromium (e2e only) --------------------------------------
PW_CACHE="$HOME/Library/Caches/ms-playwright"
[ "$OS" = "Linux" ] && PW_CACHE="$HOME/.cache/ms-playwright"
if ls "$PW_CACHE"/chromium-* >/dev/null 2>&1; then
  ok "playwright chromium browser installed"
else
  warn "playwright chromium browser — not installed (needed for: pnpm e2e)"
  fix "pnpm exec playwright install chromium"
  OPTIONAL_MISSING=$((OPTIONAL_MISSING + 1))
fi

echo
if [ "$REQUIRED_MISSING" -gt 0 ]; then
  echo "✗ $REQUIRED_MISSING required dependency(ies) missing — install the above, then re-run this script."
  exit 1
elif [ "$OPTIONAL_MISSING" -gt 0 ]; then
  echo "✓ All required dependencies OK. $OPTIONAL_MISSING optional dependency(ies) missing — matching features degrade gracefully."
  exit 0
else
  echo "✓ All dependencies installed."
  exit 0
fi
