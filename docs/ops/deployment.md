# Deployment

How to run ZIBBY as a durable, self-hosted service on the operator's macOS machine,
so two seeded engagements can progress overnight on a machine that rebooted once and
the morning briefing still accounts for everything.

> **The API is the butler.** The UI being down must never stop runs. Run the API
> under launchd (below); the web app is optional and has its own build/start step if
> you want it served too.

## Components

| Process        | What                                             | How                                                                |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| **API**        | The butler — runs, scheduler, channels, briefing | `pnpm api:start` (`ts-node src/main.ts`), launchd `com.zibby.api`   |
| Web (optional) | The dashboard view                               | `pnpm web:build` → `pnpm web:start`, optional own plist             |
| Backup         | Vault git commit + data rsync                    | `apps/api/scripts/backup.sh`, launchd `com.zibby.backup`            |

There is **no build step** for the API — `pnpm api:start` runs `pnpm --filter
@zibby/api serve`, which is `ts-node -P tsconfig.json src/main.ts`: the compiled
server runs straight from source, no `tsc`/`esbuild` artifact in between.

## launchd — API service (macOS)

**File:** `ops/com.zibby.api.plist`

The API runs as a macOS launchd daemon — automatic start at login, automatic
restart on crash.

### Install

1. Edit the plist and fill in the machine-specific values (marked `⟨…⟩`): the
   absolute repo root, the absolute `pnpm` path (`which pnpm`), and a `PATH` that
   includes the dir holding the `claude` binary (agent and pipeline runs shell out
   to it) plus node/pnpm:

   ```xml
   <key>ProgramArguments</key>
   <array>
     <string>⟨/opt/homebrew/bin/pnpm⟩</string>  <!-- which pnpm -->
     <string>api:start</string>
   </array>
   <key>WorkingDirectory</key>
   <string>⟨/Users/you/Workspace/z.i.b.b.y⟩</string>
   <key>PATH</key>
   <string>⟨/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin⟩</string>
   ```

2. Copy into `LaunchAgents`:

   ```bash
   mkdir -p ~/Library/LaunchAgents ~/Library/Logs/zibby
   cp ops/com.zibby.api.plist ~/Library/LaunchAgents/
   ```

3. Bootstrap (load and start):

   ```bash
   launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.api.plist
   ```

4. Health check:

   ```bash
   curl -fsS http://localhost:3333/api/health && echo " OK"
   ```

### Managing the service

```bash
# Restart
launchctl kickstart -k gui/$UID/com.zibby.api

# Stop
launchctl bootout gui/$UID/com.zibby.api

# Status
launchctl list com.zibby.api

# Reinstall (after editing the plist)
launchctl bootout gui/$UID/com.zibby.api
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.api.plist
```

**Restart after a code pull:**

```bash
git pull && pnpm install
launchctl kickstart -k gui/$UID/com.zibby.api
```

### Plist keys

| Key                   | Value                    | Meaning                                                     |
| --------------------- | ------------------------ | ------------------------------------------------------------ |
| `RunAtLoad`           | `true`                   | Starts automatically once bootstrapped                      |
| `KeepAlive`           | `true`                   | Restarts on crash                                            |
| `ThrottleInterval`    | `10`                     | 10s backoff between restarts                                 |
| `PORT`                | `3333`                   | API port                                                     |
| `LOG_LEVEL`           | `info`                   | Log level                                                    |
| `CORS_ORIGIN`         | `http://localhost:3000`  | Allowed origin                                               |
| `ZIBBY_WORKTREE_ROOT` | `⟨~/.zibby/worktrees⟩`  | **Phase 12.7** — run worktrees outside the repo/data tree    |

`GOAL_AUTO_RESUME` is **not** a plist environment key anymore — see the next
section.

### Goal auto-resume — the unattended builder (Phase 13.3)

Unattended-builder resume is no longer an env var: it is the file-backed
`goalAutoResume` knob in the runtime system config (`data/system-config.json`,
editable from `/settings` — see `docs/ops/environment.md`). Installing this daemon
**is** the operator's explicit opt-in to unattended operation, so turning
`goalAutoResume` on there is legitimate (the one place auto-resume belongs — Phase
12.4 otherwise gates it behind Tier 3). Restart semantics (`reconstruct()`):

| `goalAutoResume`       | Behavior after restart                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `true` (daemon)        | Rehydrates the registry **and** re-drives `running`/`paused-limit` goals (continuation, not a restart — Phase 9.3/12.4) |
| `false` (attended dev) | Rehydrates the registry, but parks live goals `awaiting-resume` — waits for the operator (Law 3)             |

**Self-development:** if this daemon is meant to drive the loop against **its own**
repo, follow [`self-development.md`](./self-development.md) — builder ≠ subject
(the subject is a fresh sibling checkout registered as a project; worktrees live
under `ZIBBY_WORKTREE_ROOT`, outside the builder's own tree). The daemon runs via
`api:start` (`serve` = `ts-node` without `--respawn`), so the edit-respawn loop that
would otherwise reboot the builder mid-edit does not apply.

### Logs

```
~/Library/Logs/zibby/api.out.log   # stdout
~/Library/Logs/zibby/api.err.log   # stderr
```

Rotated per `ops/zibby.newsyslog.conf` (see _Log rotation_ below).

## Backup service

**File:** `ops/com.zibby.backup.plist`

Runs `apps/api/scripts/backup.sh` (driven by `com.zibby.backup`) daily at 03:30.

### Backup script (`apps/api/scripts/backup.sh`)

**System dependency:** `rsync` must be installed when `ZIBBY_BACKUP_DIR` is set
(ships with macOS; on Linux install via the distro package manager). The script
preflight-checks for it at the very top, before step 1 runs, and exits 1 with a
clear message if it's missing — instead of aborting mid-backup with a raw `set -e`
exit 127 after the vault commit already happened (phase 20.2).

1. **Vault → git**: `git add -A && git commit` in the vault dir. **No remote, no
   push** (Law 3). Want offsite? Add a private remote yourself and push it on your
   own cadence.
2. **data/ → rsync**: `rsync -a --delete` of the runtime dirs into
   `$ZIBBY_BACKUP_DIR/<1..7>` (rotating day-of-week). **Credentials are excluded by
   default**; pass `--include-credentials` to opt in (secrets — only to an
   encrypted / trusted target; see
   [`docs/ops/security-posture.md`](security-posture.md) for the at-rest-plaintext
   tradeoff this implies).
3. Idempotent and no-op safe: a clean vault commits nothing, a missing data dir is
   skipped, and it exits 0 on "nothing to back up".

### Rsync strategy

Rotation across 7 subdirectories named by day-of-week number (`1`..`7`, Mon..Sun) —
each holds a complete snapshot:

```bash
rsync -a --delete \
  --exclude=credentials/ \    # default protection
  $ZIBBY_DATA_DIR/ \
  $ZIBBY_BACKUP_DIR/<day>/
```

Verify manually: `ZIBBY_BACKUP_DIR=/tmp/zb bash apps/api/scripts/backup.sh`, then
inspect `/tmp/zb/<day>/`. The exec-level test is `apps/api/test/backup.test.ts`.

### Install the backup service

```bash
cp ops/com.zibby.backup.plist ~/Library/LaunchAgents/
# Fill in the machine-specific values (WorkingDirectory, ProgramArguments, ZIBBY_BACKUP_DIR)
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.backup.plist
```

## Log rotation (newsyslog)

**File:** `ops/zibby.newsyslog.conf`

```bash
# Install
sudo cp ops/zibby.newsyslog.conf /etc/newsyslog.d/zibby.conf
```

Rotates:

- `~/Library/Logs/zibby/api.out.log`
- `~/Library/Logs/zibby/api.err.log`
- `~/Library/Logs/zibby/backup.out.log`
- `~/Library/Logs/zibby/backup.err.log`

**Held-fd caveat (Darwin 27):** the API is a launchd process that does not reopen
its log on `SIGHUP`, so a `newsyslog` rotation renames the file but the live process
keeps writing to the old inode until its next restart. The config uses flag `N` (no
signal) and a 10 MB size cap; the rotated file only starts filling again after
`launchctl kickstart -k gui/$UID/com.zibby.api`. `KeepAlive` plus the nightly
cadence make this acceptable. Backup logs are written by a short-lived job and
rotate cleanly — no caveat there.

## Building for other components

The API has no build artifact (see _Components_ above). The web app does:

```bash
pnpm web:build   # Next.js production build
pnpm web:start   # run the production build
```

## One instance per data root

`withPathLock` (in `data-dir.ts`) is an **in-process** lock only — it serializes
read-modify-write within a single API process, but two API processes on the same
`ZIBBY_DATA_DIR` would still race the vault MOCs and the ledger. launchd guarantees
a single instance per `Label` at the system level — label `com.zibby.api` can only
run once. Do not also run `pnpm api:dev` against the live data root while the
daemon is up.

## Crash-safety

Restarting the API is safe thanks to reconciliation on boot:

- `RunnerCore.init()` — orphaned `running` runs are rebuilt from the on-disk
  sidecars (written atomically, so a torn sidecar can't break this) and reconciled
  to `interrupted`.
- `RunRecorderModule` — re-audits the vault after a restart, recording any run that
  finished while the API was down.
- `TaskSchedulerService` bootstrap drain — drains the concurrency queues and
  re-arms held tasks behind their approvals.

No data loss across a restart — everything lives on disk (sidecar JSON, JSONL
activity, vault markdown).

## CI — Playwright on a self-hosted runner

`.github/workflows/e2e.yml` has a `playwright-selfhosted` job (`runs-on:
[self-hosted, macOS, zibby]`) that runs on **push to `main` only** — never on
`pull_request` (self-hosted + untrusted fork PRs is a foot-gun, and it costs
nothing to guard a single-operator repo). Register this machine as a runner:

```sh
# GitHub → repo Settings → Actions → Runners → New self-hosted runner (macOS)
# Use labels: self-hosted, macOS, zibby
```

The suite is token-free: `playwright.config.ts` boots both servers with isolated
`.e2e-data` dirs and demo knobs (`AGENT_DEMO_STEPS=3`, `CHANNEL_FAKE_DIR` set → fake
channel adapter). Prove it locally first with `CLAUDE_BIN` unset; if a spec truly
needs the binary, point `CLAUDE_BIN` at `e2e/fake-claude.mjs` in the config's
`apiEnv`. Keep the runner user's environment free of real credentials (the suite
sets its own isolated dirs; verify `CLAUDE_CONFIG_DIR` doesn't leak the operator's
real rate-limits/keychain into the API under test). The ubuntu `workflow_dispatch`
job stays as the manual fallback. Promotion to a required check stays deferred
until it's been green for a while.

## The "rebooted once" rehearsal (manual)

The Phase 8 exit proof, run by hand:

1. Seed two fixture projects with budgets — project A `dailyRuns: 2`,
   `maxConcurrent: 1`.
2. Queue four tasks across A and B, plus a fake-channel bug report naming project B.
3. Run the API under launchd; `kill -9` it once mid-evening — `KeepAlive` restarts
   it.
4. In the morning, confirm: both engagements progressed; A's overflow is a **held**
   task behind a `spend-past-cap` approval; the briefing **groups by engagement**
   and every line traces end to end (activity JSONL → ledger line → run dir → vault
   note); and the logs rotated/landed under `~/Library/Logs/zibby/`.
