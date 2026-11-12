# AI providers (opencode) + Czech dictation — handoff

Goal (operator, 2026-11-12): connect ZibbyOS to opencode so the operator can choose which AI
(Claude, OpenAI, anything else) backs the agents; switch between AIs; show limits and usage per
AI. Second: Czech dictation inside ZibbyOS (earlier attempts failed; colleague suggested
`anomalyco/hex` or Warp). Everything on a separate branch. Decisions:
`ai-providers-dictation-decisions.md`.

- Branch: `feat/ai-providers-dictation`
- Worktree: `worktrees/ai-providers-dictation` (own `graphify-out` copy: graph.json + manifest only)
- Orchestration rule from the operator: Fable only plans the critical parts; implementation,
  review and web research go to opus / sonnet subagents.

## Work items

| #   | Item                                                         | Owner | Status      |
| --- | ------------------------------------------------------------ | ----- | ----------- |
| R1  | Research opencode (headless run, serve API, auth, usage)     | sonnet | done — see "opencode research" |
| R2  | Research Czech dictation (hex, Warp, whisper.cpp, cloud STT) | sonnet | done — see "Dictation research" |
| R3  | Map current runner / limits / voice code                     | sonnet | done — summarised in the decisions file |
| D1  | Design: provider switching + usage/limits per AI             | Fable | done — decisions A1–A12 |
| D2  | Design: Czech dictation                                      | Fable | done — decisions B1–B8 |
| I1  | Engine backend: contracts, resolution, opencode builder/stream, gate, endpoints | opus | implemented, uncommitted. Gate proven on a real run (deny blocks, allow passes; no `--auto`, fail-closed `ask` permissions + plugin calling `claude-approval-hook.mjs`). api + contracts typecheck clean; 464/467 related tests pass, the 3 failures (`autopilot pr-review gate`) also fail on clean `main`. Opus review: **NOT shippable yet** — verified gate bypass via opencode's `execute` (Code Mode) tool + `session_move`; agent `tools` allow-list not enforced; gate config writable in the free zone and not regenerated on resume; Claude limits pause opencode runs; no idle timeout for a silent run; `free` flag can mislabel paid models; `ZIBBY_GRANT_DIRS` regression for Claude. Fix round sent back to the opus implementer (in progress) |
| I2  | Dictation: contract, `SttService`, recorder hook, new-task mic, Electron mic permission | sonnet | implemented, uncommitted; e2e proof: Czech clip → exact transcript, 2.1 s cold / 0.5 s warm. Opus review: 11 findings, all fixed (tmp-dir for `--convert`, spawn `error` handler, lost transcripts, orphaned server, `clipboard-read` dropped, 180 s / 32 kbps cap). Uncommitted — waiting for I1 so the pre-commit typecheck sees a consistent tree |
| I3  | Engine UI: settings switch + model picker (free first), dashboard usage widget | sonnet | implemented, uncommitted (783/783 web-component tests, web typecheck clean, not viewed in a browser). Settings → AI models card, per-agent override, usage rows inside the Budgets widget (no separate widget type), engine shown on workflow stages only. Follow-up after I1 fixes: show engine in the dashboard run list once `TaskRun` carries it |
| V1  | Reviews, fixes, commit                                       | opus review + orchestrator | done — see "Resume notes" |
| T1  | Engine-independent model tiers + per-step engine/model (A19–A22) + budget % gate off Claude | opus | implemented, uncommitted (backend + contracts + docs; UI by another agent). See "Next" for what is not verified |
| C1  | opencode 2.2.7 `claude-agent` provider: gate proof, Claude limits for `claude-agent/*`, `OPENCODE_CLAUDE_PATH`, `subscription` flag, PWD fix (A18) | opus | implemented, uncommitted (backend + docs; UI in parallel). See "opencode 2.2.7 + Claude Agent" |
| C2  | Chat: operator MCP servers on claude (A23), chat on opencode (A24), fail-closed tool gating (A25) | opus | implemented, uncommitted (backend + contracts + docs; chat UI not touched). See "Chat on opencode (C2)" |

Installed on the machine (2026-11-12): `brew install whisper.cpp ffmpeg`; model
`~/Library/Application Support/ZibbyOS/models/ggml-large-v3-turbo.bin` (1.5 GB).

Open for manual check: the microphone prompt and MediaRecorder in a **packaged** ZibbyOS build
(not testable from here).

## Verified facts (local machine)

- **Now `opencode` v2.2.7** (2026-11-12, later the same day); the items below were
  first found on v2.0.12. Every CLI shape the engine relies on was re-checked on 2.2.7
  (see "opencode 2.2.7 + Claude Agent").
- `opencode` v2.0.12 was already installed at `/opt/homebrew/bin/opencode`; `opencode auth list`
  → "No authenticated integrations" (only the free `opencode/*` models are usable until the
  operator logs in).
- Headless run works without a TTY:
  `opencode run --format json -m opencode/big-pickle "…" < /dev/null` → JSONL on stdout, exit 0.
  Events seen: `{"type":"step_start","sessionID","part":{…}}`,
  `{"type":"text","part":{"type":"text","text":"pong"}}`.
- Flags: `--model provider/model#variant`, `--agent`, `--session/-s`, `--continue`, `--fork`,
  `--auto` (auto-approve permissions not explicitly denied), `--file`, `--title`, `--standalone`,
  `--server <url>`.
- `opencode stats --json [--days N|--all] [--models|--full]` → totals plus `models[]` with
  `{model:{id,providerID,variant},steps,tokens:{input,output,reasoning,cache:{read,write}},cost}`.
- V2 tool run confirmed (`--auto`, shell tool): event order `step_start` → `tool_use`
  (`part.tool`, `part.state:{status,input,output,title,metadata}`) → `step_finish`
  (`part.reason` = `tool-calls` | `stop`, `part.cost`, `part.tokens`) → `step_start` → `text`
  → `step_finish`. Usage per run = sum of `step_finish` parts.
- `opencode auth list --format json` → `[]`; `opencode api GET /api/provider` →
  `{"location":{…},"data":[]}` (no providers connected yet).
- `opencode models` lists `provider/model` ids, one per line.
- Not installed: `ffmpeg`, `whisper-server`, `hex`. Installed: `superwhisper.app`.

### Learned while building I1 (2026-11-12, opencode 2.0.12, `opencode/big-pickle`)

Each item below was checked with a real run. See `docs/api/ai-engines.md`.

- Without `--standalone`, `opencode run` connects to the background service
  (`opencode serve --service`) and ignores per-run config: `--agent zibby` fails with
  "Agent not found". `--standalone` is required.
- With `--standalone`, `OPENCODE_CONFIG=<file>` works, and so does
  `OPENCODE_CONFIG_CONTENT`. We use a file (0600, `<runsDir>/.opencode/`, rewritten before
  every spawn) so that MCP secrets stay out of the env that the agent's shell inherits.
- A project's `opencode.json` does load (an agent it defined was used).
  `OPENCODE_DISABLE_PROJECT_CONFIG=1` turns that off, and `OPENCODE_CONFIG` still applies.
- `agents.<id>{mode:"primary",system}` plus `--agent <id>` is honoured; `system` replaces
  the base prompt. `instructions: [<abs file>]` had no visible effect, so it is not used.
- Plugins are loaded with `plugins: [<abs dir>]`, where the dir contains `index.mjs`. The
  default export is `{id, async setup(ctx)}`, and no opencode package is needed. The plugin
  runs in the opencode process and inherits its env.
- `ctx.tool.hook("execute.before", e)`: `e = {tool, sessionID, agent, messageID, id, input}`;
  shell input is `{command[, workdir]}`. A throw blocks the tool: `tool_use` gets
  `status:"error"`, the message goes to the model, and the command does not run.
- `ctx.permission.hook("evaluate", e)`: `e = {sessionID, agent, action, resources, source,
  effect}`. It runs after `execute.before`. Setting `e.effect = "allow"` grants the call.
- `permissions: [{action:"*",resource:"*",effect:"ask"}]` without `--auto` and without the
  plugin auto-rejects every tool ("permission requested: shell …; auto-rejecting"). That
  makes the gate fail-closed.
- End-to-end gate proof through the shipped plugin and `claude-approval-hook.mjs`: `rm` of a
  file outside the free zone produced an `intent-request.json`
  (`{"action":"delete",…}`) in `ZIBBY_INTENT_DIR`.
  - A `deny` decision gave a `tool_use` error ("Blocked by the ZibbyOS gate: Blocked by the
    gate (denied).") and the file survived.
  - An `allow` decision deleted the file.
  - An `rm` inside the free zone was not gated, the same as Claude.
- In standalone mode the final `step_finish` is often not emitted; earlier ones are. Summed
  run cost can therefore miss the last step. `opencode stats` has all of them.
- `--session <id>` resumes across standalone runs, and `--` before the message works.
- An invalid model produces
  `{"type":"error","error":{"type":"provider.no-route","message":"Model unavailable: …"}}`
  and exit 1.
- `opencode models` has no pricing or verbose flag in V2. The free tier is the
  `opencode/*-free` ids plus `opencode/big-pickle`. `stats` shows big-pickle at
  `cost: 0`, `variant: "default"`. Prices do exist: `opencode api GET /api/model` (via the
  background service; `--standalone` returns `data: []`) lists `providerID` and
  `cost[{input,output,cache:{read,write}}]`, all 0 for the free `opencode` models.
- Twice, a standalone run produced no output at all and had to be killed (the log stops
  after "spawning process … serve --stdio"). Each time, the next run with the same setup
  finished in seconds, so treat it as provider or service flakiness. RunnerCore had no run
  timeout, so an opencode run now has an idle watchdog (`ZIBBY_OPENCODE_IDLE_MINUTES`,
  default 10, suspended while awaiting approval) that kills such a run as `error`. The
  deny proof was re-run with the final plugin and passed.

### opencode 2.2.7 + Claude Agent (C1, 2026-11-12, each item run live)

- Built-in provider **Claude Agent** (`claude-agent/*`: `haiku`, `sonnet`, `opus`,
  `fable`, `claude-sonnet-5`, …) runs the installed `claude` through the Claude Agent SDK
  on the Claude Code login. Connected by the operator with
  `opencode auth login claude-agent --method claude-login` (no secret entered). It
  supersedes the R1 note "Claude Pro/Max through opencode is prohibited" (A18).
- Unchanged on 2.2.7: `--version`, `models` (one id per line), `run --standalone
  --format json -m … --agent … --`, the JSONL events (`step_start` / `tool_use` /
  `step_finish` / `text` / `error`), `stats --json --days N --models` (same keys; a
  `claude-agent` row: `{"model":{"id":"haiku","providerID":"claude-agent","variant":"default"},…,"cost":0}`),
  `api GET /api/model` (`claude-agent` entries have `cost: []` on a subscription login).
  `auth list --format json` now returns `[{"id":"claude-agent","name":…,"connections":[…]}]`;
  `parseProviders` reads `id`. The real `AiEnginesService` on live output:
  `claude-agent/haiku {free:false, subscription:true}`, `opencode/big-pickle {free:true,
  subscription:false}`; both schemas parse.
- Gate on `claude-agent/haiku` with the real builder config + `agentSpawnEnv` + the real
  hook (and the same on `opencode/big-pickle`): denied `rm` outside the free zone → tool
  error "Blocked by the ZibbyOS gate: Blocked by the gate (denied).", file kept, log
  `⛨ gate shell rm … → denied: …`; allowed → file gone, `→ allowed`; both wrote an
  `intent-request.json` `{"action":"delete",…}`. Toolset (as Claude sees it,
  `mcp__opencode__<tool>`): no `execute`; a `tools: [read]` agent had only read / glob /
  grep / `opencode_*` / `skill` and no shell. `execute.before` gets the plain names
  (`shell`, `skill`, …).
- **2.2.7 still offers `skill`** although the config denies it (other denied tools are
  removed). The plugin refuses it: `⛨ gate skill → denied: the agent is not allowed to
  use "skill".`; `opencode_worktree_create` and `opencode_session_move` likewise denied.
- **opencode takes its project dir from `$PWD`**, not the process cwd. The inherited PWD
  (the API's dir) put every opencode session there (both models answered
  `…/apps/api` when spawned in a sandbox), while the gate plugin judges relative paths
  against `ZIBBY_GATE_CWD`. Fixed: `agentSpawnEnv` pins `PWD` to the spawn dir; re-run
  showed the sandbox path and `workdir` = sandbox. A relative-path bypass was inferred
  from this mismatch, not demonstrated.
- `OPENCODE_CLAUDE_PATH` is honoured: `/nonexistent/claude` →
  `{"type":"error","error":{"type":"provider.unknown","message":"Claude Code native binary not found at /nonexistent/claude. …"}}`;
  the real path (`~/.local/bin/claude`) works. The env strip of `OPENCODE_*` used to
  drop an operator-set value; it is now set from the API's
  `OPENCODE_CLAUDE_PATH ?? CLAUDE_BIN` after the strip.
- `step_finish.cost` is 0 on `claude-agent` (subscription), so run `costUsd` is 0.

### Chat on opencode (C2, 2026-11-12, opencode 2.2.7)

Run live, through the worktree API (port 3344, real `opencode` binary, real zibby MCP with
its bearer token):

- With a scripted OpenAI-compatible provider (`fake/m`, scratch harness): a turn answers;
  `zibby_get_status` is called and its result comes back (toolEvent `get_status` ok);
  `shell` (`touch /tmp/zibby-chat-pwned.txt`), `write` and `execute` are blocked with the
  gate message, and the file was not created; turns 2–5 run with `--session ses_…` and the
  model sees the earlier messages. The config file is mode 600 and is deleted after the turn.
  The toolset opencode offered the model: `skill` + 2 zibby-kb + 11 zibby tools, nothing else.
- Before the operator's servers were removed from opencode chat, the same toolset also
  carried 25 Playwright tools (`browser_run_code_unsafe`, `browser_file_upload`, …): the
  reason for the A24 deviation.
- `opencode/big-pickle`: a direct `opencode run` answered "pong" once. Every chat turn
  through the API then hit the **account-wide free limit** (`provider.free-limit`, 429, also on
  glm-5.3-flash-free, deepseek-v4.1-flash-free, minimax-m3.1-flash-free). The chat surfaced it as
  the SSE event `{"type":"error","message":"opencode: Free usage limit reached. …"}`.
  **The four proofs on big-pickle itself are not done**; rerun them when the limit resets.
- The A23 timing (claude, haiku) is in decision A23.

Not done / limits: operator servers on opencode (needs a per-tool allowlist or a gate path);
`skill` is still listed in the toolset (the plugin blocks it); an engine switch starts a fresh
session with no context carry-over; an `@agent`'s read-only tools are not allowed on opencode;
Claude chat's `mcp-config-*.json` files still stay in the chat dir (unchanged behaviour);
`disabledMcpServers` is judged for the turn's cwd (the project path, else the API's cwd); only
`${CLAUDE_PLUGIN_ROOT}` is expanded in plugin configs; OAuth HTTP servers don't authenticate
through `--mcp-config` (A23). The chat UI does not show `engine` / `engineModel` yet.

## opencode research (R1, web — unverified items marked)

- Two lines exist: V1 (v1.19.5, latest GitHub release) and V2 (what opencode.ai/docs documents).
  This machine runs **V2** (2.0.12). V2 renamed config keys (`agent`→`agents`, `prompt`→`system`,
  `permission`→`permissions`, `provider`→`providers`, MCP under `mcp.servers`) and moved
  credentials to SQLite `~/.local/share/opencode/opencode.db`.
- Headless `run`: permission prompts never hang — they are auto-rejected unless `--auto`
  (V1 source; V2 flag list has `--auto` too). The `question` tool is denied.
- JSONL event types (V1 source): `step_start`, `step_finish`, `tool_use`, `text`, `reasoning`,
  `error`; every line carries `sessionID`. `step_finish.part` has `cost` and
  `tokens:{input,output,reasoning,cache:{read,write}}`. V2 shape matched for `step_start`/`text`
  locally; `step_finish` on V2 still to be confirmed with a real run.
- Per-run config without touching files: env `OPENCODE_CONFIG_CONTENT` (inline JSON; define an
  agent with a system prompt + MCP servers, then `--agent <name>`). No `--system` flag.
- V2 HTTP API (`opencode serve` / `opencode api`): `POST /api/session`,
  `POST /api/session/{id}/prompt`, `POST /api/session/{id}/interrupt`, `GET /api/event`,
  `GET /api/provider`, `GET /api/model`. Prompt body is undocumented (unverified).
- Auth: `opencode auth login <provider> [--method key]`, `opencode auth list --format json`.
  `ANTHROPIC_API_KEY` etc. in the process env also work. OpenAI supports "Sign in with ChatGPT"
  (cost shows as 0 — counted against the plan).
- ~~**Claude Pro/Max through opencode is prohibited by Anthropic**~~ — outdated: opencode
  2.2 ships the Claude Agent provider (subscription via the Claude Agent SDK), see A18.
  The native `claude` CLI stays the default Claude engine.
- **No rate-limit / quota data** is exposed by opencode — only recorded tokens and cost
  (`opencode stats --json`). Plan limits for non-Claude providers cannot be shown as a
  percentage; show usage (tokens, cost, steps) instead.

## Dictation research (R2, web — unverified items marked)

- Web Speech API fails in Electron-style shells (`network` error: Google speech service is not
  available there) — the likely cause of the earlier failed attempts.
- Hex (`anomalyco/hex`, Rust beta, MIT): system-wide hold-hotkey dictation that pastes into the
  focused app; `brew install --cask anomalyco/tap/hex`. Also has a CLI (`hex dictation
toggle --print`, `hex model list`) and a local HTTP API (port + token in
  `~/Library/Application Support/hex/local-api.json`; `POST /transcriptions?model=&language=`
  with `audio/wav`). Czech support in the beta is unverified (Parakeet TDT v3 covers Czech).
- Warp voice = Wispr Flow (cloud, paid); nothing reusable outside Warp.
- Embedded option: whisper.cpp `whisper-server -m ggml-large-v3-turbo.bin -l cs --convert`
  (`POST /inference`, multipart `file`, returns `{"text"}`); non-WAV input needs `ffmpeg`.
- Cloud option: OpenAI / Groq `POST /v1/audio/transcriptions` accept MediaRecorder webm directly.

## Resume notes

- Commit with `PATH="$PWD/node_modules/.bin:$PATH" rtk git commit …`; on a self-knowledge drift
  block run `pnpm self-knowledge:generate` and retry (never `--no-verify`).
- Everything (dictation, engine backend, engine UI, docs) lands as one commit on
  `feat/ai-providers-dictation`; not pushed, no PR.
- Review history: dictation — one opus review (11 findings, all fixed). Engine — two opus review
  rounds (round 1: gate bypass + 10 more; round 2: gate verdict "ship", watchdog + 6 small), all
  fixed by the opus implementer and re-proven on a live free-model run.
- Known baseline failure: 3 tests in `autopilot pr-review gate` fail on clean `main` too.

## Next (not done in this run)

- C1 not verified: the exact text of a Claude limit error inside opencode's JSONL on
  `claude-agent/*` (the runner's limit-line scan relies on `detectLimit` matching it;
  the snapshot-based reclassification does not need it). Not tried: a real ZibbyOS agent
  run from the app on `claude-agent/*`. Installed Claude Code is 2.1.322 (needs ≥ 2.1.248); there
  is no version check in ZibbyOS — opencode reports the error.

- **Manual check in a packaged build** (`pnpm desktop:dist`): microphone prompt + MediaRecorder
  dictation in ZibbyOS.app; the UI (settings card, Budgets widget rows, run header) was never
  viewed in a browser.
- **Try a real agent run on opencode** from the app (set the operator token in Settings →
  General, pick a free model in Settings → AI models). Free models are weak at coding; quality
  on a real delivery task is untested.
- Chat follows the engine now (A24). The one-shot helpers (router, namer, briefing, triage,
  distiller, reply draft) still run on Claude (decision A3). A task without a known target is still deferred while Claude is
  exhausted, because the Claude classifier routes it.
- Not carried to opencode: `--agents` delegation catalog, custom hooks / plugin dirs, skills.
  Thinking now maps to the model's same-id variant when it has one (A26). Model escalation now works through the tier mapping (A20).
- T1 not verified: a full spawned workflow stage on a tier-mapped opencode model (only the
  resolver + the real `opencode models` preflight were run live on `opencode/big-pickle`);
  the UI for `opencodeTierModels` and phase `engine` / `engineModel`. The goal runner's
  budget check still applies Claude's % ceiling to an opencode maker (it doesn't resolve
  the maker's engine).
- opencode run `costUsd` can miss the last step (standalone mode sometimes omits the final
  `step_finish`); `/ai-providers/usage` reads `opencode stats` and is complete.
- Engine shown in run detail + Activity runs list; not in the dashboard Runs widget rows. The
  new-agent dialog shows a 401 only as the global toast.
- A dedicated dashboard widget type (`aiUsage` in the widget enum) instead of rows inside Budgets.
- Hex as a system-wide alternative: `brew trust anomalyco/tap` is the operator's call.
- To use paid providers later: `opencode auth login <provider>` in a terminal (ZibbyOS never
  enters credentials).
