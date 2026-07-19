# API — Chat (chat-first conversation)

ZIBBY's conversational layer — replaces the original Voice UI. The operator
types with ZIBBY in one ongoing thread; a single `claude` turn with tool use
decides whether to **answer / ask a follow-up / act**. Tasks fall naturally out
of the conversation.

**Module:** `apps/api/src/chat/` · **Contract:** `libs/contracts/src/chat/`
**Design spec:** `docs/superpowers/specs/2026-06-23-chat-ui-design.md`

## Endpoints

| Method       | Path                                   | Description                                                                                                                                                                                                                               |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`       | `/api/chat/messages`                   | Adds the operator's turn and starts the streaming reply. Body `{ conversationId?, text }` → `{ conversationId, turnId }` (returns immediately; tokens arrive over SSE).                                                                   |
| `GET`        | `/api/chat/transcript?conversationId=` | Plain read of the conversation transcript (`{ conversationId, sessionId, messages }`). Without `conversationId` → the active thread.                                                                                                      |
| `GET`        | `/api/chat/stream?conversationId=`     | **SSE** (raw `@Sse()`, outside ts-rest) — live tokens. Each `data` is a JSON `ChatTurnEvent`.                                                                                                                                             |
| `POST`/`GET` | `/api/chat/mcp`                        | In-process **MCP server** (Streamable HTTP) exposing ZIBBY's tools. Called by the spawned `claude` process, not the frontend — gated by `ChatMcpAuthGuard` (see below); `GET` is an unguarded 405 (no server-initiated streaming needed). |

### `ChatTurnEvent` (SSE payload)

```ts
{ conversationId, turnId, type: "delta", text }   // a token of visible text
{ conversationId, turnId, type: "tool", tool }     // dispatch notification (ChatToolEvent)
{ conversationId, turnId, type: "done", text }     // turn finished, final text
{ conversationId, turnId, type: "error", message } // turn failed
```

## Engine (`chat-session.service.ts`)

One turn = one spawn of the `claude` CLI (no API key, runs on the Max
subscription). The verified recipe (spike, see spec §7):

```
claude -p <msg> [--resume <sid>] \
  --setting-sources "" --tools "" --append-system-prompt <persona> \
  --output-format stream-json --include-partial-messages --verbose \
  --model sonnet --permission-mode dontAsk \
  --mcp-config {zibby:{type:http,url:.../api/chat/mcp}} --allowedTools mcp__zibby__*
```

- **Token streaming** requires `--include-partial-messages` (otherwise whole
  blocks arrive instead). The parser (`chat-stream-parser.ts`, pure) forwards
  only `text_delta`.
- **Continuity:** `--resume <sessionId>` keeps context; the session id persists
  per conversation and is passed again every turn (the server is stateless per
  turn).
- **Isolation:** `--setting-sources ""` loads no user/project/local settings, so
  global hooks/plugins (which could inject foreign context) never fire — but
  auth (keychain) still works. (`CLAUDE_CONFIG_DIR` breaks auth — do not use
  it.)
- **`--tools ""`** turns off every built-in tool (Bash/Write/Edit/…). ZIBBY
  chat is a conversational butler, not a coding agent — it may only act through
  the `zibby` MCP tools (`create_task` delegates the work to a pipeline).
  Without this, the model tries to build the app itself via Bash/Write instead
  of dispatching. (Verified with a live eval.)
- The model is overridable via `ZIBBY_CHAT_MODEL` (default `sonnet`).

## Tools (`chat-tools.service.ts` + `chat-mcp.controller.ts`)

An MCP server hosted directly in the API (`@modelcontextprotocol/sdk`,
Streamable HTTP, stateless), so services are injected — no second process.
Server id `zibby`:

| Tool             | Calls                                                       | Effect                                                                                                                                         |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_task`    | `TaskSchedulerService.createTask`                           | Classifies + dispatches a task. The run's outputs are still guarded by the gate layer.                                                         |
| `recall_memory`  | `VaultService.search`                                       | Index-first search over the vault.                                                                                                             |
| `get_status`     | `BriefingService.assemble`                                  | A "what's happening" summary (read-only).                                                                                                      |
| `machine_rename` | `MachineService` (via `ChatToolsService.proposeRename`)     | PROPOSEs a find/replace rename of files in a named folder — never renames itself; parks a Tier-3 machine approval (see `docs/api/machine.md`). |
| `open_maps`      | `MachineService` (via `ChatToolsService.proposeOpenMaps`)   | PROPOSEs opening Apple Maps with a search query — still approval-gated even though it only opens a window.                                     |
| `open_folder`    | `MachineService` (via `ChatToolsService.proposeOpenFolder`) | PROPOSEs opening a named folder in the operator's file manager — still approval-gated.                                                         |

### Auth on `/api/chat/mcp` (`ChatMcpAuthGuard`)

`POST /api/chat/mcp` carries a real tool surface (6 privileged tools) on an
all-interfaces bind (`main.ts`'s bare `app.listen(port)`), so it's locked down by
`ChatMcpAuthGuard` (`chat-mcp-auth.guard.ts`, added in `2e3dbf9`) — the first
NestJS `CanActivate` guard in this codebase. It enforces two checks independently
(both must pass):

1. `Authorization: Bearer <token>` compared against a per-boot token
   (`ChatMcpAuthService`) via `crypto.timingSafeEqual` (constant-time — the
   length-mismatch case is checked first so a wrong-length token 401s instead of
   throwing).
2. `req.socket.remoteAddress` must be a loopback address (`127.0.0.1`, `::1`, or
   the IPv4-mapped `::ffff:127.0.0.1`) — a request-level check scoped to this one
   route, not a global rebind of the server to loopback-only.

`GET /api/chat/mcp` (`rejectGet`) carries no tool surface, so it stays unguarded —
it only ever returns a 405.

**Dispatch is prompt-governed** (`chat-persona.ts`), not enforced in code — the
same layer where the old voice bug lived ("how are you" triggering a task). An
opt-in eval (`chat-dispatch.eval.test.ts`, `CHAT_EVAL=1`, needs a live API and
tokens) guards against regressions there.

The prompt has **two parts**: a swappable **persona** (tone only —
`CHAT_PERSONAS`) plus a constant **governor** (`CHAT_GOVERNOR_PROMPT`, the
answer/ask/act decision + tools). Every persona is layered on top of the
**same** governor, so dispatch discipline is invariant across personalities
(that's what the eval guards). `buildChatPrompt(persona)` assembles them;
`buildArgs()` reads the persona live from `SystemConfigStore`.

**Optional personality:** the operator picks a persona in `/settings` — saved
as `chatPersona` on the file-backed `SystemConfig` (`jarvis` (default) /
`concise` / `formal`). Read per turn, so it takes effect on the next
conversation without a restart (only the tone changes, not the behavior). The
change does not apply mid-way through a running `--resume` thread.

## Persistence + memory

- **Transcript:** append-only JSONL `data/chat/<conversationId>.jsonl` (one
  `ChatMessage` per line) + a sidecar `<id>.meta.json` holding the session id +
  `active.json` (a pointer to the active thread). `CHAT_DIR` env override.
- **Distillation:** the nightly `MemoryDistillerService` sweep also covers
  conversations — **incrementally** (a thread is long-lived): it distills only
  the messages past the `<id>.distilled.json` marker (a message count) and
  advances the cursor. Important facts flow into vault markdown the same way
  runs do.

## Web page (`/chat`, JARVIS style)

Chat is a routed dashboard page (`apps/web/app/(dashboard)/chat/page.tsx` →
`features/chat/Screen.tsx`, phase 23 — it used to be a `fixed inset-0`
fullscreen takeover mounted by `ChatProvider`'s `isOpen` flag; it is now a
normal page inside the shell, nav rail and top bar included). It keeps the
JARVIS-style surface (`ChatScreen`, `apps/web/features/chat/`): a
scanline/grid texture, an ambient orb map (`SubsystemOrbMap`, see
`docs/web/subsystem-orb-map.md`) behind the conversation, and a scrollable
transcript whose top edge fades out (a mask gradient) — older messages fade,
but you can still scroll back to the start.

- **The conversation lives in `ChatProvider`'s client state** (not refetched
  from `/transcript`): the operator's turn is added optimistically on send,
  the assistant's turn is added from the `done` stream event (the
  authoritative `done.text` plus the tool events collected along the way).
  The backend still writes every message to JSONL — the UI only renders what
  the stream/POST produced. This removed the flash where "history
  disappeared after the reply" (there was no longer a window for a refetch).
- **Preserved across navigation, reset by "New chat":** `ChatProvider` mints
  `conversationId` once, lazily, and keeps it as the operator leaves `/chat`
  and comes back (the provider sits above the route in `AppShell`, so it
  survives the page unmounting) — the same id keeps `--resume`-ing ZIBBY's
  `claude` session. Only "New chat" mints a fresh id and clears the
  transcript, starting a session with nothing to `--resume`.
- `GET /transcript` remains for a future resume/branch feature; `/chat`
  doesn't read it.

## MVP scope

One ongoing thread per browser session (ephemeral — lost on reload).
Branches/sub-threads and resuming an earlier thread from `/transcript` are a
deferred increment (spec §2).
