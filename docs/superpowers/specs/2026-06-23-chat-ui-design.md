# Chat UI — Design Spec

> Date: 2026-06-23 · Status: approved (brainstorm) · Replaces: Voice UI

## 1. Goal

Replace the Voice UI with a **chat-first conversational layer** for ZIBBY. The
operator types (or speaks later — out of scope now) to ZIBBY about anything. ZIBBY
analyzes each turn with a single `claude` turn that has **tool-use**, and decides
inline whether to:

- **answer** — just talk / report,
- **ask** — request clarification in the chat, or
- **act** — create a task that flows naturally out of the conversation (automation
  creation is a fast-follow tool, see §4.2).

The conversation is the second-brain surface: salient facts are distilled into vault
memory over time. The tone is a **warm, witty butler** (🎩), not robotic.

### Today's pain this fixes

Asking ZIBBY "how are you?" in the current Voice UI immediately launches a task
instead of replying. The new design makes conversation the default and action a
deliberate, tool-mediated decision.

## 2. Scope

### In scope (MVP)

- A single, endless conversation thread (second-brain style).
- Conversational engine: persistent `claude` CLI session with streaming + tool-use.
- Tools: `create_task`, `recall_memory`, `get_status` / `brief`.
- Text input as the primary input; token-level streamed responses.
- Inline announcement when ZIBBY dispatches a task (with a link into the runs feed).
- JSONL persistence + distillation into vault memory via the existing distiller.
- Fullscreen overlay UI (reuses the Voice mount slot), HUD stays the home surface.
- Warm-butler persona via system prompt.

### Out of scope (explicit future increments)

- **Branches / sub-threads.** The operator wants "one thread + branches" eventually,
  but neither the engine (CLI sessions don't natively fork) nor the UI (a fullscreen
  overlay has no obvious place for sub-threads) has a solved mapping. MVP ships a
  single thread; branches are a **deferred increment with an unsolved session/UI
  mapping** to be designed separately.
- **Voice (STT/TTS).** Removed entirely now; may return later on top of the chat.
- **Multiple named conversations (ChatGPT-style thread list).** Not in this design.

## 3. What gets removed

Deleting the Voice UI is a clean, bounded operation (verified by exploration).

**Delete entirely:** `apps/web/features/voice/` — `VoiceContext`, `VoiceScreen`,
`VoiceOrb`, `VoiceTranscript`, `VoicePanel`, `VoiceButton`, `ShortcutCapture`, hooks
(`useSpeechRecognition`, `useSpeech`, `useVoiceSession`, `useVoiceDemoSequence`,
`useUtteranceDispatch`, `useVoiceData`), pure logic (`parseUtterance`,
`runVoiceAction`, client `briefing.ts`, `shortcut.ts`, `voicePreference.ts`) + all
`*.test.*`.

**Edit (coupling points):**
- `apps/web/components/layout/AppShell/AppShell.tsx` — remove `VoiceProvider` wrapper
  and `voiceSlot`; keep `NewTaskProvider` outer.
- `apps/web/components/layout/MainLayout/MainLayout.tsx` and `TopBar/TopBar.tsx` —
  remove `voiceSlot` prop plumbing.
- `apps/web/features/settings/Screen.tsx` — remove voice shortcut + voice-picker rows.
- `apps/web/features/settings/components/VoiceVoiceSetting.tsx` (+ test) — delete.
- `apps/web/features/tasks/voiceTaskSeam.test.tsx` — delete. The `initialText` seam on
  `NewTaskDialog` may stay (harmless).
- Test infra: `vitest.setup.tsx`, `test/speechRecognitionMock.ts`,
  `test/speechSynthesisMock.ts`, `vitest.components.config.ts` — clean speech mocks.
- i18n: `i18n/messages/{cs,en}.json` — remove `nav.voice*`, the `voice.*` block, and
  settings `voice*` keys.

**Kept and reused (shared infra, untouched):**
- Classifier: `apps/api/src/tasks/task-classifier.service.ts` + `claude-cli-router.ts`.
- `createTask` / `classifyTask`: `libs/contracts/src/tasks/tasks.contract.ts`,
  `apps/api/src/tasks/tasks.controller.ts`, web mutations
  `features/tasks/mutations/useCreateTaskMutation.ts`, `useClassifyTaskMutation.ts`.
- Briefing backend: `apps/api/src/briefing/*` (`briefing.service.ts`,
  `claude-cli-briefer.ts`, `briefing-assembly.ts`), contract
  `libs/contracts/src/briefing/briefing.contract.ts`.
- Run feed: `apps/web/features/runs/queries/useRunsQuery.ts` (SSE-fresh).

## 4. Architecture

### 4.1 Engine — persistent `claude` CLI session

The conversational turn is powered by the **`claude` CLI**, consistent with the whole
system (no `@anthropic-ai` SDK, no API key, runs on the Max subscription).

- Each user message spawns `claude -p --resume <sessionId> --output-format
  stream-json <message>` (first turn omits `--resume` and captures the returned
  session id).
- stdout (stream-json) is parsed and **streamed token-by-token to the browser over the
  existing `/api/events` SSE channel**.
- The server stays **stateless per turn**: the session id is persisted to disk
  (files = source of truth) and replayed on the next turn. This matches the existing
  one-shot spawn idiom, extended to multi-turn.

> ⚠️ **Load-bearing assumption — must be spiked before the plan finalizes.**
> Everything in the repo today is one-shot (`claude -p --output-format json`, 8s
> timeout, parse-and-exit). A resumable streaming chat is a different mode. See §7.

### 4.2 Tools — MCP over existing run-extensibility plumbing

ZIBBY's chat tools are exposed as an **MCP server** loaded into the claude session via
`--mcp-config`, reusing the **existing run-extensibility MCP wiring** (the
`mcp__id__*` allowlist pattern already built for `claude -p` runs — do not invent new
stdio→HTTP plumbing; model it on that).

MVP tools (each backed by an existing ts-rest endpoint):
- `create_task(text, paths?)` → `POST /api/tasks` (classify + dispatch).
- `recall_memory(query)` → vault search (index-first).
- `get_status` / `brief` → `GET /api/briefing` (assemble) for "what's happening".

Fast-follow (not MVP-blocking): `create_automation` → the automations endpoint, once
the task path is proven. Listed here so the system prompt and tool registry are
designed to extend cleanly.

The chat does **not** get a separate classifier call — `create_task` already
classifies internally. A read-only `classify` may be used by the model to preview a
target before deciding to dispatch, but is not required.

### 4.3 Dispatch behavior — prompt-governed, not enforced

"Model decides by confidence" is **not a confidence dial**. It is entirely the system
prompt + tool descriptions instructing the model: clear imperative ("build X", "fix
Y") → call `create_task` and announce inline; ambiguous / musing → ask in the chat,
dispatch nothing.

This is the **same surface where today's bug lives**. Honest consequences:
- Dispatch reliability is **prompt-governed**, so budget for iterating the prompt.
- Add a **cheap eval**: a small set of utterances that must NOT dispatch ("how are
  you?", "what's up?") and a few that must ("build a landing page for X").

Downstream safety is unchanged: any run's **outputs (PR/push) remain gated** by the
existing scheduler/gate layer. Chat dispatch only affects when a run *starts*, and the
operator typing directly is the highest-trust (directed) path.

### 4.4 Persistence

- **Raw transcript:** append-only JSONL in the data dir (same idiom as runs/activity
  logs) — structured, fast, easy to render and to pair tool-calls with results.
- **Distillation:** the existing memory distiller (`claude-cli-distiller.ts`) promotes
  salient facts from the transcript into vault markdown memory, so the chat feeds the
  second brain over time.

### 4.5 Persona

Warm, witty butler — Jarvis/Alfred energy: personal, dry humor, concise, anticipates;
🎩; cs as primary locale (en supported). Lives in the system prompt. Reference reply:

> U: jak se máš? → ZIBBY: Děkuji za optaní — systémy běží, fronta čistá, nic nehoří.
> 🎩 Spíš — co vás dnes trápí? Rád se do něčeho pustím.

## 5. UI

- **Placement:** fullscreen overlay, reusing the Voice mount slot. `VoiceContext` →
  `ChatContext` (open/close toggle, keyboard shortcut, renders `<ChatScreen>`
  overlay). HUD/runs feed remains the home surface.
- **Input:** a text composer is the primary input (operator's explicit request).
- **Streaming:** assistant responses render token-by-token as they arrive over SSE.
- **Dispatch surface:** when ZIBBY calls `create_task`, the chat shows an inline
  "spustil jsem úkol X" line linking into the runs feed — no modal, no card.
- **Components (DS-composed, no raw Tailwind in app):** `ChatScreen`, `ChatComposer`,
  `ChatTranscript` / `ChatMessage`, a streaming-cursor affordance. Selectors via
  `data-testid` per DS conventions.

## 6. Data flow (one turn)

```
operator types ─▶ POST message ─▶ api spawns `claude -p --resume <sid> --stream-json`
                                       │
                          stdout (token deltas + tool calls)
                                       │
   ┌───────────────────────────────────┴───────────────────────────┐
   ▼                                                                 ▼
tool call (create_task/recall/brief)                         text delta
   │ via MCP → existing ts-rest endpoint                            │
   ▼                                                                 ▼
result back to claude                              SSE ─▶ browser renders token
                                       │
                          turn ends ─▶ append JSONL ─▶ (later) distiller → vault
```

## 7. De-risking spike (first plan step — blocks plan finalization)

Before the implementation plan crystallizes around the CLI engine, run a ~30-minute
spike (precedent: the verified "Claude runner flags" spike) to confirm:

1. **Token-level streaming** — does `--output-format stream-json` emit incremental
   *text deltas*, or whole assistant messages? (If message-level only, the
   "non-robotic, streams as it thinks" feel is lost → reconsider engine.)
2. **Session continuity** — does `--resume <sid>` reliably thread multi-turn in print
   mode and hand back a session id to persist per turn?
3. **Per-turn latency** — cold-spawn + mcp-config load + session replay, per message.
   Multi-second latency is its own robotic feel; measure it.
4. **Tool-call** — a `--mcp-config` tool invocation completes mid-conversation.

**Pivot criterion:** if (1) fails (no token streaming), reconsider the engine
(streaming SDK vs. accepting message-level chunks) before building UI on top.

### 7.1 Spike results (2026-06-23) — engine STANDS, no pivot

CLI version 2.1.186. Findings:

1. **Token streaming — CONFIRMED, but requires `--include-partial-messages`.**
   Default `--output-format stream-json` emits *block/message-level* events (the whole
   assistant text arrives in one event). Adding `--include-partial-messages` produces
   true token-level `stream_event` → `content_block_delta` → `text_delta` chunks.
2. **Session continuity — CONFIRMED.** Turn 1 returns a `session_id`; `--resume <sid>`
   on turn 2 threads context (remembered a fact) and returns the **same** session id.
   Clean stateless-server pattern: persist one session id per conversation, resume each
   turn.
3. **Latency** — cold spawn TTFT ~2.7–4.4s on Opus (incl. thinking + SessionStart
   hooks). Pin `--model sonnet` for the chat to cut latency/cost; consider suppressing
   extended thinking for snappier turns.
4. **MCP tool-call — CONFIRMED under the isolated chat config (re-spiked 2026-06-23).**
   run-extensibility uses the heavy `ClaudeRunCommandService` path WITH full
   `--settings`; the chat uses `--setting-sources ""`, so the tool path needed its own
   proof. Ran the exact chat recipe (`--setting-sources "" --permission-mode dontAsk
   --allowedTools mcp__everything__* --mcp-config <stdio npx server>`) against the MCP
   reference `@modelcontextprotocol/server-everything`: the model called
   `mcp__everything__echo`, the tool result returned, and the model used it in its
   reply. tool-use round-trips under isolation. Tools server itself = HTTP transport
   hosted in the api (`@modelcontextprotocol/sdk`, `{type:"http",url}` mcp-config) so
   `TasksService`/`BriefingService`/`VaultService` inject directly — no second process.

**Confirmed engine recipe:**
```
claude -p "<message>" [--resume <sid>] \
  --setting-sources "" \
  --append-system-prompt "<ZIBBY persona>" \
  --output-format stream-json --include-partial-messages --verbose \
  --model sonnet --permission-mode dontAsk \
  --mcp-config <chat-tools-json> --allowedTools mcp__zibby__*
```
Parse stdout JSONL: capture `session_id` from the `system/init` event; forward only
`content_block_delta` with `delta.type=="text_delta"` to SSE (skip `thinking` /
`signature_delta`); capture `tool_use` events for dispatch announcements; the final
`result` event carries full text + cost for persistence.

> ⚠️ **Isolation — solved via `--setting-sources ""` (verified), NOT `CLAUDE_CONFIG_DIR`.**
> A bare `claude -p` spawn fires the operator's **global hooks/plugins** (superpowers
> injected "You have superpowers" context) — foreign context that pollutes ZIBBY's
> persona. Spiked two isolation options:
> - `CLAUDE_CONFIG_DIR=<clean>` → **breaks auth** ("Not logged in"); credentials live
>   in the operator's config dir / macOS keychain. ✗
> - `--setting-sources ""` → loads **no** user/project/local settings (skips hooks,
>   plugins, skills, CLAUDE.md) but **keeps auth** (keychain) and honors explicit
>   `--mcp-config` / `--append-system-prompt`. Verified: 0 hook events, token deltas
>   still flow, auth intact. ✓ **This is the isolation mechanism.**

## 8. Testing

- Pure logic (transcript reducer, dispatch-eval harness) unit-tested.
- Web components under the existing web-components vitest project + provider harness;
  selectors via `data-testid`.
- The dispatch eval (§4.3) as a small fixture-driven test.
- Removal verified: full `pnpm lint && pnpm typecheck && pnpm test` green after the
  voice deletion + chat addition.

## 9. Open questions / risks

- **Spike outcome (§7)** is the top risk; it can force an engine pivot.
- **Branches** mapping (deferred) — session forking + overlay placement unsolved.
- **Prompt tuning** for dispatch discipline will need iteration; the eval guards it.
- **Latency** UX — if turns are slow, may need an optimistic "thinking" affordance and
  to keep the session warm.
