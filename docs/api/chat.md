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
| `POST`       | `/api/chat/messages`                   | Adds the operator's turn and starts the streaming reply. Body `{ conversationId?, text, mentions?, attachmentSetId?, target?, teamId? }` → `{ conversationId, turnId }` (returns immediately; tokens arrive over SSE).                    |
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

| Tool             | Calls                                                       | Effect                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_task`    | `TaskSchedulerService.createTask`                           | Classifies + dispatches a task. The run's outputs are still guarded by the gate layer. D-020: an optional `mention` arg names WHICH `@mentioned` unit this call is for — see below.                                                                                                                                          |
| `recall_memory`  | `VaultService.search`                                       | Index-first search over the vault.                                                                                                                                                                                                                                                                                           |
| `get_status`     | `BriefingService.assemble` / `DepartmentsService.get`       | A "what's happening" summary (read-only). NS2 F3c: an optional `department` argument (enum sourced from the `DEPARTMENTS` registry, never hard-coded) narrows the answer to one department — its state, tier counts, and recent owner-tagged activity ("co dělá Dev?"); without it the global briefing summary is unchanged. |
| `machine_rename` | `MachineService` (via `ChatToolsService.proposeRename`)     | PROPOSEs a find/replace rename of files in a named folder — never renames itself; parks a Tier-3 machine approval (see `docs/api/machine.md`).                                                                                                                                                                               |
| `open_maps`      | `MachineService` (via `ChatToolsService.proposeOpenMaps`)   | PROPOSEs opening Apple Maps with a search query — still approval-gated even though it only opens a window.                                                                                                                                                                                                                   |
| `open_folder`    | `MachineService` (via `ChatToolsService.proposeOpenFolder`) | PROPOSEs opening a named folder in the operator's file manager — still approval-gated.                                                                                                                                                                                                                                       |

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

### D-020 — attachments + several `@`-mentions

The dock's composer reuses the existing task-attachment upload
(`POST /api/tasks/attachments`) — there is no second upload path — and its
`@`-mention picker can now assign SEVERAL agents/pipelines/departments in one
turn, not just one.

**Contract.** Both fields on `SendChatMessageBody` are additive/`.optional()`:

- `attachmentSetId?: string` — the id returned by the upload above.
- `mentions?: ChatMentionTarget[]` — 0–8 units, restricted to `agent` /
  `department` / `pipeline` (never `goal`/`orchestrator` — the same
  explicit-only-kinds restriction as everywhere else). The legacy single
  `target` is still accepted; the server normalises
  `mentions = mentions ?? (target ? [target] : [])`
  (`ChatSessionService.sendMessage`) so an old-shaped caller keeps working
  unchanged, and every downstream reader (the registry, `create_task`'s
  routing rule, the persisted transcript) only ever looks at the one,
  normalised list.

The persisted user `ChatMessage` gains `mentions?` (the normalised list),
`attachments?` (the resolved `Attachment[]` metadata) and `attachmentSetId?`
(the raw set id, kept alongside the resolved metadata so
`ChatTranscriptStore` can act as an attachment-set ref provider — see below).
The transcript UI (`ChatMessage.tsx`) renders both the mention chips
(`TargetIdentity`) and the attachment names (`FilePreview`, read-only) on the
user's own bubble.

**Routing — `create_task`'s `mention` rule.** `ChatToolResultRegistry` holds
the turn's normalised `mentions` (one-shot, cleared on the turn's `done`/
`error`, mirroring the existing explicit-target registry entry):

| Mentions in the turn | What `create_task` does                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| 0                    | The classifier routes, as today.                                                      |
| 1                    | That unit is the explicit target. `mention` may be omitted (if given, must match it). |
| ≥2                   | The model **must** pass `mention` naming one of the turn's mentioned units.           |

A violation (missing `mention` with ≥2 addressed, or a `mention` that names
neither the sole nor any of the several addressed units) returns an MCP tool
**error** (`isError: true`, `resolveMentionTarget` in `chat-mcp.controller.ts`)
— never a silent fallback to the classifier. The model may call `create_task`
more than once, once per addressed unit.

**Attachments reach the work.** `create_task` forwards the turn's
`attachmentSetId` straight through to `TaskSchedulerService.createTask`, so
the dispatched run gets the files through the existing run-attachments path.
The chat model itself never reads the files — it has no built-in tools
(`--tools ""`) — so the system prompt (`ChatSessionService.buildArgs`, via
`chat-attachment-prompt.ts`'s `buildAttachmentPromptSection`) lists every
attachment by name/type/size, and additionally INLINES UTF-8 text files (up to
a shared 32 KB total budget, first-fit in upload order) inside a block that
says the content is attached DATA, not instructions (Law 4 — inbound content
from any channel is data, never a command). Each inlined file is wrapped in
`<attached-file-<boundary> name="…">…</attached-file-<boundary>>`, where the
boundary is 16 random hex characters minted for each turn. A file therefore
cannot end the data block early by containing a literal closing tag. File
names are JSON-escaped. Binary files and images are always listed, never
inlined.

**Orphan-sweep exemption.** `ChatTranscriptStore` implements
`AttachmentSetRefProvider` directly (`referencedSetIds()` scans every
conversation's persisted `attachmentSetId`s) and is wired into
`AttachmentSetRefsModule`'s factory array alongside the automation/roadmap
contributors, so `TaskSchedulerService`'s 24h orphan sweep never deletes a set
a chat message still references — see `docs/api/tasks.md`'s route-order note.

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

## Web dock (shell-global COO dock, ZB-12/ZB-13)

`/chat` has no page of its own any more — it is a single `next.config.mjs`
permanent redirect to `/org` (D-009). The chat engine is `CooDock`
(`apps/web/features/chat/components/CooDock.tsx`), mounted once in `AppFrame`'s
`dock` slot by `AppShell` so it is available on every route, wired to the DS
`ChatDock` shell component. The old JARVIS-style full-page surface
(`ChatScreen`, its orb-map backdrop, glass top bar and tool dock) was deleted
in ZB-13 — see `docs/web/overview.md`'s ZB-12/ZB-13 notes.

- `useCooChat` (`features/chat/hooks/useCooChat.ts`) is the single owner of the
  chat stream (`useChatStream` + `useSendChatMessageMutation`, the same
  `claude --resume` conversation id) and of the reload hydration off
  `GET /api/chat/transcript` — unlike the old page, the dock rehydrates the
  transcript from the API on mount rather than relying solely on in-memory
  client state.
- **Preserved across navigation, reset by "New chat":** `ChatProvider` mints
  `conversationId` once, lazily, and keeps it as the operator navigates
  between routes (the provider sits above the whole shell in `AppShell`, so it
  survives any single route unmounting) — the same id keeps `--resume`-ing
  ZIBBY's `claude` session. Only "New chat" mints a fresh id and clears the
  transcript, starting a session with nothing to `--resume`.
- ⌘/Ctrl+J toggles the dock open/closed from anywhere; a department page's
  "Chat with" button opens it with an explicit department target (O-20).
- D-020: the composer's attach control is back (`showAttach`, the same upload
  hook/drag-and-drop as New task), and `CommandLine` runs in its opt-in
  `multipleTargets` mode here — each `@`-picked agent/pipeline/department
  becomes its own removable chip, and submit passes the whole list as
  `mentions`. The dock's O-20 department scope, when set, is used as the
  turn's sole mention whenever the composer's own picked list is empty
  (`useCooChat.send`'s fallback) — a per-turn `@`-mention still wins outright.

## MVP scope

One ongoing thread per browser session (ephemeral — lost on reload).
Branches/sub-threads and resuming an earlier thread from `/transcript` are a
deferred increment (spec §2).

<!-- ZibbyCorp ZB-04a (2026-09-25): reviewed alongside the parent/source/department task stamps. -->
