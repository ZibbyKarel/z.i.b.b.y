# Agents & Runs

## Agent — definition

An agent is a Markdown file with YAML frontmatter at `.zibby/data/agents/<id>.md`.

### Frontmatter fields

```yaml
id: kodér # filesystem-safe identifier
name: Kodér # display name
description: | # description for the task classifier
  Implements features against a spec.
glyph: "💻" # emoji icon (optional)
model: opus # opus | sonnet | haiku
thinking: high # high | medium | low  (extended thinking)
tools: # tools allowed for the claude CLI
  - bash
  - edit
  - read
risk: medium # low | medium | high (display hint)
gates: # custom gate rules (inline)
  - match:
      - type: action
        action: git.push
    decision: ask
    resolve:
      type: human
gateRuleIds: # references into the global catalog
  - push-to-main
```

The body of the `.md` file is the system prompt passed to the claude CLI.

### CRUD API

```
GET    /api/agents              list every agent
POST   /api/agents              create an agent
GET    /api/agents/:id          agent detail
PUT    /api/agents/:id          update an agent
DELETE /api/agents/:id          delete an agent
GET    /api/agents/search?q=    full-text search (id / name / description / category)
GET    /api/agents/categories   list categories
```

## Agent Run — dispatch

> **A run only starts via a task.** There is no operator path that starts an
> agent directly — the only entry point is creating a task
> (`POST /api/tasks`) with target `{ kind: "agent", id }` (or letting the
> classifier pick one). The scheduler then internally calls
> `AgentRunnerService.start(...)`. Run detail, logs, stop, and delete all live
> on the unified surface `/api/tasks/runs/*` — see [tasks.md](./tasks.md). The
> only per-kind run endpoint that remains is the catalog-liveness
> `GET /api/agents/running` (running + just-finished runs, for the catalog
> badge and the Overview panel).

### Run lifecycle

```
running → done
       → error
       → interrupted        (kill / crash / restart reconciliation)
       → awaiting-approval  (a gate stopped the run, waiting on approval)
```

### Log polling and streaming (unified surface)

```
GET  /api/tasks/runs                       unified feed (agent/pipeline/goal/scheduled)
GET  /api/tasks/runs/:runId                run detail (status, pct, …)
GET  /api/tasks/runs/:runId/logs?offset=   log chunk from an offset (bytes)
GET  /api/tasks/runs/:runId/logs/stream    SSE tail (falls back to the offset-poll above)
POST /api/tasks/runs/:runId/stop           stop a running run
DELETE /api/tasks/runs/:runId              delete a run + its artifacts
```

The client prefers the SSE stream (`…/logs/stream`); when a proxy/browser can't
sustain it, it falls back to a pull model — repeated GET requests with
`?offset=nextOffset` until `done: true`. The resolver dispatches by `runId` to
the owning runner.

## RunnerCore — spawn engine

**File:** `apps/api/src/runner/runner-core.ts` (~51 KB)

`RunnerCore` is the universal spawn engine shared by agents, skills, and
pipeline stages.

### What RunnerCore does

1. Creates a sandbox directory (`cwd`) for the run.
2. Spawns `child_process.spawn(command, args, { cwd: spawnCwd ?? cwd })`.
3. Streams stdout/stderr into a log file.
4. Writes a sidecar JSON file (`sidecar.json`) — runId, pid, pgid, status, startedAt, cwd, workspace.
5. Parses the log for `PROGRESS <n>` lines → `pct` (0–100).
6. Parses intent markers (the agent's stated intent before each action).
7. Updates the sidecar status (done / error / interrupted) when the process exits.

### KindStrategy

Each run kind implements `KindStrategy<R extends BaseRun>`:

```typescript
interface KindStrategy<R extends BaseRun> {
  assemble(base: BaseRun, spec: RunSpec): R; // assembles the sidecar from base + extra fields
  schema: ZodType<R, unknown>; // validates the sidecar during restart reconciliation
}
```

Kinds: `"agent"` | `"skill"` | `"pipeline-stage"`

### spawnCwd vs. cwd

- `cwd` — the run's sandbox directory; this is where the log file, sidecar, and intent coordination live.
- `spawnCwd` — the directory where the process actually runs (for project-targeted runs: the project checkout, so its `CLAUDE.md` and `.claude/` context load).

### Restart reconciliation

On API startup (`OnApplicationBootstrap`), `RunnerCore.init()` walks every
sidecar file. Runs with status `running` but a dead PID transition to
`interrupted`. This makes an API restart safe even mid-run.

### Git worktree integration

For project-targeted runs, a git worktree is created:

- Branch: `zibby/<runId>-<slug>`
- Namespace `apps/api/src/workspace/` manages the lifecycle (create / cleanup) — see `docs/api/workspace.md`.

## AgentRunnerService

**File:** `apps/api/src/agents/agent-runner.service.ts` (~27 KB)

A thin wrapper over `RunnerCore` for agent-kind runs:

1. Loads the agent definition from disk.
2. Builds the `claude` command with args (model, thinking, tools, system prompt, dontAsk flags).
3. Applies the agent's gate rules via `GateEvaluatorService`.
4. Calls `RunnerCore.spawn(spec)`.
5. Exposes `listRuns`, `getRun`, `getLogChunk`, `killRun`.

## ClaudeRunCommandService

**File:** `apps/api/src/runner/claude-run-command.service.ts` — lives in the
shared `ClaudeRunModule` (`runner/claude-run.module.ts`), which the three
runners (agents, skills, pipeline stages) all import, rather than being nested
under the agents module. Assembles the `claude` CLI command line:

```bash
claude -p "<prompt>" \
  --model claude-opus-4-8 \
  --thinking high \
  --allowedTools bash,edit,read \
  --system-prompt "<agent body>" \
  --agents "<catalog>" \
  --dontAsk \
  --append-system-prompt "<grounding context>"
```

The flags are resolved by type — `dontAsk` + `--agents catalog` +
`--append-system-prompt` (verified with a spike test; see
`project_claude_runner_flags.md`).

Two neighboring services in the same module round out the run-assembly seam:

- **`ClaudePreflightService`** (`runner/claude-preflight.service.ts`) — probes
  `claude --version` with a short timeout and caches the verdict (30s ok / 5s
  failure). Health reports `degraded` from it, and the runners refuse to start
  a claude-shaped run while it fails (503 `ClaudeUnavailableError`), so a typed
  task never produces a dead run record when the CLI is missing or broken.
- **`CommandMaterializerService`** (`runner/command-materializer.service.ts`) —
  writes the enabled custom-command catalog into `<targetDir>/.claude/commands/`
  before a run starts (Claude Code only discovers slash commands on disk).
  Best-effort and fail-open; a materialization hiccup never blocks the run.

### argv limits (spawn E2BIG)

Both `--agents` and `--append-system-prompt` go on argv, whose total size
(argv + env) is bounded by the OS `ARG_MAX` limit. Two safeguards keep runs
under it:

- **Curated catalog.** The full agent library isn't serialized into
  `--agents` (ZIBBY seeds 160+ of them — that alone overflows `ARG_MAX` →
  `spawn E2BIG`). `buildCatalog` selects the relevant subset: the caller's
  `delegates` (a pipeline sends its phases' agents) + ZIBBY's operational core
  (`CORE_DELEGATE_IDS`), deduplicated and capped at `MAX_CATALOG_AGENTS` (16).
  A small library (≤ cap, no `delegates`) passes through unchanged.
  `--allowedTools` narrows to this subset's tools (correctly — there's no
  point delegating to an agent that was dropped).
- **System prompt to a file.** When the runner gets a `systemPromptDir`
  (sandbox cwd), the composed system prompt is written to
  `<sandbox>/.zibby-system-prompt.md` and passed via
  `--append-system-prompt-file` instead of an inline
  `--append-system-prompt`. The file survives in the sandbox, so
  approval→resume (replaying the same args) still finds it.

## Orchestrator agent

A synthetic fallback agent — it has no stored definition under `data/agents/`.
Used as the routing target when no concrete agent matches the classification.
Runs directly as the `claude` CLI with generic instructions.
