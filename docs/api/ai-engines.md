# AI engines (claude / opencode)

Agent runs and workflow agent stages run on one of two engines:

- **claude**: `claude -p`. This is the default and is unchanged.
- **opencode**: `opencode run` with a provider/model the operator picks. That can be a
  free `opencode/*` model, or any provider connected with `opencode auth login`.
  That includes opencode's **Claude Agent** provider (`claude-agent/*`, opencode ≥ 2.2):
  it runs the operator's installed `claude` through the Claude Agent SDK on the
  existing Claude Code login, so it spends the Claude subscription (see
  [Claude usage limits](#claude-usage-limits)). The operator connects it themself with
  `opencode auth login claude-agent` (A10).

Decisions: `docs/plans/ai-providers-dictation-decisions.md` (A1–A18). Verified opencode
behaviour: `docs/plans/ai-providers-dictation-handoff.md` → _Verified facts_.

## Choosing the engine

| Where                                                  | Field                                                | Default                |
| ------------------------------------------------------ | ---------------------------------------------------- | ---------------------- |
| Global (`SystemConfig`, [system.md](./system.md))      | `aiEngine: "claude" \| "opencode"`                   | `"claude"`             |
| Global                                                 | `opencodeModel: string` (`provider/model[#variant]`) | `""` (no paid default) |
| Agent frontmatter ([agents-runs.md](./agents-runs.md)) | `engine`, `engineModel`                              | absent = global        |

`resolveAiEngine(agent, config)` (`apps/api/src/runner/ai-engine.ts`):

- engine = `agent.engine ?? config.aiEngine ?? "claude"`
- on opencode, model = `agent.engineModel ?? config.opencodeModel`

Both the agent runner and the workflow runner use it, via
`ClaudeRunCommandService.resolveEngine`. The run records what it ran on:
`AgentRun.engine` / `engineModel` and `StageRun.engine` / `engineModel`. Claude runs
leave both fields absent.

## Preflight (no fallback)

`assertOpencodeReady(model)` refuses an opencode run up front in three cases:

- no model is set,
- `opencode models` fails (binary missing, timeout), or
- the model (with any `#variant` dropped) is not listed.

It throws `OpencodeUnavailableError`, a subclass of `ClaudeUnavailableError`. An agent run
or task therefore gets the same 503 / failed task, and a workflow stage gets a
`StageBuildError`. The run never falls back to claude.

## The opencode command

```
opencode run --standalone --format json -m <model> --agent zibby [--session <id>] -- <task>
```

| Env                                                             | Purpose                                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `OPENCODE_CONFIG=<runsDir>/.opencode/<hash>.json` (0600)        | the per-run config below, written by RunnerCore                                                            |
| `OPENCODE_DISABLE_PROJECT_CONFIG=1`                             | a repo's `opencode.json` never loads (like `--setting-sources ""`)                                         |
| `ZIBBY_GATE_NODE`, `ZIBBY_GATE_HOOK`, `ZIBBY_GATE_DEADLINE_S`   | how the gate plugin runs the approval hook                                                                 |
| `ZIBBY_GATE_CWD`                                                | the run's real spawn dir; the plugin judges paths against it, never against opencode's own cwd             |
| `ZIBBY_GATE_LOG`                                                | the plugin's decision log (`<hash>.gate.log`), copied into the run log                                     |
| `ZIBBY_MCP_SERVERS`, `ZIBBY_DENY_TOOLS`, `ZIBBY_SHELL_PREFIXES` | the run's MCP server ids, the tools the agent may not use, and the `Bash(<prefix>:*)` prefixes (see below) |
| `ZIBBY_GRANT_DIRS`                                              | grant dirs + context dir; opencode has no `--add-dir`. Always set (empty included)                         |
| `PWD=<spawn dir>`                                               | opencode takes its project dir from `$PWD`, not the process cwd (verified 2.2.7); see below                |
| `OPENCODE_CLAUDE_PATH`                                          | the `claude` binary for `claude-agent/*`: the API's `OPENCODE_CLAUDE_PATH` ?? `CLAUDE_BIN`; unset = `PATH` |

Every inherited `OPENCODE_*` variable (from the API's env or a project's env) is removed
from the child env before these are set, so a project cannot point the run at another
config or permission set (or another `claude` binary).

`PWD` is pinned because an inherited one (the API's own dir) put the session there: the
model then worked in the API's directory while the gate plugin judged a relative path
against `ZIBBY_GATE_CWD`. `OPENCODE_CLAUDE_PATH` mirrors the native engine, which spawns
`CLAUDE_BIN ?? "claude"` on the API's `PATH` (the desktop app sets that `PATH` from the
login shell). The `claude` child gets the rest of the run env (`HOME` included). The
gate's nested-`claude` shell deny does not apply: opencode starts `claude` itself, not
through the shell tool. A bad path fails the run with opencode's
`Claude Code native binary not found at …` error.

`freeDirs()` reads `ZIBBY_GRANT_DIRS` only for `engine === "opencode"`. On a claude run
the same variable in a project's env is ignored.

### Where the config lives

The builder returns the config as a string (`opencodeConfig`); it is persisted in the
run spec (the pending sidecar) and RunnerCore writes it to
`<runsDir>/.opencode/<sha256(cwd)[0..16]>.json` (dir 0700, file 0600) **before every
spawn**: start and every resume. A tampered file is overwritten on the next resume.

The runs dir is outside every run's free zone (an agent run's free zone is its own
sandbox `<runsDir>/<runId>`; a stage sandbox sits under its run dir). A `Write`/`Edit`
there raises an approval (the hook's outside-the-free-zone rule), and a shell
redirect/`cp`/`mv`/`rm` onto it is not exempt either. The ceiling is the same as on
Claude: a write the classifier cannot see (e.g. inside a `python -c` script) is not
caught; the rewrite before every spawn limits what such a write can achieve.

The config file contains:

```json
{
  "agents": {
    "zibby": { "mode": "primary", "system": "<operating contract + grounding + agent body>" }
  },
  "permissions": [
    { "action": "*", "resource": "*", "effect": "ask" },
    { "action": "question", "resource": "*", "effect": "deny" },
    { "action": "execute", "resource": "*", "effect": "deny" },
    { "action": "<each tool the agent may not use>", "resource": "*", "effect": "deny" }
  ],
  "plugins": ["<api>/runner/opencode-gate-plugin"],
  "mcp": {
    "servers": {
      "<id>": {
        "type": "local",
        "command": ["cmd", "...args"],
        "environment": {},
        "codemode": false
      }
    }
  }
}
```

A remote MCP server is written as `{ type: "remote", url, headers, oauth: false,
codemode: false }`. The config never goes to `~/.config/opencode`, and never into the env
(`OPENCODE_CONFIG_CONTENT` would be inherited by every shell command the agent runs, MCP
secrets included).

`--standalone` is mandatory. Without it the run attaches to opencode's background service,
which ignores per-run config.

### The agent's `tools` list

A config `deny` removes the tool from the model's toolset. `opencodeToolRules(tools)`
(`claude-run-command.service.ts`) derives the denials from the same `mapTools()` Claude's
`--allowedTools` uses:

| opencode action(s)     | denied unless the agent has    |
| ---------------------- | ------------------------------ |
| `shell`, `bash`        | `Bash` or a `Bash(<prefix>:*)` |
| `write`                | `Write`                        |
| `edit`                 | `Edit`                         |
| `patch`, `apply_patch` | `Write` and `Edit`             |
| `read`, `list`         | `Read`                         |
| `glob`                 | `Read` or `Glob`               |
| `grep`                 | `Read` or `Grep`               |
| `task`, `subagent`     | `Task` or `Agent`              |
| `webfetch`             | `WebFetch`                     |
| `websearch`            | `WebSearch`                    |

`question`, `execute` and `skill` are always denied (`skill` loads the operator's global
`~/.claude/skills` into the run; opencode has no switch that limits it to the run's own
skills). On 2.2.7 the config `deny` no longer removes `skill` from the toolset (the
other denied tools are still removed); the gate plugin refuses the call. No `tools` list means no restriction (the gate still decides every
call). The same list rides `ZIBBY_DENY_TOOLS`, so the plugin refuses a denied tool even if
opencode offered it. An agent with only `Bash(git:*)`-style tools gets
`ZIBBY_SHELL_PREFIXES`: the plugin lets a shell call through only when it is one plain
command (no `;`, `&`, `|`, backticks, redirects or `$(`) starting with an allowed prefix.
For the `git` prefix it also refuses `-c`, `--config-env`, `--exec-path` and any argument
containing `!`, because git config runs arbitrary commands
(`git -c alias.x='!sh …' x`, `git -c core.pager='…' log`). Delegation is stricter than
Claude, where `Agent` is always offered.

MCP servers with the id `opencode` or `browser` are never mounted on an opencode run: their
tools would be named like opencode's own `opencode_*` / `browser_*` tools, which the gate
always denies. The plugin ignores those ids in `ZIBBY_MCP_SERVERS` too.

### Not carried over

- the `--agents` delegation catalog: an opencode run (also under a global
  `aiEngine: "opencode"`) has no ZibbyOS agent roster. A delegation falls to opencode's
  built-in `general` subagent; its tool calls still go through the gate plugin (and are
  logged, see below),
- custom hooks,
- `--plugin-dir`s,
- effort/thinking,
- the phase's `model`/`thinking` and the escalation model rung on a workflow stage (one
  `ℹ opencode stage on <model>: ignoring …` line in the stage log says so).

`OPENCODE_BIN` overrides the binary. It is the test seam, like `CLAUDE_BIN`.

## The approval gate on opencode

The same gate as Claude, enforced in three layers:

1. **Fail-closed permissions.** The run uses `permissions: ask *` and never `--auto`. In
   headless mode, an asked permission that nobody grants is auto-rejected. If the plugin
   fails to load, every tool is refused. The config denies `execute`, `question` and the
   agent's missing tools (removed from the toolset).
2. **Gate plugin** (`apps/api/src/runner/opencode-gate-plugin/index.mjs`),
   `tool.hook("execute.before")`, **default deny**. Only these tools pass:

   | opencode tool                                                         | Claude event / decision                                                                   |
   | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
   | `shell`, `bash`                                                       | `Bash`                                                                                    |
   | `write`, `edit`, `read`, `grep`, `glob`                               | `Write`, `Edit`, `Read`, `Grep`, `Glob`                                                   |
   | `list`, `ls`                                                          | `Glob` (`*` in the path)                                                                  |
   | `patch`, `apply_patch`                                                | one event per file: Add → `Write`, Update → `Edit`, Move to → `Write`, Delete → `Bash rm` |
   | `task`, `subagent`                                                    | `Task`                                                                                    |
   | `*ask_operator`                                                       | `mcp__zibby-run__ask_operator`                                                            |
   | `<server>_<tool>` of a server in `ZIBBY_MCP_SERVERS`                  | `mcp__<server>__<tool>`                                                                   |
   | `webfetch`, `websearch`, `todowrite`, `todoread`                      | allowed without the hook (read-only / state tracking)                                     |
   | anything else: `execute`, `skill`, `opencode_*`, `browser_*`, unknown | **denied**                                                                                |

   A tool input's `workdir` / `directory` is resolved against `ZIBBY_GATE_CWD`, so a call
   is judged where it really lands. That holds only because a session can't move:
   `opencode_session_move` (like every `opencode_*` tool) is denied. A patch whose file
   headers can't be parsed is denied.

   A shell command that starts `opencode` or `claude` (by basename) is denied: at the
   start of a segment (after `&&`, `||`, `;`, `|`, `&`, `(`, a backtick or `$(`), after
   `VAR=x` assignments, or behind `env`, `sudo`, `nohup`, `exec`, `xargs`, `command`,
   `time`, `nice`. A nested session would run outside this gate. The ceiling is the same
   as on Claude: a wrapper like `sh -c "claude …"`, `bash script.sh` or a python script
   still hides it. The MCP tool naming (`<server>_<tool>`) is an assumption: an MCP
   tool opencode names differently is denied, not let through.

   The plugin runs the existing `claude-approval-hook.mjs` on each event, so the
   classifier, ownership ledger, free zone and the `intent-request.json` /
   `intent-decision.json` protocol RunnerCore watches are all unchanged. When the hook
   denies, times out, exits non-zero or prints something unreadable, the plugin throws,
   which blocks the tool and shows the reason to the model. Empty hook output means "not
   gated". Gated calls are serialised, because the run has one request file.

3. Only then does `permission.hook("evaluate")` grant the call. It never upgrades a
   config `deny`, and refuses `question` and `execute`.

Every decision is appended to `ZIBBY_GATE_LOG` as
`⛨ gate <tool> <summary> → allowed | denied: <reason>`. This covers subagent calls, which
never reach the run's JSONL stream. RunnerCore copies new lines into the run log.

### On `claude-agent/*`

Claude Code's own tools, settings, hooks, `CLAUDE.md` and MCP are off under this
provider. Claude sees opencode's tools as `mcp__opencode__<tool>`, but opencode runs
them like any model's tool call, so `execute.before` sees the plain opencode name
(`shell`, `skill`, …) and everything above holds unchanged. Proven live on
`claude-agent/haiku` (2026-11-12, opencode 2.2.7): a gated `rm` denied (file kept) and
allowed (file gone), with `⛨ gate shell rm … → denied: …` / `→ allowed`; no `execute` in
the toolset; a `tools: [read]` agent had no shell; `skill`,
`opencode_worktree_create` and `opencode_session_move` were refused by the plugin.

## Hung runs

An opencode run has an idle watchdog: no activity for `ZIBBY_OPENCODE_IDLE_MINUTES`
(default 10) kills the process group and ends the run as `error` with
`✖ opencode produced no output for N min — killed as hung`. Activity is any of:

- a stdout/stderr byte;
- a new gate log line;
- a new mtime on the gate log. opencode prints nothing until a tool finishes, so the
  plugin counts allowed tool calls in flight (`execute.before` +1, `execute.after` −1,
  which also fires when the tool fails; a call the gate blocks is never counted) and
  touches `ZIBBY_GATE_LOG` every 30 s while the count is above 0. The timer is `unref`'d,
  so it never keeps opencode alive. A long test suite therefore isn't killed; a model
  call that hangs with no tool running is.

The watchdog does not fire while the run waits for an operator decision
(`awaiting-approval`). Claude runs have no watchdog.

The per-run config (it holds MCP secrets) and the gate log are deleted when the run ends
and when the run is deleted. A resume writes both again before it spawns.

## Claude usage limits

The 5-hour / weekly window belongs to the Claude subscription. It applies to every run
that spends it: the `claude` engine **and** opencode on a `claude-agent/*` model (A18).
`spendsClaudeSubscription(engine, model)` (`runner/ai-engine.ts`) is the one predicate.
Any other opencode model never waits on the window:

- RunnerCore does not scan its output for Claude limit lines;
- an errored run on it is never relabelled `paused-limit`;
- a workflow does not pause at a boundary before a stage on it;
- the task scheduler does not defer a task whose known target is an agent on it or a
  workflow whose every agent phase is. A task without a target still defers: routing
  it needs the (Claude) classifier.

A `claude-agent/*` run behaves exactly like a claude run in all four places. Not
verified live: the exact text Claude's limit error has inside opencode's JSONL (the
line scan relies on `detectLimit`); the snapshot-based reclassification of an errored
run does not depend on it.

## Operator token

Setting or changing the engine or model needs the operator token
(`x-zibby-operator-token`, 401 otherwise): `PUT /api/system/config` when `aiEngine` or
`opencodeModel` differs from the stored value, and agent create/update when `engine` or
`engineModel` differs (`null` on an agent without an override is not a change). Every
other config / agent edit stays open.

## Output, cost and session

`RunnerCore.wire()` checks `run.engine`. For opencode it uses:

- `formatOpencodeStreamLine` for the log: text, `💭` reasoning, `● Shell$ cmd` / `● tool path`
  with a `⎿` result or `⎿ ⚠` error, and `⚠ opencode error: …`;
- the sum of `step_finish.part.cost` for `costUsd`;
- `sessionID` as the session id. A re-run resumes with `--session` only when the engine
  is the same.

Known gap: in standalone mode opencode often skips the last `step_finish`, so a run's
`costUsd` can miss its final step. `GET /ai-providers/usage` reads `opencode stats`,
which is complete.

The task run list (`TaskRun`) carries `engine` / `engineModel`: an agent run's own, a
workflow run's latest stage that recorded one.

## Endpoints

`GET /api/ai-providers/engines` and `GET /api/ai-providers/usage?days=` are documented in
[ai-providers.md](./ai-providers.md). Each probe is cached for 60 s, uses a short timeout,
and never throws.

Each model is `{ id, free, subscription }`. `subscription` is true when the provider is
`claude-agent` and the catalog's `cost` is an empty array (a Claude Code login; an
API-key login lists prices, so it counts as paid). It is never `free`.

A model is `free` only when its provider is `opencode` and the catalog
(`opencode api GET /api/model`, served by opencode's background service; `--standalone`
returns an empty list) lists a price whose every component (input, output, cache read,
cache write) is 0. A zero-cost model of another provider is not free. When the catalog
can't be read, only an `opencode/…-free` id counts as free.
