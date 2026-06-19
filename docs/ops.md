# ZIBBY — operations runbook (Phase 8.3)

How to run ZIBBY as a durable, self-hosted service on the operator's macOS machine,
so two seeded engagements can progress overnight on a machine that rebooted once and
the morning briefing still accounts for everything.

> **The API is the butler.** The UI being down must never stop runs. Run the API
> under launchd (below); the web app is optional and has its own plist if you want it.

---

## Components

| Process | What | How |
| --- | --- | --- |
| **API** | The butler — runs, scheduler, channels, briefing | `pnpm api:start` (`ts-node src/main.ts`), launchd `com.zibby.api` |
| Web (optional) | The dashboard view | `pnpm web:build` → `pnpm web:start`, optional own plist |
| Backup | Vault git commit + data rsync | `apps/api/scripts/backup.sh`, launchd `com.zibby.backup` |

There is **no build step** for the API — it runs from source via `ts-node`.

---

## One-time install (launchd)

1. **Edit the plists** — `ops/com.zibby.api.plist` and `ops/com.zibby.backup.plist`
   have machine-specific values marked `⟨…⟩`: the absolute repo root, the absolute
   `pnpm` path (`which pnpm`), a `PATH` that includes the `claude` binary dir, and the
   log/backup destinations. Copy them in:

   ```sh
   mkdir -p ~/Library/LaunchAgents ~/Library/Logs/zibby
   cp ops/com.zibby.api.plist    ~/Library/LaunchAgents/
   cp ops/com.zibby.backup.plist ~/Library/LaunchAgents/
   ```

2. **Load them:**

   ```sh
   launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.api.plist
   launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.zibby.backup.plist
   ```

3. **Health check:**

   ```sh
   curl -fsS http://localhost:3333/api/health && echo " OK"
   ```

**Uninstall:** `launchctl bootout gui/$UID/com.zibby.api` (and `…/com.zibby.backup`).

**Restart after a code pull:**

```sh
git pull && pnpm install
launchctl kickstart -k gui/$UID/com.zibby.api
```

`KeepAlive` restarts the API on crash. Crash-restart reconciliation makes that safe:
`RunnerCore.init` rebuilds the run registry from the on-disk sidecars (written
atomically — a torn sidecar would otherwise break this), the `RunRecorder` sweep
records any run that finished while down, and the task scheduler's bootstrap drains
the concurrency queues and re-arms held tasks behind their approvals. launchd never
double-starts a label, which is also the **one-instance-per-data-root** guarantee —
`withPathLock` only serializes within a single process (see _Caveats_).

---

## Environment variables

Set in the plist's `EnvironmentVariables` (or a `.env` the API loads).

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3333` | API listen port (Phase 8.3 default; the plist sets it explicitly) |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `ZIBBY_DATA_DIR` | `apps/api/data` | Single data-root switch — repoints every store at once |
| `VAULT_DIR` | `$ZIBBY_DATA_DIR/vault` | Obsidian vault (second brain) |
| `BUDGET_LEDGER_DIR` | `$ZIBBY_DATA_DIR/budget-ledger` | Dispatch ledger (enforcement; gitignored) |
| `BUDGET_CONFIG_FILE` | `$ZIBBY_DATA_DIR/budget.json` | Operator global pause thresholds (committed) |
| `SYSTEM_CONFIG_FILE` | `$ZIBBY_DATA_DIR/system-config.json` | Runtime system config (tick intervals, channel adapter mode, goal auto-resume) — file-backed, editable from `/settings`. Path knob only; see `docs/ops/environment.md` |
| `CLAUDE_BIN` | `claude` on `PATH` | Claude CLI; point at `fake-claude.mjs` for token-free runs |
| `ZIBBY_BACKUP_DIR` | _(unset)_ | rsync destination root for `backup.sh` |

The `PATH` in the plist **must** include the dir holding `claude` — agent and
pipeline runs shell out to it.

---

## Budgets & caps

Per-engagement budgets live on the project record (`PATCH /projects/:id`, or the
project editor in the dashboard): `dailyRuns` / `weeklyRuns` (run-count caps per
Europe/Prague window) and `maxConcurrent`. Over a cap, a new task is **held** behind a
Tier-3 `spend-past-cap` approval (Law 3: no autonomous spend past budget); at
`maxConcurrent` it is **queued** (no approval) and drains when a run of that project
finishes. The global account ceiling (`data/budget.json` → `pauseAtRollingPct` /
`pauseAtWeeklyPct`) holds **every** dispatch once account utilization crosses it.

**If everything is suddenly held**, the budget guard is failing closed (decision: an
unreadable ledger or limits snapshot ⇒ hold, never auto-spend). **Check disk** — the
ledger dir (`budget-ledger/`) must be writable and `data/budget.json` readable. Each
held task carries its own approval; rejecting them clears the queue.

---

## Backups

`apps/api/scripts/backup.sh` (driven by `com.zibby.backup`, daily 03:30):

- **Vault → git**: `git add -A && git commit` in the vault dir. **No remote, no push**
  (Law 3). Want offsite? Add a private remote yourself and push it on your own cadence.
- **data/ → rsync**: `rsync -a --delete` of the runtime dirs into
  `$ZIBBY_BACKUP_DIR/<1..7>` (rotating day-of-week). **Credentials are excluded by
  default**; pass `--include-credentials` to opt in (secrets — only to an encrypted /
  trusted target). Idempotent and no-op safe (exits 0 on nothing to do).

Verify manually: `ZIBBY_BACKUP_DIR=/tmp/zb bash apps/api/scripts/backup.sh`, then
inspect `/tmp/zb/<day>/`. The exec-level test is `apps/api/test/backup.test.ts`.

---

## Log rotation

API logs go to `~/Library/Logs/zibby/api.{out,err}.log` (set in the plist). Rotate
with `ops/zibby.newsyslog.conf`:

```sh
# edit the absolute paths, then:
sudo cp ops/zibby.newsyslog.conf /etc/newsyslog.d/zibby.conf
```

**Held-fd caveat (Darwin 27):** the API is a launchd process that does not reopen its
log on `SIGHUP`, so a `newsyslog` rotation renames the file but the live process keeps
writing to the old inode until its next restart. The config uses flag `N` (no signal)
and a 10 MB size cap; the rotated file only starts filling again after
`launchctl kickstart -k gui/$UID/com.zibby.api`. KeepAlive + the nightly cadence make
this acceptable. Backup logs are written by a short-lived job and rotate cleanly.

---

## Caveats

- **One instance per data root.** `withPathLock` serializes read-modify-write only
  *within* one API process; two API processes on the same `ZIBBY_DATA_DIR` would race
  the vault MOCs and ledger. The launchd `KeepAlive` label guarantees a single
  instance — do not also run `pnpm api:dev` against the live data root.
- **Backups never push** anywhere (Law 3). Offsite is your explicit, manual step.
- **The gate cannot be talked around.** Inbound channel content is data, never
  commands; a crafted message that names a project gains only a grouping label, never
  a privilege.

---

## CI — Playwright on a self-hosted runner

`.github/workflows/e2e.yml` has a `playwright-selfhosted` job (`runs-on:
[self-hosted, macOS, zibby]`) that runs on **push to `main` only** — never on
`pull_request` (self-hosted + untrusted fork PRs is a foot-gun, and it costs nothing
to guard a single-operator repo). Register this machine as a runner:

```sh
# GitHub → repo Settings → Actions → Runners → New self-hosted runner (macOS)
# Use labels: self-hosted, macOS, zibby
```

The suite is token-free: `playwright.config.ts` boots both servers with isolated
`.e2e-data` dirs and demo knobs (`AGENT_DEMO_STEPS=3`, `CHANNEL_ADAPTER_MODE=fake`).
Prove it locally first with `CLAUDE_BIN` unset; if a spec truly needs the binary,
point `CLAUDE_BIN` at `e2e/fake-claude.mjs` in the config's `apiEnv`. Keep the runner
user's environment free of real credentials (the suite sets its own isolated dirs;
verify `CLAUDE_CONFIG_DIR` doesn't leak the operator's real rate-limits/keychain into
the API under test). The ubuntu `workflow_dispatch` job stays as the manual fallback.
Promotion to a required check stays deferred until it's been green for a while.

---

## The "rebooted once" rehearsal (manual)

The Phase 8 exit proof, run by hand:

1. Seed two fixture projects with budgets — project A `dailyRuns: 2`,
   `maxConcurrent: 1`.
2. Queue four tasks across A and B, plus a fake-channel bug report naming project B.
3. Run the API under launchd; `kill -9` it once mid-evening — `KeepAlive` restarts it.
4. In the morning, confirm: both engagements progressed; A's overflow is a **held**
   task behind a `spend-past-cap` approval; the briefing **groups by engagement** and
   every line traces end to end (activity JSONL → ledger line → run dir → vault note);
   and the logs rotated/landed under `~/Library/Logs/zibby/`.
