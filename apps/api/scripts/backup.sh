#!/usr/bin/env bash
#
# ZIBBY backup (Phase 8.3) — vault → git (local commit, NO push); data/ → rsync.
#
# Law 3: this NEVER pushes anywhere. The vault is committed to a LOCAL git repo; the
# runtime data dirs are rsynced to a LOCAL / mounted target with 7 rotating
# day-of-week subdirs. Offsite is the operator's explicit choice (add a private git
# remote and push it yourself, or point ZIBBY_BACKUP_DIR at a mounted volume).
#
# Idempotent and no-op safe: a clean vault commits nothing, a missing data dir is
# skipped, and it exits 0 on "nothing to back up".
#
# Env:
#   ZIBBY_DATA_DIR        data root (default: <repo>/apps/api/data)
#   VAULT_DIR             vault to git-commit (default: $ZIBBY_DATA_DIR/vault)
#   ZIBBY_BACKUP_DIR      rsync destination root (REQUIRED for the data rsync)
#   BACKUP_DATE           override the backup date (YYYY-MM-DD; for tests)
# Flags:
#   --include-credentials  also rsync the credentials dir (excluded by default)
set -euo pipefail

INCLUDE_CREDENTIALS=0
for arg in "$@"; do
  case "$arg" in
    --include-credentials) INCLUDE_CREDENTIALS=1 ;;
    *) echo "backup.sh: unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Resolve the data root relative to this script (…/apps/api/scripts/backup.sh).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DATA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/data"
DATA_DIR="${ZIBBY_DATA_DIR:-$DEFAULT_DATA_DIR}"
VAULT_DIR="${VAULT_DIR:-$DATA_DIR/vault}"
DAY_OF_WEEK="$(date +%u)" # 1..7 (Mon..Sun)

log() { echo "[backup $(date '+%H:%M:%S')] $*"; }

# ---- 1. Vault → git (local commit, no remote, no push) ----------------------------
if [ -d "$VAULT_DIR" ]; then
  if [ ! -d "$VAULT_DIR/.git" ]; then
    log "initializing git repo in vault: $VAULT_DIR"
    git -C "$VAULT_DIR" init -q
  fi
  git -C "$VAULT_DIR" add -A
  if git -C "$VAULT_DIR" diff --cached --quiet; then
    log "vault: nothing to commit"
  else
    git -C "$VAULT_DIR" commit -q -m "vault backup ${BACKUP_DATE:-$(date +%F)}"
    log "vault: committed"
  fi
else
  log "vault dir not found, skipping vault backup: $VAULT_DIR"
fi

# ---- 2. data/ → rsync (rotating day-of-week subdir) -------------------------------
if [ -n "${ZIBBY_BACKUP_DIR:-}" ]; then
  DEST="$ZIBBY_BACKUP_DIR/$DAY_OF_WEEK"
  mkdir -p "$DEST"
  # Runtime dirs worth backing up. credentials is OPT-IN (secrets).
  DIRS=(runs approvals tasks channels activity budget-ledger integrations projects vault automations agents skills)
  if [ "$INCLUDE_CREDENTIALS" -eq 1 ]; then DIRS+=(credentials); fi
  for d in "${DIRS[@]}"; do
    src="$DATA_DIR/$d"
    [ -e "$src" ] || continue
    rsync -a --delete "$src" "$DEST/"
    log "rsynced $d → $DEST/"
  done
  # The committed global config files travel too.
  for f in budget.json mandate.json POLICY.md; do
    [ -e "$DATA_DIR/$f" ] && rsync -a "$DATA_DIR/$f" "$DEST/"
  done
  log "data backup complete → $DEST"
else
  log "ZIBBY_BACKUP_DIR unset — skipping data rsync (vault commit still ran)"
fi

log "done"
exit 0
