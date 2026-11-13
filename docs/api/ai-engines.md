# AI engines (opencode, with Claude through it)

**Since A31 the app runs on opencode by default**, Claude included (`claude-agent/*`). The
Settings card no longer offers the native `claude` engine: the operator picks a **model
family** (see [Model families](#model-families-a31)). `aiEngine: "claude"` stays valid for
stored configs and per-step `engine` overrides.

Agent runs and workflow agent stages run on one of two engines:

- **claude**: `claude -p`. This is the default and is unchanged.
- **opencode**: `opencode run` with a provider/model the operator picks. That can be a
  free `opencode/*` model, or any provider connected with `opencode auth login`.
  That includes opencode's **Claude Agent** provider (`claude-agent/*`, opencode ≥ 2.2):
  it runs the operator's installed `claude` through the Claude Agent SDK on the
  existing Claude Code login, so it spends the Claude subscription (see
  [Claude usage limits](#claude-usage-limits)). The operator connects it themself with
  `opencode auth login claude-agent` (A10).

The **chat** follows the engine too (A24): with `aiEngine: "opencode"` (or a mentioned
`@agent` on opencode) a chat turn runs `opencode run`, and the chat's model picker means
tiers. Chat on opencode gets only the `zibby` / `zibby-kb` MCP tools — no shell, files,
operator MCP servers or claude.ai connectors (A25). See [chat.md](./chat.md#chat-on-opencode-a24--a25).

Decisions: `docs/plans/ai-providers-dictation-decisions.md` (A1–A32). Verified opencode
behaviour: `docs/plans/ai-providers-dictation-handoff.md` → _Verified facts_.

## Choosing the engine

| Where                                                  | Field                                                                                      | Default                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------- |
| Global (`SystemConfig`, [system.md](./system.md))      | `aiEngine: "claude" \| "opencode"`                                                         | `"opencode"` (A31)     |
| Global                                                 | `opencodeModel: string` (`provider/model[#variant]`)                                       | `""` (no paid default) |
| Global                                                 | `opencodeTierModels: { haiku?, sonnet?, opus?, fable? }` (each `provider/model[#variant]`) | `{}`                   |
| Agent frontmatter ([agents-runs.md](./agents-runs.md)) | `engine`, `engineModel`                                                                    | absent = global        |
| Workflow agent phase ([workflows.md](./workflows.md))  | `engine`, `engineModel` (A21)                                                              | absent = agent         |

### Model families (A31)

`SystemConfig.modelFamily` (`claude` | `openai` | `opencode` | `bluecode`, default `claude`) names an
opencode provider: `claude-agent`, `openai`, `opencode` (the free models), `bluecode` (A34). Picking one in
Settings writes `aiEngine: "opencode"`, `modelFamily`, `opencodeModel` and
`opencodeTierModels` in one `PUT /api/system/config` (operator token). The preset is
resolved client-side by `applyModelFamily(family, catalogIds)` (`@zibby/contracts`, table
`MODEL_FAMILY_PRESETS`), against the models `GET /ai-providers/engines` lists:

| Family   | haiku (1)                                 | sonnet (2) = default                            | opus (3)                            | fable (4)                                 |
| -------- | ----------------------------------------- | ----------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| claude   | `claude-agent/haiku`                      | `claude-agent/sonnet`                           | `claude-agent/opus`                 | `claude-agent/fable`                      |
| openai   | `openai/gpt-6-luna`                       | `openai/gpt-6.1-terra`                          | `openai/gpt-6.1-sol`                | `openai/gpt-6-astra`                      |
| opencode | `opencode/nemotron-3.5-lightning-free`    | `opencode/glm-5.3-flash-free`                   | `opencode/minimax-m3.1-flash-free`  | `opencode/nemotron-3.5-super-vl-free`     |
| bluecode | `bluecode/llmfactory:local:GLM-5.3-Flash` | `bluecode/llmfactory:local:DeepSeek-V4.1-Flash` | `bluecode/llmfactory:local:GLM-5.3` | `bluecode/llmfactory:local:Kimi-K3.1-Pro` |

`bluecode` is team.blue's internal LLM gateway (BlueCode), opt-in and billed to the project's
budget. It is configured in Settings → AI models (see [ai-providers.md](./ai-providers.md))
and injected as a custom opencode `provider` block into every per-run config.

Sources: claude = the `claude-agent` aliases in `opencode models`; openai = the repo's
`OPENAI_TEXT_MODELS` (cheapest to dearest). `opencode models` lists **no** `openai/*` model
until `opencode auth login openai`, so those ids are unverified against opencode; the free
ids are real catalog entries, ordered by judgment (lightning/small first, large
context/output last), not benchmarked. A tier whose id the catalog lacks is left unset
(`resolveTierModel` falls back); a missing default falls back to the resolved tier 2. A
family whose provider has no model in a readable catalog is **not applied**: the UI shows
`opencode auth login <provider>` (ZibbyOS never enters credentials). With an unreadable
catalog (binary missing or empty list) the preset is written as is and the UI says so.
The per-tier pickers stay for manual overrides. The usage widget follows the family: Claude
family = subscription limits first; the others show tokens and cost.

### Model tiers (A19/A20)

Every stored `model` (agent, phase, escalation rung, advisor) is an engine-independent
**tier**: `haiku` (1) < `sonnet` (2) < `opus` (3) < `fable` (4) (`ModelTierSchema` /
`MODEL_TIERS` in `@zibby/contracts`; chat's `ChatModelSchema` is the same enum). The
values are Claude's CLI aliases, so stored files didn't change and the claude engine
passes the tier as `--model` unchanged.

On opencode a tier is mapped through `SystemConfig.opencodeTierModels` by
`resolveTierModel(tier, tierModels, fallback)` (`@zibby/contracts`, so the web can show
the resolved model): the tier's own mapping, else the nearest mapped **lower** tier,
else the nearest mapped **higher** tier, else `opencodeModel`. An engine with fewer
models than tiers therefore never fails; with nothing mapped and no `opencodeModel` the
run is refused as before.

On every run path the mapping is checked against the live catalog (`opencode models`,
cached ~1 min): a mapped tier whose model is not listed counts as unmapped, so a family
without that tier falls back (lower first). An unreadable catalog trusts the mapping; an
explicit `engineModel` is never replaced.

`thinking` becomes a model **variant** on opencode (A26): when the resolved model has no
explicit `#variant` and opencode's catalog (`opencode api GET /api/model`, cached ~1 min)
lists a variant whose id equals the effective level (`escalation?.thinking ??
phase.thinking ?? agent.thinking`), the run uses `provider/model#<level>` (passed as
`opencode run -m provider/model#variant`). An explicit `#variant` in `engineModel`, the
tier mapping or `opencodeModel` always wins. A model without a matching variant (most
free `opencode/*` models, any model when the catalog can't be read) runs unchanged; a
catalog failure never fails the run. The recorded `engineModel` includes the variant
actually used. `GET /ai-providers/engines` lists each model's `variants`.

### Resolution

`resolveAiEngine(target, config)` (`apps/api/src/runner/ai-engine.ts`), where the target
is `{ engine?, engineModel?, model? }`:

- engine = `target.engine ?? config.aiEngine ?? "claude"`
- on opencode, model = `target.engineModel ?? resolveTierModel(target.model,
config.opencodeTierModels, config.opencodeModel)`

An agent run passes the agent. A workflow stage passes
`stageEngineTarget(phase, agent, escalationRung)`: `phase.engine ?? agent.engine`,
`phase.engineModel ?? agent.engineModel`, tier = `rung.model ?? phase.model ??
agent.model`. `phase.engine: "claude"` forces the native CLI with the tier alias.
Every run path (agent run, workflow stage and its `preflightEngines` check, chat,
one-shot) resolves through `resolveRunEngine(target, config)` (agent and workflow via
`ClaudeRunCommandService.resolveRunEngine`): `resolveAiEngine` with the `opencode models`
list passed to `resolveTierModel`, skipped for claude and an explicit `engineModel`
(todo-7). The sync `resolveEngine` stays for engine-only checks. The run records what it ran on:
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

| Env                                                                                   | Purpose                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCODE_CONFIG=<runsDir>/.opencode/<hash>.json` (0600)                              | the per-run config below, written by RunnerCore                                                                                                               |
| `OPENCODE_DISABLE_PROJECT_CONFIG=1`                                                   | a repo's `opencode.json` never loads (like `--setting-sources ""`)                                                                                            |
| `ZIBBY_GATE_NODE`, `ZIBBY_GATE_HOOK`, `ZIBBY_GATE_DEADLINE_S`                         | how the gate plugin runs the approval hook                                                                                                                    |
| `ZIBBY_GATE_CWD`                                                                      | the run's real spawn dir; the plugin judges paths against it, never against opencode's own cwd                                                                |
| `ZIBBY_GATE_LOG`                                                                      | the plugin's decision log (`<hash>.gate.log`), copied into the run log                                                                                        |
| `ZIBBY_MCP_SERVERS`, `ZIBBY_MCP_REGISTRY`, `ZIBBY_DENY_TOOLS`, `ZIBBY_SHELL_PREFIXES` | the run's MCP server ids, the registry subset (hook argv[3], A28 amendment), the tools the agent may not use, and the `Bash(<prefix>:*)` prefixes (see below) |
| `ZIBBY_GRANT_DIRS`                                                                    | grant dirs + context dir; opencode has no `--add-dir`. Always set (empty included)                                                                            |
| `PWD=<spawn dir>`                                                                     | opencode takes its project dir from `$PWD`, not the process cwd (verified 2.2.7); see below                                                                   |
| `OPENCODE_CLAUDE_PATH`                                                                | the `claude` binary for `claude-agent/*`: the API's `OPENCODE_CLAUDE_PATH` ?? `CLAUDE_BIN`; unset = `PATH`                                                    |

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

A run's MCP servers are the enabled registry rows plus (A27) the operator's own Claude Code
servers its `tools`/`toolGrants` name, mapped to `local` / `remote` entries the same way and
listed in `ZIBBY_MCP_SERVERS`; the registry subset rides `ZIBBY_MCP_REGISTRY`, which the
gate plugin hands to the hook as argv[3]. claude.ai connectors can't exist on opencode — they belong to
the Claude login (and don't load in claude-engine runs either, A29). Every MCP call outside
ZibbyOS's own servers and the run's registry servers is classified by the hook as
`mcp.read` / `mcp.write` (A28, `docs/api/runner.md`); registry servers keep the pre-A28
pass-through.

MCP servers with the id `opencode` or `browser` are never mounted on an opencode run: their
tools would be named like opencode's own `opencode_*` / `browser_*` tools, which the gate
always denies. The plugin ignores those ids in `ZIBBY_MCP_SERVERS` too.

### Not carried over

- the `--agents` delegation catalog: an opencode run (also under a global
  `aiEngine: "opencode"`) has no ZibbyOS agent roster. A delegation falls to opencode's
  built-in `general` subagent; its tool calls still go through the gate plugin (and are
  logged, see below),
- custom hooks,
- `--plugin-dir`s.

The phase advisor (`ask_advisor`) runs on the asking stage's engine since A32 (see
[One-shot calls](#one-shot-calls-a32)).

A stage logs `ℹ opencode stage: tier <tier> → <model>[#variant]`, suffixed
`(thinking "<level>" not supported by this model — no matching variant)` or
`(explicit variant "<v>" wins over thinking "<level>")` when the level did not apply.

`OPENCODE_BIN` overrides the binary. It is the test seam, like `CLAUDE_BIN`.

## The approval gate on opencode

The same gate as Claude, enforced in three layers:

1. **Fail-closed permissions.** The run uses `permissions: ask *` and never `--auto`. In
   headless mode, an asked permission that nobody grants is auto-rejected. If the plugin
   fails to load, every tool is refused. The config denies `execute`, `question` and the
   agent's missing tools (removed from the toolset).
2. **Gate plugin** (`apps/api/src/runner/opencode-gate-plugin/index.mjs`),
   `tool.hook("execute.before")`, **default deny**. Only these tools pass:

   | opencode tool                                                         | Claude event / decision                                                                                 |
   | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
   | `shell`, `bash`                                                       | `Bash`                                                                                                  |
   | `write`, `edit`, `read`, `grep`, `glob`                               | `Write`, `Edit`, `Read`, `Grep`, `Glob`                                                                 |
   | `list`, `ls`                                                          | `Glob` (`*` in the path)                                                                                |
   | `patch`, `apply_patch`                                                | one event per file: Add → `Write`, Update → `Edit`, Move to → `Write`, Delete → `Bash rm`               |
   | `task`, `subagent`                                                    | `Task`                                                                                                  |
   | `*ask_operator`                                                       | `mcp__zibby-run__ask_operator`                                                                          |
   | `<server>_<tool>` of a server in `ZIBBY_MCP_SERVERS`                  | `mcp__<server>__<tool>` (A28: `mcp.read` / `mcp.write` / a Never-rule action; a registry server passes) |
   | `webfetch`, `websearch`, `todowrite`, `todoread`                      | allowed without the hook (read-only / state tracking)                                                   |
   | anything else: `execute`, `skill`, `opencode_*`, `browser_*`, unknown | **denied**                                                                                              |

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

## One-shot calls (A32)

The API's internal single-prompt calls follow the engine too (A32, superseding A22's
"one-shots stay Claude"). They all go through `spawnOneShot`
(`apps/api/src/shared/spawn-one-shot.ts`): on `claude` it is exactly the old
`spawnClaudeCli` argv (`-p <prompt> --output-format json --model <tier>` + the caller's
own flags); on opencode it runs

```
opencode run --standalone --archived --format json -m <model> --agent zibby-oneshot \
  [--session <id> --fork] -- <prompt>
```

with the tier mapped like a run (`resolveAiEngine` → `resolveTierModel`, A20; the engine
is `SystemConfig.aiEngine`, the advisor's is its stage's). The output is turned into the
claude CLI's envelope `{ result, total_cost_usd, session_id }`, so every caller's parser is
unchanged: `result` = the last assistant step's text (a "let me look…" step before a tool
call never leaks into it), cost = the sum of `step_finish` costs. An `error` event, a
non-zero exit, the timeout or empty text reject; each caller keeps its own fallback.

| Caller                                                         | Tier                    | Timeout                   | opencode tools |
| -------------------------------------------------------------- | ----------------------- | ------------------------- | -------------- |
| task router `tasks/claude-cli-router.ts`                       | haiku                   | 15 s                      | none           |
| task namer `tasks/claude-cli-task-namer.ts`                    | haiku                   | 15 s                      | none           |
| briefer `briefing/claude-cli-briefer.ts`                       | haiku                   | 15 s                      | none           |
| channel triager `channels/triage/claude-cli-triager.ts`        | haiku                   | 15 s                      | none           |
| memory distiller `memory/claude-cli-distiller.ts`              | haiku                   | 30 s                      | none           |
| review learner `review-learning/review-comment.distiller.ts`   | haiku                   | 30 s                      | none           |
| chat handoff compaction `chat/chat-handoff.service.ts`         | sonnet                  | 120 s                     | none           |
| reply researcher `channels/reply-draft/reply-draft.service.ts` | sonnet                  | 300 s                     | `read-cwd`     |
| phase advisor `workflows/phase-advisor.service.ts`             | phase's `advisor.model` | stage MCP timeout − 2 min | `read-guarded` |

The per-call config (temp dir, 0600, deleted after the call) defines the `zibby-oneshot`
agent (a one-line "headless helper" system prompt) and the permissions:

- **none**: `* deny` + `external_directory deny`. No tool at all (live: `skill` →
  `Permission denied: skill`).
- **read-cwd**: `* deny`, `read` / `list` / `glob` / `grep` allow, `external_directory`
  deny, plus the gate plugin (the approval hook on every read: the operator-token dir).
  Verified live (2026-11-12, opencode 2.2.7, `claude-agent/haiku`): a read inside the
  repo works; an absolute read outside it, `../outside.txt`, and grep / glob on the
  parent dir all fail with `Permission denied: external_directory`. Ceiling: a symlink
  inside the repo that points outside is followed (the hook still refuses one into the
  token dir, it realpaths).
- **read-guarded** (advisor): like read-cwd, but `external_directory` allow (the claude
  advisor reads anywhere too, `--add-dir <run dir>`); the gate plugin's hook refuses the
  operator-token dir (live: `Blocked by the ZibbyOS gate: … read the operator token`).

The env is `agentSpawnEnv` (no inherited `OPENCODE_*`, project config off, `PWD` and
`ZIBBY_GATE_CWD` = the call's cwd, `OPENCODE_CLAUDE_PATH`); without a cwd the call runs in
its temp dir. `--archived` keeps the sessions out of opencode's session list. Under vitest
the opencode path refuses to start without `OPENCODE_BIN`.

Latency (this machine, 2026-11-12, `claude-agent/haiku`): native `claude -p --model haiku`
~2.3–2.5 s; opencode one-shot 2.8–4.3 s typical (n=12), outliers 7.4 s and 9.6 s. The
8 s callers (router, namer, briefer, triager) were raised to 15 s on both engines; a
timeout only means the deterministic fallback.

**Advisor on opencode.** The stage session is forked with `--session <id> --fork`
(verified: the fork knows the source session's context, gets a new id, and runs under
the new per-call config). A session forks only on its own engine (claude: `--resume
--fork-session`); across engines the advisor starts fresh. The fork needs the source
session's directory to still exist (`Location not found: …` otherwise → the existing
fresh retry). `thinking` rides the model variant (A26). Cost = summed `step_finish`
cost, so on `claude-agent/*` it is 0: that use shows in the Claude window, not in the
run's `budget` (the budget cap check is unchanged and never trips on it).

**Accounting.** One-shots are not recorded as runs on either engine, as before. On a
`claude-agent/*` mapping they spend the Claude subscription like the native CLI did; the
task scheduler still defers an unrouted task on an exhausted window (its router and its
target may be Claude).

## Claude usage limits

The 5-hour / weekly window belongs to the Claude subscription. It applies to every run
that spends it: the `claude` engine **and** opencode on a `claude-agent/*` model (A18).
`spendsClaudeSubscription(engine, model)` (`runner/ai-engine.ts`) is the one predicate.
Any other opencode model never waits on the window:

- RunnerCore does not scan its output for Claude limit lines;
- an errored run on it is never relabelled `paused-limit`;
- a workflow does not pause at a boundary before a stage none of whose attempts (first
  run and every escalation rung, resolved with the phase's own engine) is on Claude;
- the task scheduler does not defer a task whose known target is an agent on it or a
  workflow whose every agent phase is. A task without a target still defers: routing
  it needs the (Claude) classifier;
- the same targets skip `BudgetService`'s global Claude % ceiling
  (`pauseAtRollingPct` / `pauseAtWeeklyPct`, [budget.md](./budget.md)); per-project caps
  still apply.

A `claude-agent/*` run behaves exactly like a claude run in all four places. Not
verified live: the exact text Claude's limit error has inside opencode's JSONL (the
line scan relies on `detectLimit`); the snapshot-based reclassification of an errored
run does not depend on it.

## Operator token

Setting or changing the engine or model needs the operator token
(`x-zibby-operator-token`, 401 otherwise): `PUT /api/system/config` when `aiEngine`,
`modelFamily`, `opencodeModel` or any `opencodeTierModels` entry differs from the stored value, agent
create/update when `engine` or `engineModel` differs (`null` on an agent without an
override is not a change), and workflow create/update when a phase's `engine` /
`engineModel` differs from the stored phase with the same id (A21). Every other config /
agent / workflow edit stays open. An LLM-drafted agent proposal has `engine` /
`engineModel` stripped; nothing proposes workflows, and the chat self-API can't write a
workflow's `phases`.

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
