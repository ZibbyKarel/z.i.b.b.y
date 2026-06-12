```
███████╗ ██╗ ██████╗ ██████╗   ██╗ ██╗
╚══███╔╝ ██║ ██╔══██╗ ██╔══██╗╚██╗ ██╔╝
  ███╔╝  ██║ ██████╔╝ ██████╔╝ ╚████╔╝
 ███╔╝   ██║ ██╔══██╗ ██╔══██╗  ╚██╔╝
███████╗ ██║ ██████╔╝ ██████╔╝   ██║
╚══════╝ ╚═╝ ╚═════╝  ╚═════╝    ╚═╝

Zestful · Intuitive · Brainy · Butler · for You
─────────────────────────────────────────────────
🎩 ZIBBY at your service.
```

NX monorepo — Next.js 15 App Router · React 19 · TanStack Query · Tailwind CSS · TypeScript

---

## Quick start

**Prerequisites:** Node.js 20+, [pnpm](https://pnpm.io) 9+ (`corepack enable` or `npm i -g pnpm`)

> **pnpm is the canonical package manager** for this monorepo (it uses the
> `workspace:` protocol and `pnpm-lock.yaml`). Use `pnpm`, not `npm`.

```bash
pnpm install
```

| Command           | What it does                                            |
| ----------------- | ------------------------------------------------------- |
| `pnpm web:dev`    | Start the web app at http://localhost:3000              |
| `pnpm web:build`  | Production build of the web app                         |
| `pnpm web:start`  | Serve the production web build                          |
| `pnpm web:test`   | Run web tests once                                      |
| `pnpm api:dev`    | Start API in watch mode at http://localhost:3333        |
| `pnpm api:start`  | Serve the API once (no reload)                          |
| `pnpm api:test`   | Run API tests once                                      |
| `pnpm test`       | Run all tests once                                      |
| `pnpm test:watch` | Run all tests in watch mode                             |
| `pnpm storybook`  | Launch design system Storybook at http://localhost:6006 |
| `pnpm lint`       | ESLint auto-fix across the monorepo                     |
| `pnpm typecheck`  | Type-check the whole monorepo                           |

### Start developing

```bash
pnpm install          # install dependencies
pnpm web:dev          # web app → http://localhost:3000
pnpm api:dev          # API → http://localhost:3333
pnpm storybook        # design system → http://localhost:6006
```

---

## Structure

```
libs/
  design-system/   ← components, tokens, CVA variants — all Tailwind lives here
apps/
  web/             ← Next.js App Router; imports from DS, never creates its own classes
  api/             ← NestJS backend (ts-rest contract-first, agents stored as Markdown)
```

---

## API (`apps/api`)

NestJS backend running on port **3333** by default. OpenAPI docs served at `/docs`.

Override the port with `PORT=<n>`.

---

## Real mode runbook

Agent runs always spawn a real `claude -p` session. Pipelines additionally support a
deterministic **demo mode** (the default), which is the test/e2e seam — stages run a
token-free demo script instead of claude. Real mode for pipelines:

```bash
AGENT_RUNNER_MODE=claude pnpm api:dev
```

- **CLAUDE_BIN resolution** — runs spawn `${CLAUDE_BIN ?? "claude"}`. Production uses
  the real CLI from `PATH`; tests point `CLAUDE_BIN` at
  `apps/api/test/fixtures/fake-claude.mjs` (it answers `--version` and
  `auth status`, so preflight passes without burning tokens).
- **Preflight semantics** — before any claude-shaped run starts, the API probes
  `claude --version` + `claude auth status` (cached 30s ok / 5s failure). A failing
  probe degrades `GET /api/health` to `status: "degraded"` (the dashboard shows a
  warning) and refuses run starts with **503 + reason** — no dead run records.
  Scheduler-fired tasks are marked `failed` with the same readable reason.
- **Smoke ritual** — after a CLI update (or when runs misbehave), run

  ```bash
  pnpm api:smoke
  ```

  It probes preflight, replays the full run flag matrix (one trivial haiku call per
  cumulative flag group) and pins the context rule (the target project's `CLAUDE.md`
  loads from the spawn cwd; `--add-dir` grants file access but loads no context).
  A red row means CLI drift — fix `claude-run-command.service.ts` and extend its
  flag-matrix tests. Not part of CI (it spends real tokens).

---

## Environment variables

Copy `apps/api/.env.example` → `apps/api/.env` and `apps/web/.env.example` → `apps/web/.env` before first run.

### Web (`apps/web/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3333` | Base URL of the API server (no trailing slash). Exposed to the browser. |

### API server (`apps/api/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3333` | Port the NestJS server listens on. |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated list of allowed CORS origins. |

### Data storage

| Variable | Default | Description |
| --- | --- | --- |
| `ZIBBY_DATA_DIR` | `apps/api/data` | Root for all file-backed stores. Relative paths resolve from the repo root. Every `*_DIR` variable below can still override an individual store on top of this. The `:test` scripts (`api:dev:test`, `api:start:test`, `seed:test`) set this to `apps/api/data-test`. |

Individual store directories default to the corresponding subfolder of `ZIBBY_DATA_DIR` but can each be overridden independently:

| Variable | Default (relative to `ZIBBY_DATA_DIR`) |
| --- | --- |
| `AGENTS_DIR` | `agents` |
| `AGENT_RUNS_DIR` | `agents/runs` |
| `SKILLS_DIR` | `skills` |
| `SKILL_RUNS_DIR` | `skills/runs` |
| `PIPELINES_DIR` | `pipelines` |
| `PIPELINE_RUNS_DIR` | `pipelines/runs` |
| `APPROVALS_DIR` | `approvals` |
| `AUTOMATIONS_DIR` | `automations` |
| `PROJECTS_DIR` | `projects` |
| `GATE_RULES_DIR` | `.` (holds `gate-rules.json`) |
| `POLICY_DIR` | `.` (holds `POLICY.md`) |
| `VAULT_DIR` | `vault` |

#### Obsidian vault

The memory layer reads and writes a plain-markdown Obsidian vault. The dev default
`apps/api/data/vault` is committed with seed notes (`north-star.md`, a starter MOC in
`knowledge/`); the episodic `daily/` subdir is gitignored. For real operation, point
`VAULT_DIR` at your actual Obsidian vault — ZIBBY grounds each run in the North Star,
relevant MOCs, and the project note, and records what every run did back into
`daily/<date>.md` and the project's `knowledge/` MOC. Curated edits stay yours;
ZIBBY only appends episodic lines and links learned notes.

### Runner / demo mode

| Variable | Default | Values / Description |
| --- | --- | --- |
| `AGENT_RUNNER_MODE` | `demo` | `demo` — token-free simulation (default). `claude` — real Claude CLI; uses the agent/skill instructions as the system prompt. |
| `AGENT_DEMO_STEPS` | `25` | Number of steps emitted by a demo agent/skill run. |
| `AGENT_DEMO_DELAY_MS` | `1000` | Delay in milliseconds between demo steps. |
| `AGENT_DEMO_SCRIPT` | *(bundled `demo-task.mjs`)* | Path to a custom demo-task script used for agent and skill runs. |
| `PIPELINE_DEMO_STAGE_SCRIPT` | *(bundled `demo-stage.mjs`)* | Path to a custom demo-stage script used for pipeline runs. |
| `PIPELINE_DEMO_FAIL_PHASES` | *(empty)* | Comma-separated phase IDs that should fail during demo runs — useful for testing failure paths. |
| `PIPELINE_DEMO_EMIT_LEARNED` | *(empty)* | Phase ID whose demo stage also writes a deterministic `learned.md` next to its produces file — exercises the memory recorder's delivery trace. |

### Scheduler

| Variable | Default | Description |
| --- | --- | --- |
| `AUTOMATION_TICK_MS` | `60000` | Automation scheduler tick interval in milliseconds. Set to `0` to disable the background loop (tests drive the tick directly). |

### Rate limits

| Variable | Default | Description |
| --- | --- | --- |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Directory containing Claude config files; used to read the rate-limit status from `rate-limits.json`. |
