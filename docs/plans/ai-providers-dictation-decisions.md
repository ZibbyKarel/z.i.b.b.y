# AI providers (opencode) + Czech dictation — decisions

Research behind these: `ai-providers-dictation-handoff.md`.

## General

| #   | Decision                                                                                                   | Why                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D0  | Work on branch `feat/ai-providers-dictation` in `worktrees/ai-providers-dictation`, no push/PR until asked | Operator asked for a separate branch; overrides the usual "straight to main"         |
| D0b | Subagents do not commit; the orchestrator commits serially after review                                    | Parallel committers in one worktree sweep each other's files and race the hook       |

| D0c | **Everything must be free** (operator, 2026-11-12, mid-run: "nemusí to být lokální modely ale hlavně free"). No paid STT API, no paid model as a default; nothing that needs a new paid subscription | Operator's explicit constraint. Local whisper.cpp and opencode's free `opencode/*` models satisfy it |

## A — pluggable AI engine

| #   | Decision                                                                                                                                                                                                                                             | Why                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Two engines: `claude` (native `claude` CLI, unchanged) and `opencode` (`opencode run --format json`). opencode does **not** replace the Claude path (why superseded by A18)                                                                                                  | Anthropic prohibits Pro/Max subscriptions through opencode; the native CLI is the only way to keep using the subscription                  |
| A2  | Engine selection: `SystemConfig.aiEngine` (`claude` default) + `SystemConfig.opencodeModel` (`provider/model`); per-agent override `agent.engine` + `agent.engineModel`. Effective = agent override ?? global                                        | "Switch between AIs" globally with one control, yet allow e.g. only the Kodér on GPT                                                        |
| A3  | Scope v1 = agent runs and workflow agent stages (everything through `RunnerCore`). Chat and the haiku/sonnet one-shots (`spawnClaudeCli`: router, namer, briefing, triage, …) stay on Claude                                                          | Those are the "background agents" the operator asked about; one-shots rely on Claude's `{result}` envelope — a second pass if wanted        |
| A4  | The existing text-only `phase.openaiModel` stage stays as is                                                                                                                                                                                         | Different thing (single Responses call, no tools); removing it is not asked for                                                             |
| A5  | **The approval gate must hold for opencode runs.** Preferred: an opencode plugin/hook that calls the same gate decision as `claude-approval-hook.mjs` before each tool call. If V2 offers no such hook: run **without** `--auto` plus a static `permissions` config that allows only what the gate would allow and rejects the rest (fail closed). Never ship `--auto` without a gate | Law 1 (approval-first is structural) and Law 4. An engine switch must not be a way around the gate                                          |
| A6  | System prompt + MCP servers reach opencode per run through env `OPENCODE_CONFIG_CONTENT` (an ad-hoc agent + `--agent`), never by writing into the operator's `~/.config/opencode`                                                                    | Per-run, no shared mutable state, parallel runs cannot clash                                                                                |
| A7  | opencode selected but unusable (binary missing, no model set, model not in `opencode models`) → the run fails with a clear message. No silent fallback to Claude                                                                                     | A silent fallback spends the wrong budget and hides a misconfiguration                                                                      |
| A8  | Usage per AI: Claude keeps `/api/limits` (5h / weekly %). opencode gets usage only — tokens, cost, steps per `provider/model` from `opencode stats --json`, plus connected providers. No percentages for opencode providers                          | opencode exposes no quota or rate-limit data; inventing a percentage would be a lie                                                         |
| A9  | Run cost for opencode = sum of `step_finish.part.cost`; session id = `sessionID` on every line; resume = `--session <id>`                                                                                                                            | Verified locally on 2.0.12                                                                                                                  |
| A10 | Credentials: ZibbyOS never enters provider credentials. The operator runs `opencode auth login` themself; the UI only shows what is connected                                                                                                       | "Credential entry" is a Never-rule                                                                                                          |
| A11 | UI: engine switch + model picker in Settings → AI models; per-AI usage as a bridge dashboard widget (the dashboard is the only screen the operator uses). Header rings stay Claude-only                                                              | Put it where the operator looks                                                                                                             |

| A12 | The model picker marks free models (opencode's `opencode/*-free` and other zero-cost ids) and lists them first; paid providers appear only when the operator connected one themself | D0c — free must be the easy path, paid must be a deliberate choice |

| A13 | Gate for opencode = three layers: run config with `ask` for everything and **no `--auto`**; `deny` rules for `execute` (Code Mode), `question` and every tool missing from the agent's `tools` allow-list; a default-deny plugin that runs `claude-approval-hook.mjs` per tool call. Supersedes the `OPENCODE_CONFIG_CONTENT` idea in A6: the config is a 0600 file in `<runsDir>/.opencode/`, outside the agent's free zone, persisted in the run spec and rewritten before every spawn | Review proved a bypass through `execute` + `session_move`, and that a config inside the sandbox can be rewritten before a resume; env would leak MCP secrets to the agent's shell |
| A14 | `free` = provider `opencode` **and** an all-zero price list in opencode's model catalog; unknown = not free                                                                                                                                             | A zero cost in usage history also matches paid subscriptions (ChatGPT sign-in); D0c makes a wrong "free" label a real defect                |
| A15 | Changing `aiEngine` / `opencodeModel` or an agent's `engine` / `engineModel` needs the operator token (field-level 401); other settings saves are unchanged                                                                                          | An agent must not be able to move itself or another agent to a different engine or a paid model (Law 4)                                     |
| A16 | Claude's 5h / weekly windows never pause or defer an opencode run, stage or task with a known opencode target; opencode runs get an idle watchdog (`ZIBBY_OPENCODE_IDLE_MINUTES`, default 10)                                                         | Otherwise switching to opencode when Claude is exhausted would still run nothing; opencode occasionally hangs silently                      |
| A17 | With a global opencode engine the orchestrator is not pinned to Claude; it runs without the `--agents` catalog (delegation falls to opencode's own subagent, still gated)                                                                             | Pinning would silently keep spending Claude after the operator switched away                                                                |
| A18 | **Supersedes A1's "why"** (2026-11-12, opencode 2.2.7). Claude can now run through opencode's built-in **Claude Agent** provider (`claude-agent/*`), which drives the installed `claude` via the Claude Agent SDK on the operator's Claude Code login. The native `claude` engine stays the default. A `claude-agent/*` model spends the Claude subscription, so Claude's 5h / weekly limits apply to it exactly as to the claude engine (one predicate `spendsClaudeSubscription`, used by RunnerCore, agent runs, workflow stages and the task scheduler). The model picker marks it `subscription` (empty catalog price), not `free`. A10 is unchanged: the operator connects it themself with `opencode auth login claude-agent`. The gate was re-proven live on `claude-agent/haiku` | opencode now offers a sanctioned subscription path; A16 would otherwise let a `claude-agent` run ignore an exhausted window it is spending |

### Contract sketch (A)

```ts
// system.schema.ts
aiEngine: z.enum(['claude', 'opencode']).default('claude')
opencodeModel: z.string().default('') // "provider/model"

// agent.schema.ts
engine: AiEngineSchema.optional()
engineModel: z.string().optional()

// ai-providers.contract.ts
GET /api/ai-providers/engines ->
  { engines: [
      { id: 'claude', available, version },
      { id: 'opencode', available, version, providers: string[], models: string[] } ] }
GET /api/ai-providers/usage?days=30 ->
  { opencode: { available, totals: Usage, models: [{ providerId, modelId, ...Usage }] } }
// Usage = { steps, costUsd, tokens: { input, output, reasoning, cacheRead, cacheWrite } }
```

## B — Czech dictation

| #   | Decision                                                                                                                                                                                                 | Why                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| B1  | Root cause of the earlier failures: Web Speech API needs Google's cloud service, which Electron does not have (`network` error), and the packaged app has no `NSMicrophoneUsageDescription` / permission handler | Found in `apps/desktop` (no mic wiring at all) and `useSpeechRecognition` (maps everything to `network`)                    |
| B2  | Embedded, local STT: whisper.cpp `whisper-server` with `ggml-large-v3-turbo`, language `cs`, behind `POST /api/speech/transcribe`                                                                        | Works offline, free, good Czech; mirrors the existing `speakd` TTS proxy pattern in `api/speech`                            |
| B3  | The API spawns `whisper-server` lazily on the first transcription when the binary and model exist; `WHISPER_URL` overrides to an external daemon. Missing → `GET /speech/status` reports STT unavailable | No daemon for the operator to babysit; the UI can hide the mic instead of failing                                           |
| B4  | Web: record with `MediaRecorder`, transcribe on stop (no live interim text). Used when the backend reports STT available; Web Speech stays as fallback in a plain browser                                | Smallest change that works in Electron; streaming partials are a later nicety                                               |
| B5  | Audio conversion via `ffmpeg` (`whisper-server --convert`)                                                                                                                                               | MediaRecorder yields webm/opus or mp4/aac depending on the engine; whisper wants WAV                                        |
| B6  | Desktop: add `NSMicrophoneUsageDescription` and a permission handler that grants `media` only to the app's own origin                                                                                    | Required for any mic use in the packaged app                                                                                |
| B7  | Mic also on the new-task input, not only the chat dock                                                                                                                                                   | The operator works from the dashboard                                                                                       |
| B8  | Hex / Wispr Flow are not integrated. Hex remains a zero-code system-wide alternative the operator can install themself (its brew tap needs `brew trust`)                                                 | System-wide tools paste into any input without code; trusting a third-party tap is the operator's call                      |

Model path: `~/Library/Application Support/ZibbyOS/models/ggml-large-v3-turbo.bin` (override
`WHISPER_MODEL`).
