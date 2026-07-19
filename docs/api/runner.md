# Runner (the shared process-spawn engine)

`apps/api/src/runner/` is the execution core every run kind spawns through:
agent runs, pipeline stage runs, goal-loop runs, and skill runs. It owns
**process lifecycle** (spawn, output capture, restart survival, cancellation),
the **`claude -p` command builder**, and the **mid-run approval-gate wiring**.
It does not know about agents, pipelines, or goals as concepts — those live in
their own modules and each instantiate their own `RunnerCore`, passing in a
kind-specific `KindStrategy`. For orchestration-level detail (how an agent run
is dispatched, how a pipeline phase retries/escalates/parks), see
`docs/api/agents-runs.md` and `docs/api/pipelines.md` — this doc stays
focused on what happens _inside_ the spawned process and its supervision.

## Pieces

| Piece                | File                                                  | Role                                                                                     |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Engine               | `apps/api/src/runner/runner-core.ts`                  | `RunnerCore<R>` — spawn/log/sidecar/restart/cancel, kind-agnostic                        |
| Types                | `apps/api/src/runner/runner-core.types.ts`            | `BaseRun`, `RunSpec`, `KindStrategy<R>`, `RunnerRunStatus`, `RunLogChunk`                |
| Command builder      | `apps/api/src/runner/claude-run-command.service.ts`   | `ClaudeRunCommandService.buildClaudeCommand` — assembles the full `claude -p` argv       |
| Approval hook        | `apps/api/src/runner/claude-approval-hook.mjs`        | PreToolUse hook script, spawned by Claude Code itself, not by the API process            |
| Preflight            | `apps/api/src/runner/claude-preflight.service.ts`     | `ClaudePreflightService` — "can this machine run `claude -p` right now?"                 |
| Tool mapping         | `apps/api/src/runner/claude-tools.ts`                 | internal tool tokens (`read`/`write`/`bash`/...) → Claude tool/rule strings              |
| Stream formatting    | `apps/api/src/runner/claude-stream-format.ts`         | flattens `stream-json` events into readable log lines                                    |
| Limit detection      | `apps/api/src/runner/detect-limit.ts`                 | pure regex scan for usage-limit/rate-limit signals in output                             |
| Command materializer | `apps/api/src/runner/command-materializer.service.ts` | writes enabled custom slash commands into a run's `.claude/commands/`                    |
| Module               | `apps/api/src/runner/claude-run.module.ts`            | provides `ClaudeRunCommandService`/`ClaudePreflightService`/`CommandMaterializerService` |

## `RunnerCore<R>` — the shared engine

A **plain class, not a Nest provider** — deliberately: per-kind wrappers
(`AgentRunnerService`, `PipelineRunnerService`, ...) own the DI surface and
instantiate their own `new RunnerCore(dir, strategy, ...)`, so liveness/
restart/approval logic lives in exactly one place while each caller keeps its
own runs directory and its own callback wiring (limit-hit, intent handling,
logging, line formatting, resume-time resolution).

### Constructor callbacks (all optional, kind-specific)

```typescript
new RunnerCore(
  dir,                 // runs directory (sidecars + logs)
  strategy,             // KindStrategy<R>: assemble() + schema
  onLimitHit?,           // called on first usage-limit signal in output
  onIntent?,             // IntentHandler — mid-run gate wiring (see below)
  logger?,               // ScopedLogger, per-run lifecycle logging
  formatLine?,            // per-line transform before writing to the log
  resolveResumeAt?,        // resolve a limit-paused run's auto-resume epoch
)
```

`AgentRunnerService` wires all of them (limits cache busting, the gate
evaluator as the intent handler, `formatClaudeStreamLine`, `LimitsService`-backed
resume resolution); `PipelineRunnerService` wires a subset. A demo/test runner
can omit every optional arg.

### `KindStrategy<R>` — the per-kind seam

```typescript
interface KindStrategy<R extends BaseRun> {
  assemble(base: BaseRun, spec: RunSpec): R; // build the full record
  schema: ZodType<R, unknown>; // validate + default-fill on restart
}
```

This is the only place a wrapper injects its own fields (`agentId`, `prompt`,
`project`, ...) onto the kind-agnostic `BaseRun`.

### Process lifecycle

`start(spec: RunSpec)` spawns immediately, no gate:

- `spawn(spec.command, spec.args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] })`.
  `detached: true` puts the child in its **own process group** (`pgid === pid`
  on Linux) so the whole group — including anything the child itself forks —
  can be probed/killed as one unit. `stdin: "ignore"` stops `claude -p` from
  waiting 3s for piped input it will never get (the prompt arrives via `-p`).
- `cwd: spec.spawnCwd ?? spec.cwd` — the sandbox `cwd` is where logs/sidecar/
  intent coordination live; `spawnCwd` (when set) is where the process
  actually runs — used when a project-targeted stage spawns inside the real
  project checkout so its own `CLAUDE.md`/`.claude` context loads.
- `env: { ...process.env, ...spec.env, [INTENT_DIR_ENV]: spec.cwd }` — the
  intent-dir pin (`ZIBBY_INTENT_DIR`) is applied **after** `spec.env` so a
  project's own env can never override it.
- The run id is `${ownerId}_${startedMs}_${pid}`; the log file is
  `<dir>/<runId>.log` (append mode); the sidecar is `<dir>/<runId>.json`.
- The child's `exit`/`error` listeners are wired **synchronously, before any
  await** — a trivially fast child (e.g. a verify phase's `/bin/sh -c "true"`)
  can exit during the sidecar write, and `exit` is a one-shot event a
  post-await listener would miss (this hung runs `running` forever under CI
  timing before the fix).

`createPending(spec)` creates an `awaiting-approval` run **without spawning** —
the spec is stashed (memory + `<runId>.pending.json` on disk) so `resume()` can
start it once approved, surviving a restart in between.

### Restart survival (`init()`)

Rebuilds the in-memory registry from `<dir>/*.json` sidecars on boot:

- `status: "running"` — probes the stashed `pgid` (`isAlive`). If the process
  group **is still alive** (a hard `kill -9` reparented the backend but not the
  child — a live orphan), it is **not** marked interrupted; instead
  `monitorPgid` polls the pgid every 200ms and finalizes (`done` if it reached
  100%, else `interrupted`) once it dies. Otherwise → reconciled to
  `interrupted`.
- `status: "awaiting-approval"` — if a `.pending.json` spec exists (a
  spawn-boundary pause via `createPending`), it survives and can still be
  resumed. Without one (a Variant-B mid-run pause whose blocking child died
  with the previous backend) → reconciled to `interrupted`.
- `status: "paused-limit"` — same shape as an approval pause: a stashed spec
  survives; without one → reconciled to `interrupted`.

### Shutdown (`shutdown()`)

Kills every still-live child's **process group** and **awaits** its exit +
log flush (not fire-and-forget — an earlier `void` version let the process
exit mid-flush, racing an e2e's post-shutdown `fs.rm`). Each child gets a
5-second grace (`SHUTDOWN_GRACE_MS`) after `SIGTERM` before an escalation to
`SIGKILL`.

### Cancellation

`cancel(runId)` — an `awaiting-approval` run is terminated **without**
performing its action (the reject path): a Variant-B live child gets a `deny`
decision written plus the group killed (so a real `claude` session that
doesn't self-exit on the deny is still stopped, closing off a retried
destructive command); a spawn-boundary pause with no child is simply marked
`interrupted`. A live `running` run's group is killed; `handle.interrupting`
is set first so the non-zero exit this produces reconciles to `interrupted`
(operator intent), not `error`.

`delete(runId)` permanently erases a run: kills a still-live child, drops the
registry entry, and removes the sidecar, log, pending spec, **and the sandbox
folder** — even for a run only found on disk (post-retention-sweep).

### `killGroup(pgid)` / `isAlive(pid)`

Exported helpers (`runner-core.ts`). `killGroup` sends `SIGTERM` to the
**negative** pid (`process.kill(-pgid, "SIGTERM")`, the whole group), falling
back to a plain `SIGTERM` on the single pid if that fails. `isAlive` probes
with a signal-0 `kill` (never actually signals) and treats `EPERM` (exists,
not ours) the same as alive.

### Timeout / approval-gate wiring — "Variant B" mid-run gating

A live child announces an external-effect action either by:

- printing `INTENT {json}` to stdout (demo/test path), or
- (real `claude -p` runs) the PreToolUse approval hook writing
  `intent-request.json` into the coordination dir — a hook's stdout never
  reaches the parent's pipe, so this is file-based instead.

`RunnerCore.wire()` parses the stdout line; `watchIntentRequest` polls the
sandbox `cwd` every 200ms for the request file. Either path calls the same
`IntentHandler(runId, action, cwd)`, which then steers the run:

- `allowIntent(runId)` — writes an `allow` decision; the run stays `running`.
- `denyIntent(runId)` — writes `deny`, marks `interrupting`, stops the watcher,
  kills the group (a real session may not self-exit on deny).
- `holdForApproval(runId)` — flips the run to `awaiting-approval` **without**
  killing the child, which keeps blocking on the decision file until a later
  `resume`/`cancel`.

The coordination directory is **always the run's sandbox `cwd`**, passed
explicitly as `ZIBBY_INTENT_DIR` — never the Bash call's own working directory
(which may be a granted `--add-dir` target the core never watches). See
`docs/api/gates.md` for the evaluation semantics (`GateEvaluatorService`) that
sits behind the handler agent runs actually wire in.

### Output capture

Every stdout/stderr chunk is buffered across chunk boundaries (`residual`) so
a control line (`PROGRESS <n>`, `INTENT {json}`) split across a read never
gets missed. Without a `formatLine`, raw bytes are written verbatim; with one
(the real `claude` path via `formatClaudeStreamLine`), each **complete** line
is formatted before writing, and `total_cost_usd`/`session_id` are extracted
opportunistically from `result`/`system init` stream-json events as they pass
through (`run.costUsd` accumulates across respawns; `run.sessionId` is
captured once, first-wins, for a later `--resume`).

`readLog(runId, offset)` reads from the log file — the source of truth,
working whether or not the run is still in the in-memory registry (durable
replay). Capped to `MAX_LOG_READ_BYTES` (1 MiB) per call so a multi-hundred-MB
log can't OOM the process; callers loop on `nextOffset` until `done`.

### Usage-limit pause (`paused-limit`)

`detect-limit.ts`'s `detectLimit(text)` scans output for Claude usage-limit /
generic rate-limit / bare-429 patterns (priority order, most specific first —
the specific pattern also carries a reset epoch). A child that exits on the
error path **and** saw a limit signal is reclassified `paused-limit` instead
of `error`; `completeLimitPause` resolves the resume epoch (via the injected
`resolveResumeAt`, or the detected value, or a 30-minute fallback), stashes the
spawn spec (so restart survival + respawn work exactly like an approval
pause), and emits the paused status. `resume()` treats `paused-limit` the
same as a stashed-spec approval pause — it always respawns fresh, never the
Variant-B "release a blocked child" branch (the child is already dead).
`markResumeCycle`/`failLimit`/`discardPausedLimit` support the owner-side
retry-cap and re-drive logic (agent runs have no parked terminal state, so a
flapped-out limit pause fails to `error` with a readable reason).

## `ClaudeRunCommandService` — the `claude -p` command builder

Builds the full `command`/`args` array for one run from a `ClaudeRunOptions`
(instructions, task, tools, model, thinking, grantDirs, streamTranscript,
grounding, resumeContext, resumeSessionId, delegates, systemPromptDir,
toolGrants). Returns `{ command, args, catalogAgentIds }` — `catalogAgentIds`
is persisted on the run record so a later orchestrator-run intent evaluation
can pull each delegated subagent's own `gates`/`requires_approval` back in
(see `docs/api/gates.md`'s "Orchestrátorská delegace — strictest union").

Key assembled pieces:

- **System prompt** = `OPERATING_CONTRACT` (framed first — tells the headless
  session it runs non-interactively and must never print a confirmation
  question, since nothing replies) + grounding + resume-context + the entity's
  own instructions. Spilled to `.zibby-system-prompt.md` in the sandbox
  (`--append-system-prompt-file`) when `systemPromptDir` is given — keeps a
  large prompt off argv, which shares the same OS limit `--agents` can blow.
- **Task** = the user prompt + `EXECUTION_DIRECTIVE` appended (not prepended)
  so it's the highest-recency instruction, overriding an agent body that says
  "ask the user first" — "act, don't ask, the gate does the asking".
- **`--agents` catalog** — curated via `selectCatalogAgents`: a small library
  (≤ `MAX_CATALOG_AGENTS = 16`) with no explicit `delegates` passes through
  unchanged; otherwise the caller's `delegates` come first, then
  `CORE_DELEGATE_IDS` (`architekt`, `koder`, `code-review`, `code-reviewer`,
  `tester`, `dokumentator`, `orchestrator`, `cleaner`), deduped and capped —
  never the whole seeded library (160+ agents would overflow `spawn E2BIG`).
  Only agents from `AgentsStorageService.listActive()` are eligible — a
  `status: "proposed"` Agent-Factory candidate is never delegatable.
- **`--allowedTools`** — the union of the primary's tools, every catalog
  subagent's tools, each enabled MCP server's `mcp__<id>__*` wildcard, and
  (Phase 108) resolved tool grants (`resolveGrantId`) — under
  `--permission-mode dontAsk`, allow rules are **session-wide**, so a
  delegated worker needs its tools on the session list or its calls are denied
  regardless of its own declared tools.
- **`--settings`** — the locked approval-hook `PreToolUse` group is always
  **first**, `matcher: "Bash|Task"`; any custom hook whose matcher could catch
  `Bash`/`Task` (empty, `*`, or containing either token) is dropped at merge
  time (`collidesWithApprovalGate`) so a stored hook can never weaken the gate
  (Law 1).
- **`--mcp-config`** — enabled MCP servers' connection config, secrets merged
  in from the credentials store; spilled to a `0o600` sandbox file
  (`.zibby-mcp-config.json`) rather than inline JSON when a sandbox dir is
  available, since it carries live credentials.
- `--resume <sessionId>` when `resumeSessionId` is set (Phase 49 — continuing
  a captured session instead of a cold start on retry).
- `--model`/`--effort` from the agent's `model`/`thinking` (`THINKING_TO_EFFORT`
  maps `low`/`medium`/`high` 1:1 today).

### The gate deadline (`GATE_DEADLINE_S`)

24 hours. Claude Code kills a hook at its configured timeout and treats the
kill as a **non-decision** — under `dontAsk` that lets the pending command run
as if approved. So the hook takes its own shorter fail-closed deadline as
argv, denying before the CLI can kill it; the registered hook `timeout` sits
`HOOK_KILL_MARGIN_S` (5 min) above that so the CLI never kills a
still-deciding hook first. 24h + 5min stays comfortably under Node's ~24.8-day
timer cap (`2^31-1` ms), avoiding an overflow-to-immediate-kill (= instant
auto-approve).

## The approval hook (`claude-approval-hook.mjs`)

A standalone Node script — **not run by the API process**; Claude Code itself
spawns it as a `PreToolUse` hook before every `Bash` or `Task` tool call, JSON
event on stdin. Since a hook's stdout never reaches the API's pipe, it
coordinates through files in `ZIBBY_INTENT_DIR` (the run's sandbox, never the
tool call's own `cwd`):

1. Classify the command/call. `Bash` → best-effort matcher for deletes (rm
   family by token basename, `find … -delete`, `git clean`), overwrites
   (`>`/`>>` onto a real file, `tee`, `dd of=`, `truncate`, `sed -i`,
   `install`, multi-arg `cp`), moves (`mv`), git publish (`push`/force-push),
   PR open/merge (`gh pr create`/`merge`), and mutating `gh api` calls
   (`PUT`/`POST`/`PATCH`/`DELETE`, or an implicit-POST field flag) — routed to
   `pr.merge`/`pr.open` when the path matches, else `gh.api_write`. `Task` →
   **always** classifies to `agent.delegate` (every subagent handoff goes
   through the gate, even though the default decision is `allow`).
2. Unclassified → exit 0 immediately (Claude's own permissions decide).
3. Classified → write `intent-request.json`, then **block**, polling
   `intent-decision.json` every 200ms until it appears or the deadline elapses.
4. `RunnerCore.watchIntentRequest` picks up the request file and drives it
   through the same `IntentHandler` as a stdout `INTENT` line.
5. Emit the decision as `hookSpecificOutput` (`permissionDecision: "allow" |
"deny"`) — this overrides `--permission-mode dontAsk`. Timeout → deny,
   fail-safe.

Fails **open** on a classifier exception (an unclassified command falls
through to Claude's own permissions) but **closed** on a decision timeout
(deny) — the two failure modes are asymmetric on purpose.

## `ClaudePreflightService`

Answers "can this machine run `claude -p` right now?" by spawning
`claude --version` then `claude auth status`, both under a 5s timeout, and
caching the verdict (30s TTL on success, 5s on failure so a fixed `PATH`
recovers quickly). `assertAvailable()` throws `ClaudeUnavailableError` (a
runner maps this to `503`) so a typed task never produces a dead run record
when the CLI is missing/unauthenticated. Backs the `claude` field of
`docs/api/health.md`'s payload.

## `CommandMaterializerService`

Writes every **enabled** custom slash command into
`<targetDir>/.claude/commands/<id>.md` before a run spawns — Claude Code only
discovers custom commands on the filesystem (no `--commands` flag). Pollution
guard: a command file is written only if the target tree doesn't already have
one of that name (project/user command wins), and `.claude/commands/` is added
to the run tree's git exclude so an agent can't accidentally commit it.
Fail-open throughout — a materialization hiccup never blocks the run.

## Wired into the rest of the system

Four callers each own their own `RunnerCore` instance and runs directory:

- **`agents`** (`apps/api/src/agents/agent-runner.service.ts`) — the primary
  consumer; wires every optional callback. See `docs/api/agents-runs.md`.
- **`pipelines`** (`apps/api/src/pipelines/pipeline-runner.service.ts`) —
  one stage attempt per spawn. See `docs/api/pipelines.md`.
- **`goals`** (`apps/api/src/goals/goal-runner.service.ts`) — imports
  `RunNotFoundError`/`isAlive`/`killGroup` directly rather than instantiating
  its own core (delegates the actual spawn to the pipeline/agent runner it
  drives).
- **`tasks`** (`apps/api/src/tasks/task-runs.service.ts`) — references the
  shared process-governance guarantees (pgid kill, `interrupted` landing) in
  its own doc comments without holding a `RunnerCore` itself.

## Gotchas

- `RunnerCore` is generic over `R extends BaseRun`; a wrapper's `KindStrategy.schema`
  must use `.default()`s liberally for back-compat, since a sidecar written by
  an older schema version still has to parse on `init()`.
- `spec.env` merges **before** the `ZIBBY_INTENT_DIR` pin — a project-level env
  override can never smuggle in a different coordination directory.
- A run id follows `RUN_ID_REGEX` (`^[a-zA-Z0-9._-]+$`); `resolveLogFile`/
  `resolveInDir` additionally check the resolved path's dirname still equals
  the runs dir — defense-in-depth against a crafted id escaping the sandbox.
- `list()` (in-memory, retention-windowed, capped at 50, newest first) and
  `listAll()` (full on-disk history, no cap) serve different UI surfaces — the
  live panel vs. the all-runs history view. Don't conflate them.
- The stream-json cost/session-id extraction (`extractResultCost`,
  `extractSessionId`) only fires when `formatLine` is wired — demo/test runs
  without it never populate `costUsd`/`sessionId`.
