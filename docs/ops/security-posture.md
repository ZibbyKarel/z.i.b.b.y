# Security posture — accepted risks

**Phase 20.** Three risks the system-audit surfaced and a decision was made to
**accept, not fix**, for the current single-operator self-hosted deployment. Each
entry says why it's acceptable today and what would make it not acceptable — revisit
when that condition starts to hold, not on a schedule.

For the runtime dependency vulnerabilities that WERE patched this phase (nodemailer,
multer), see the phase 20.1 commit and `pnpm audit`. This document only covers risks
that were deliberately left in place.

---

## 1. Credentials at rest as plaintext JSON

**What:** `CredentialsStore` (`apps/api/src/integrations/credentials.store.ts`) and
`McpCredentialsStore` (`apps/api/src/mcp/mcp-credentials.store.ts`) persist
integration/MCP secrets (tokens, passwords) as unencrypted JSON files under
`ZIBBY_DATA_DIR/credentials` and `ZIBBY_DATA_DIR/mcp-credentials`.

**Why it's contained today:**

- Both directories are **gitignored** (`.gitignore`: `.zibby/data/credentials`,
  `.zibby/data/mcp-credentials`) — they never enter version control.
- The HTTP API never returns secret values, only a `hasCredentials: boolean` —
  the plaintext never crosses the network boundary to the web client.
- `apps/api/scripts/backup.sh` excludes `credentials/` from the rsync set **by
  default**; an operator must pass `--include-credentials` explicitly to copy it,
  and that copy is still plaintext at the destination.
- The deployment model is one operator, one machine (or a small mounted-volume
  backup target they control) — there is no multi-tenant boundary for the plaintext
  to leak across.

**What it means operationally:** anyone with filesystem read access to
`ZIBBY_DATA_DIR` (or a `--include-credentials` backup destination) has the secrets in
the clear. Protect that with normal OS file permissions and physical/disk security —
this is not a substitute for those.

**Revisit when:**

- ZIBBY grows a multi-tenant or multi-operator mode (a filesystem boundary is no
  longer the security boundary).
- Backups start syncing to a remote / cloud target (`ZIBBY_BACKUP_DIR` pointed at
  anything not physically controlled by the operator) — at that point encrypt
  `credentials/` at rest with a key sourced from the OS keychain
  (Keychain on macOS, libsecret on Linux) rather than shipping plaintext off-box.

---

## 2. `vitest` critical vulnerability (dev-only, accepted)

**What:** `pnpm audit` reports one critical finding — when the Vitest UI server is
listening, an arbitrary file can be read and executed. Fixed upstream in Vitest 3;
this repo pins `vitest@^2.1.8`.

**Why it's accepted:** the exposure requires **running `vitest --ui`** (or otherwise
exposing Vitest's dev/API server) on a reachable network interface. This repo's test
scripts (`pnpm test`, `pnpm api:test`, `pnpm web:test`) run `vitest run` — no UI
server, no listening port, CI-safe. The vulnerability has no exposure surface as long
as that stays true.

**Mitigation (the actual control):** never run `vitest --ui` or any Vitest dev/API
server bound to a non-loopback address, in dev or CI. `vitest run` (used everywhere
in this repo) is unaffected.

**Revisit when:** the Vitest 2 → 3 migration happens — that's a deliberate, separate
decision (breaking changes across the whole test suite), not bundled into this
phase. Until then, the mitigation above is the control, not a version bump.

---

## 3. Fail-open approval-hook classifier (accepted contract)

**What:** `apps/api/src/runner/claude-approval-hook.mjs` gates specific Bash/Task
patterns (deletes, `git push`/force-push, `gh pr create`/`merge`, mutating `gh api`
calls, and every `Task` delegation). A Bash command the classifier **does not
recognize** is allowed immediately (exit 0) — the denylist is a best-effort matcher,
not a sandbox. It does not catch a push/merge hidden behind unresolvable `$(…)`
nesting, an aliased binary, or a raw `curl` call to the GitHub API that bypasses `gh`
entirely.

**Why it's an accepted, documented contract — not a bug:** the file's own header
spells this out (`claude-approval-hook.mjs`, "Denylist honesty" section). The real
guarantees are the **locked floor** (Law 1: approval-first is structural) and the
non-interactive run shape, not exhaustive command-pattern coverage. A classifier gap
routes to default-allow (Tier 1, logged), never to a privilege escalation — inbound
content still can't reach the gate directly (Law 4), and every gated action still
requires an explicit RunnerCore-mediated decision when it IS recognized.

**Mitigated in phase 17.1:** mutating `gh api` calls (`-X`/`--method` PUT/POST/PATCH/
DELETE, or a field flag implying an implicit POST body) used to fall through
unclassified (fail-open) and now route to `pr.merge`/`pr.open` or the generic
`gh.api_write` intent, closing the previously-largest gap in the denylist.

**Revisit when:** a new mutating CLI surface is added to agent runs (a new `gh`
subcommand shape, a different git-hosting CLI, direct API calls via `curl`/`http`) —
extend the classifier the same way 17.1 extended it, rather than treating the
denylist as complete.

---

## Related

- `apps/api/scripts/backup.sh` — rsync preflight guard added phase 20.2 (fails fast,
  before the vault git commit, if `ZIBBY_BACKUP_DIR` is set but `rsync` isn't
  installed — no more half-backups from a raw `set -e` abort mid-script).
- `docs/ops/self-development.md` — the companion runbook for the loop engine's
  builder/subject separation; same "accept a documented risk, mitigate the
  realistic exposure" posture.
