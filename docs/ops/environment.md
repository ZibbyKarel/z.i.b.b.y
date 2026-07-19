# Environment & configuration

## Environment variables (API)

Set in the plist's `EnvironmentVariables` (see `docs/ops/deployment.md`), or in a
`.env` the API loads. Loaded via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal:
true })`).

| Variable                   | Default                              | Purpose                                                                                                                                                             |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | `3333`                               | API listen port                                                                                                                                                     |
| `LOG_LEVEL`                | `info`                               | `debug` / `info` / `warn` / `error`                                                                                                                                 |
| `CORS_ORIGIN`              | `http://localhost:3000`              | Allowed origins (comma-separated for more than one)                                                                                                                 |
| `ZIBBY_DATA_DIR`           | `.zibby/data`                        | Single data-root switch — repoints every store at once                                                                                                              |
| `VAULT_DIR`                | `$ZIBBY_DATA_DIR/vault`              | Obsidian vault (second brain)                                                                                                                                       |
| `BUDGET_LEDGER_DIR`        | `$ZIBBY_DATA_DIR/budget-ledger`      | Dispatch ledger (enforcement; gitignored)                                                                                                                           |
| `BUDGET_CONFIG_FILE`       | `$ZIBBY_DATA_DIR/budget.json`        | Operator global pause thresholds (committed)                                                                                                                        |
| `SYSTEM_CONFIG_FILE`       | `$ZIBBY_DATA_DIR/system-config.json` | Path to the runtime system config file (see below) — a path/test-isolation knob, not a behavioral one                                                               |
| `AGENT_RUNNER_MODE`        | `claude`                             | `claude` = real `claude -p`; `demo` = deterministic stand-in (tests/CI). Belongs in the **untracked** `.env`, not `.env.example` (which sets `demo`)                |
| `CLAUDE_BIN`               | `claude` on `PATH`                   | Path to the `claude` binary — test seam (fake binary in e2e)                                                                                                        |
| `ZIBBY_WORKTREE_ROOT`      | `$TMPDIR/zibby-worktrees`            | **Phase 12.7** — root for run worktrees, **outside** the repo/data tree. Deliberately does not derive from `ZIBBY_DATA_DIR`                                         |
| `ZIBBY_BACKUP_DIR`         | _(unset)_                            | rsync destination root for `backup.sh` (backup script only)                                                                                                         |
| `LOG_JSON`                 | _(unset)_                            | `1`/`true` = structured JSON log lines (`shared/logging/logger.service.ts`); unset = human-readable                                                                 |
| `CLAUDE_CONFIG_DIR`        | `~/.claude`                          | Where the `claude` CLI's own config/usage-limit files live — read by the rate-limits reader (`limits/rate-limits.reader.ts`); a test seam for isolating limit reads |
| `ZIBBY_CHAT_MODEL`         | `sonnet`                             | Model the chat session spawns `claude -p` with (`chat/chat-session.service.ts`)                                                                                     |
| `ZIBBY_API_BASE`           | `http://localhost:$PORT`             | Base URL the chat session's own MCP client calls back into the API on (`chat/chat-session.service.ts`)                                                              |
| `ZIBBY_INTENT_DIR`         | `input.cwd` / `process.cwd()`        | Working dir the approval hook (`runner/claude-approval-hook.mjs`) resolves relative paths against — a test seam                                                     |
| `HEAP_SNAPSHOT_ON_SIGUSR2` | _(unset)_                            | `1` = write a heap snapshot on `SIGUSR2` (`main.ts`), for diagnosing memory growth in the running API process                                                       |

Every entity store built on `EntityFileStore` (agents, pipelines, goals, tasks,
approvals, artifacts, channels, integrations, projects, companies, skills,
commands, mcp, hooks, gate-rules, automations, chains, monitors, …) also honors
its own `<NAME>_DIR` (or `_FILE` for singletons) override, following the same
pattern as `VAULT_DIR`/`BUDGET_LEDGER_DIR` above — all default to a subpath
under `ZIBBY_DATA_DIR`. These per-store overrides exist mainly for test
isolation; there's no need to set them individually in normal operation since
`ZIBBY_DATA_DIR` repoints all of them at once. Grep `process.env.*_DIR` /
`process.env.*_FILE` under `apps/api/src/*/**.store.ts` for the exhaustive
current list.

### Speech (`speakd` daemon)

The `speech` module (`docs/api/speech.md`) talks to an external local
text-to-speech daemon over HTTP, not an in-process library:

| Variable            | Default                 | Purpose                                             |
| ------------------- | ----------------------- | --------------------------------------------------- |
| `SPEAKD_URL`        | `http://127.0.0.1:8899` | Base URL of the `speakd` daemon                     |
| `SPEAKD_TIMEOUT_MS` | `30000`                 | Request timeout before `SpeakdTimeoutError`         |
| `SPEAKD_TOKEN`      | _(unset)_               | Bearer token sent to the daemon, if it requires one |

### Test/demo-only variables

Not used in production; seeded by test setup or the demo `AGENT_RUNNER_MODE`
stage script (`pipelines/demo-stage.mjs`) — listed here so a grep hit doesn't
look like an undocumented mystery var:

| Variable                                                                                          | Used by                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHAT_EVAL`                                                                                       | Gates the chat-dispatch eval suite (`chat-dispatch.eval.test.ts`) — skipped unless set                                                                                              |
| `CHANNEL_FAKE_TEST_FAIL`                                                                          | Fake channel adapter — forces a simulated adapter failure                                                                                                                           |
| `MONITOR_POLL_RETRIES`                                                                            | Monitor watcher tests — overrides retry count                                                                                                                                       |
| `ZIBBY_TEST_SECRET`                                                                               | `runner-core.test.ts` — asserts spawned processes inherit the parent env                                                                                                            |
| `AGENT_DEMO_STEPS` / `AGENT_DEMO_DELAY_MS`                                                        | Demo stage script — synthetic step count/delay for `AGENT_RUNNER_MODE=demo` runs                                                                                                    |
| `PIPELINE_DEMO_FAIL_PHASES` / `_LIMIT_PHASES` / `_GAP_PHASES` / `_DRIFT_PHASES` / `_EMIT_LEARNED` | Demo stage script — comma-separated phase ids that simulate failure/limit-pause/gap-verdict/drift/learned-note-emission, for exercising pipeline states without a real `claude` run |
| `PIPELINE_DEMO_STAGE_SCRIPT`                                                                      | Overrides the demo stage script path itself                                                                                                                                         |

The `PATH` used to launch the API **must** include the dir holding `claude` —
agent and pipeline runs shell out to it.

## Budgets & caps

Per-engagement budgets live on the project record (`PATCH /projects/:id`, or the
project editor in the dashboard): `dailyRuns` / `weeklyRuns` / `monthlyRuns`
(run-count caps per Europe/Prague window) and `maxConcurrent`, plus (Phase 12)
`dailyCostCapUsd` / `weeklyCostCapUsd` / `monthlyCostCapUsd` — the same windows,
priced off finished runs' `costUsd` instead of a run count. Over either kind of cap, a
new task is **held** behind a Tier-3 `spend-past-cap` approval (Law 3: no autonomous
spend past budget); at `maxConcurrent` it is **queued** (no approval) and drains when
a run of that project finishes. The global account ceiling (`data/budget.json` →
`pauseAtRollingPct` / `pauseAtWeeklyPct`) holds **every** dispatch once account
utilization crosses it. See `docs/api/budget.md` for the full check/ledger flow.

**If everything is suddenly held**, the budget guard is failing closed (by design:
an unreadable ledger or limits snapshot ⇒ hold, never auto-spend). **Check disk** —
the ledger dir (`budget-ledger/`) must be writable and `data/budget.json` readable.
Each held task carries its own approval; rejecting them clears the queue.

## Runtime system config (`data/system-config.json`)

Behavioral knobs that used to be start-only environment variables are now
**file-backed** and editable from `/settings` (Law: files are the source of truth).
There is no env override — the file is the only source; a missing file reads as the
schema defaults (reproducing the historical "env unset" behavior). Endpoint:
`GET/PUT /api/system/config`.

Changes to interval and adapter-mode knobs take effect **immediately** (the
schedulers live-rearm via `SystemConfigStore.onChange`); `goalAutoResume` only
applies on the next boot.

| Key                   | Default  | Purpose                                                                                                                                                  |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taskTickMs`          | `30000`  | Task scheduler heartbeat interval (`0` = disabled; the test default)                                                                                     |
| `channelTickMs`       | `30000`  | Channel watcher poll interval (`0` = disabled)                                                                                                           |
| `monitorTickMs`       | `60000`  | Monitor watcher poll interval (`0` = disabled) — CI status alerts (Phase N3)                                                                             |
| `automationTickMs`    | `0`      | Automation scheduler loop interval (`0` = disabled; the historical default)                                                                              |
| `limitResumeTickMs`   | `60000`  | Limit-resume daemon scan interval (`0` = disabled)                                                                                                       |
| `limitResumeMax`      | `3`      | Max resume cycles before a limit-paused run is parked/failed                                                                                             |
| `goalVerifyTimeoutMs` | `600000` | **Phase 12.3** — wall-clock deadline for a goal's `checks` verifier shell (then `SIGTERM`→`SIGKILL`)                                                     |
| `goalAutoResume`      | `false`  | **Phase 12.4** — `true` = on boot, auto-re-drive `running`/`paused-limit` goals (the unattended launchd daemon). Default: park `awaiting-resume` (Law 3) |
| `chatPersona`         | `jarvis` | The chat butler's personality (`jarvis`/`concise`/`formal`) — changes tone only, never the dispatch governor. Read per turn, set in `/settings`          |

In tests, `vitest.setup.ts` seeds this file (ticks at `0`) via `SYSTEM_CONFIG_FILE`;
a suite that needs a different knob calls `writeSystemConfig()`
(`apps/api/src/system/system-config.fixture.ts`) before booting the app.

Channel adapters are always real in production (per integration type). The fake
adapter is a test-only seam — `AdapterRegistry` selects it for every type as soon as
the env var `CHANNEL_FAKE_DIR` is set (seeded by `vitest.setup.ts`); it is not an
operator-facing config.

## The `.env` file

`apps/api/.env` or a root `.env` (both supported via NestJS `ConfigModule`).

```bash
# Example .env for local development
PORT=3333
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:3000
ZIBBY_DATA_DIR=.zibby/data
```

`.env` is in `.gitignore` — never commit it.

## Data directories

### Default (`.zibby/data/`)

Used by `pnpm api:dev` and `pnpm api:start`.

### Test (`.zibby/data-test/`)

Switch with `ZIBBY_DATA_DIR=.zibby/data-test`.

Commands:

```bash
pnpm api:dev:test        # dev server against test data
pnpm api:start:test      # production server against test data
pnpm seed:test           # seed test data
```

Playwright e2e tests start a second API server on a different port with test data
(see `project_playwright_fast_refresh_loop.md`).

## Monorepo scripts (root `package.json`)

```bash
# Development
pnpm web:dev             # Next.js → http://localhost:3000
pnpm api:dev             # NestJS (LOG_LEVEL=debug) → http://localhost:3333
pnpm api:dev:test        # NestJS against data-test/
pnpm storybook           # Storybook → http://localhost:6006

# Build
pnpm web:build           # Next.js production build
pnpm web:start           # run the production build
pnpm api:start           # run the API from source (no build step — see docs/ops/deployment.md)

# Tests
pnpm test                # all vitest projects
pnpm web:test            # web vitest project only (jsdom)
pnpm api:test            # api vitest project only
pnpm e2e                 # Playwright E2E

# Code quality
pnpm check:lint          # ESLint --fix (acts as the formatter)
pnpm check:types         # tsc --noEmit for tsconfig.base + apps/web/tsconfig
                         # NOTE: rtk pnpm check:types masks errors — always call tsc directly

# Utilities
pnpm seed                # seed data/
pnpm seed:test           # seed data-test/
pnpm api:smoke           # Claude smoke test
pnpm e2e:report          # Playwright HTML report
```

## Test environment

### Vitest projects (`vitest.workspace.ts`)

```typescript
export default defineWorkspace([
  { project: "api",  ... },  // apps/api unit tests
  { project: "web",  ... },  // apps/web component tests (jsdom)
])
```

Note: `apps/web` is not in the workspace for the global `pnpm test` — use `pnpm
web:test` instead.

### Playwright (`playwright.config.ts`)

- Chromium + Firefox + WebKit
- A test API server on a separate port with `ZIBBY_DATA_DIR=.zibby/data-test`
- `TASK_TICK_MS=0` for deterministic tests (the tick is driven manually)
- `.playwright-mcp/` output dir is gitignored (it would otherwise break Next.js Fast
  Refresh)

## TypeScript path aliases

Defined in `tsconfig.base.json`, used across the monorepo:

```json
{
  "paths": {
    "@zibby/contracts": ["libs/contracts/src/index.ts"],
    "@zibby/contracts/*": ["libs/contracts/src/*"],
    "@zibby/design-system": ["libs/design-system/src/index.ts"],
    "@zibby/design-system/*": ["libs/design-system/src/*"],
    "@zibby/forms": ["libs/forms/src/index.ts"],
    "@zibby/forms/*": ["libs/forms/src/*"]
  }
}
```

## NX configuration (`nx.json`)

4 projects: `design-system`, `contracts`, `web`, `api`.

- Caching: build, test, and lint outputs are cached
- Named inputs: `default` (all files), `production` (excludes tests)
- Affected: NX detects changes and runs only the affected projects

## Playwright MCP output

`.playwright-mcp/` — screenshots and trace output from the Playwright MCP tool.
Must stay outside the tree watched by the Next.js dev server (otherwise it breaks
Fast Refresh). It is gitignored.
