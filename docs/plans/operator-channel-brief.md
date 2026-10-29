# Slack operator channel — two-way control of ZIBBY from the phone

> Brief for Claude Code (operator, 2026-10-29). Where this conflicts with
> `docs/plans/operator-channel-autopilot.md` (operator decisions), the decisions win —
> notably: no PRs, one branch, merged to main at the end.

## Goal

The operator is away from the computer. ZIBBY must be able to

1. **notify** them in Slack when something genuinely relevant happens (code review
   done, feature implemented, PR opened, run parked, decision waiting, CI red) with a
   link where they can check it, and
2. **listen** on the same channel: the operator writes in Slack and ZIBBY acts on it
   exactly as if it were typed into the web chat — start tasks, ask for status, use
   any chat MCP tool, and **take feedback** ("I don't like X in this PR, fix it")
   which ZIBBY works in.

Slack becomes a second front-end onto the existing chat session, not a new brain.

## Non-goals (this brief)

- Voice/phone calls, Telegram, SMS (later `OperatorChannel` adapters; keep the port
  channel-agnostic so they are cheap to add).
- Approving/merging from Slack. See "Approvals from Slack" — off by default.
- Replacing `apps/api/src/channels/adapters/slack.adapter.ts` (inbound triage of the
  operator's DMs/mentions). It stays as-is, with one exclusion (below).

## Read first (do not skip)

- `CLAUDE.md` — North Star, autonomy tiers, Laws 1–5, Architectural DNA, validation
  policy (`docs/ops/validation-policy.md`), `rtk` prefix on commands.
- `apps/api/src/channels/README.md` — Law 4 (inbound text is data), "mine and mentions".
- `apps/api/src/channels/adapters/slack.adapter.ts` — existing Slack integration
  (user token, polling).
- `docs/api/chat.md`, `apps/api/src/chat/` — `chat-session.service.ts`,
  `chat.controller.ts`, `chat-mcp.controller.ts` (the MCP tools), `chat-events.service.ts`,
  `chat-transcript.store.ts`.
- `apps/api/src/approvals/` and `operator-token.service.ts` — how decisions are authorized.
- `apps/api/src/briefing/`, `apps/api/src/activity/` — event sources for notifications.
- `apps/api/src/integrations/credentials.store.ts`, `credential-kind.ts` — where secrets live.
- `libs/contracts/README.md` — contract-first flow (new resource).
- `.claude/skills/design-system/SKILL.md` if any web UI is touched.

Start by running `graphify query "chat session dispatch task"` and
`graphify query "activity events briefing approvals"` to map the touchpoints.

## Hard constraints (from the Laws — non-negotiable)

1. **Law 4 — two classes of inbound input.**
   - *Operator channel*: messages in the dedicated bot DM, sent by the **verified
     operator Slack user ID** → treated as the operator's own words (Directed mode,
     same trust as the web chat composer).
   - *Everything else* (client messages, @-mentions in channels, other users, other
     bots) → remains data inside `envelopeInbound()`; never a command. Do not widen this.
   - Authentication is by Slack `user` ID from the verified Socket Mode envelope against
     an allowlist stored on disk — never by name, display text or message content.
2. **The gate is not bypassed.** A Slack message cannot raise privileges, change gate
   rules, skip approvals or pass the Tier-3 gate. The bridge calls the same services the
   chat does; it adds no side door.
3. **Never** (default system rules): merge, deploy, payments, credential entry,
   permission changes, irreversible deletes. No "Merge" button, ever. A message asking
   for it gets a link to the PR.
4. **Files are the source of truth.** Settings, thread bindings, delivery log live on
   disk (same storage helpers as other stores, `apps/api/src/shared/file-storage`).
   The Slack transcript is also written to the chat transcript store, so the web UI
   shows the same conversation.
5. **Contract-first.** Zod schemas + ts-rest contract in `libs/contracts` before the
   implementation.
6. **Secrets** (bot token `xoxb-…`, app token `xapp-…`) go through the credentials store,
   never into config files, logs, notifications or the transcript.
7. **Notify only when genuinely relevant.** No firehose. Tier 1 is never sent.

## Architecture

New module `apps/api/src/operator-channel/` (+ `libs/contracts/src/operator-channel/`).

```
OperatorChannel (port)                 ← channel-agnostic
  ├─ send(notification): Promise<MessageRef>
  ├─ update(ref, notification)
  ├─ start(handler) / stop()           ← inbound: OperatorMessage | OperatorAction
  └─ capabilities: { threads, buttons, edit }
SlackOperatorChannel implements OperatorChannel   (Socket Mode, no public URL)
FakeOperatorChannel                                (tests + CHANNEL_ADAPTER_MODE=fake)
OperatorNotifier        event source → policy → channel.send
OperatorInbound         channel handler → auth → chat session → reply
ThreadBindingStore      slack thread_ts ⇄ {conversationId, runId?, prRef?}
```

### Slack transport

- **Socket Mode** (outbound websocket, works behind NAT, no public endpoint). Use
  `@slack/bolt` (Socket Mode receiver) or `@slack/socket-mode` + `@slack/web-api`;
  pick whichever is lighter in this monorepo and justify it.
- Slack app (document the setup in `docs/api/operator-channel.md`, with a manifest
  file checked in): bot scopes `chat:write`, `im:history`, `im:read`, `im:write`,
  `users:read`; event subscription `message.im`; Interactivity enabled (Socket Mode).
- Resolve the operator's DM with the bot via `conversations.open` on startup; store
  the channel ID.
- Ack every envelope immediately; process asynchronously. Dedupe on `event_id` /
  `client_msg_id` (Slack redelivers) — persisted, bounded window.
- Respect rate limits (`chat.postMessage` ~1/s per channel): queue + backoff on 429
  with `Retry-After`.

### Exclusion in the existing adapter

`slack.adapter.ts` ingests every human message in the operator's 1:1 IMs. The
bot DM **must be excluded** there (by conversation ID from the operator-channel
settings) so one message is not both an operator command and a triage item.
Add a test for it.

### Settings (file-backed)

`operator-channel.json` via the existing storage service pattern:

```
{
  enabled: boolean,
  transport: "slack",
  operatorUserIds: string[],        // allowlist, usually exactly one
  dmChannelId?: string,             // resolved by the bot
  publicBaseUrl?: string,           // e.g. https://zibby.<tailnet>.ts.net — for UI links
  notify: { events: EventKind[], quietHours?: {from, to, tz}, digest?: "daily"|"off" },
  allowSlackApprovals: false        // default OFF, see below
}
```

Token credentials: new credential kind(s) `slack-bot` and `slack-app` in the existing
credentials store (extend `credential-kind.ts`), referenced by id, never inlined.

## Phase 1 — Outbound notifications (read-only)

**Deliver:** ZIBBY posts to the operator DM. No inbound handling yet.

- `OperatorNotifier` subscribes to existing event streams (activity events, approvals,
  briefing) — **do not add new emit points unless unavoidable**; map existing events.
- Events (initial set, each toggleable in settings):
  - PR opened by ZIBBY / code review finished → Tier-2, with the **GitHub PR URL**.
  - Feature/implementation run completed → Tier-2, PR link + short summary (from the
    run artifact, no model call).
  - Approval waiting / run parked for human review / budget cap hit → Tier-3, immediate.
  - CI red on a watched pipeline → Tier-3 (or Tier-2 if ZIBBY is already fixing it).
  - Daily briefing digest (optional).
- Message format: Block Kit — one-line headline, 1–3 lines of context, **link buttons**
  ("Open PR", "Open in ZIBBY" when `publicBaseUrl` is set). Plain `text` fallback for
  notifications. Czech copy through the existing i18n approach (api-side strings are
  small; keep them in one catalog file). (Decision: cs + en parity, default cs.)
- Policy: dedupe identical events (key = kind + target + state), coalesce bursts into
  one message, honour quiet hours (Tier-3 may break through, flagged), per-hour cap.
- Every sent notification is appended to a delivery log on disk
  (`{ts, kind, targetRef, slackTs, status}`) — answers "what did you tell me?" (Law 5).
- Contract: `GET /api/operator-channel/status` (connected, workspace, DM resolved, last
  delivery), `PUT` settings, `POST /api/operator-channel/test` (sends a test message).
  Web: a small settings card (status + test button + event toggles) following the DS
  rules (no own Tailwind, no inline styles; edit top-right; i18n cs/en).

**Acceptance:** with the fake channel, each mapped event produces exactly one
notification; duplicate/burst/quiet-hours cases covered; tokens never appear in logs.

## Phase 2 — Inbound: the operator talks to ZIBBY

**Deliver:** a message from the verified operator in the bot DM runs through the chat
session and the reply comes back to Slack.

- `OperatorInbound.handle(message)`:
  1. Verify `user ∈ operatorUserIds`, channel is the bot DM (`channel_type: "im"`), not
     a bot message, not an edit/delete subtype, not already processed. Otherwise drop
     silently (log at debug, no reply — do not reveal ZIBBY to strangers).
  2. Map the Slack DM (top-level messages) to one stable `conversationId`; threads map
     per Phase 3. Call the same entry point `POST /api/chat/messages` uses
     (`ChatSessionService`) — **reuse, do not fork** the prompt/tool logic. All chat MCP
     tools (dispatch task, memory, status, notes, …) therefore work with zero extra code,
     and future tools appear automatically.
  3. Subscribe to the turn's events (`chat-events.service.ts`) and stream back: post a
     placeholder ("…"), then `chat.update` at coarse milestones (tool started, task
     dispatched, final answer). Throttle updates (≤ 1 per 2 s). Final message replaces
     the placeholder. Long answers split at Slack's limits.
  4. Tasks started from Slack are created through the normal path and the Tier rules
     apply unchanged; the reply includes the task/run link.
- Risky actions: whatever the chat already routes through approvals still does. For
  anything the chat asks to confirm, render **Block Kit confirm buttons** (Confirm /
  Cancel) that post back as an operator action into the same conversation.
- Cost/safety guards: per-minute and per-day message limits, max in-flight turns per
  conversation (queue the rest), budget gate respected, hard cap on text length passed
  to the model.
- Inbound text enters the prompt as the operator's turn **only** because it passed step 1.
  Anything from other senders keeps going through `envelopeInbound()` in the channels
  flow. Add a test proving a non-allowlisted user ID in the same DM/mpim never reaches
  the chat session.

**Acceptance:** fake-channel e2e: "spusť úlohu X" → task created, reply with link;
"co je nového?" → status answer; message from unknown user → no chat turn, no reply;
redelivered event → processed once; transcript visible in web chat.

## Phase 3 — Feedback in threads ("this is wrong, fix it")

**Deliver:** replying in the thread of a notification is feedback on that exact work.

- `ThreadBindingStore` persists `{channel, thread_ts} → {conversationId, runId?, taskId?, prRef?, branch?}`
  for every notification that refers to a run/PR.
- A thread reply from the operator creates a follow-up on the **bound** run: the chat
  turn is started with an `about`-style context block (existing `about` mechanism,
  DATA block) naming the run/PR/branch, so "oprav ten název" means that PR.
- Rework: first investigate how the Kodér ⇄ Code-Review ⇄ Tester loop accepts new input
  (`apps/api/src/runner`, `tasks`, run states in `docs/run-states.md`). Prefer feeding the
  feedback into the existing bounded loop (finite retries, escalating effort, then park).
  If no suitable entry exists, create a follow-up task linked to the parent run and
  flag it rather than inventing a new loop.
- Result goes back into the same thread: new commit/push to the PR branch (Tier-2),
  one-line summary of what changed, link. No merge, ever.
- Top-level messages (outside any bound thread) are general commands, as in Phase 2.
- If it is unclear whether a message is feedback or a new task, ZIBBY asks one short
  clarifying question instead of guessing.

**Acceptance:** thread reply on a "PR opened" notification results in a follow-up on that
PR's run, answered in-thread; bounded-retry behaviour unchanged; unbound thread degrades
to a normal command.

## Approvals from Slack (default OFF — operator decided: stays off)

Deciding an approval requires the **operator token**, which agents deliberately cannot
obtain (Law 1/4). Do **not** let the Slack bridge read or reuse that token. Link buttons
only ("Open approval in ZIBBY").

## Testing and validation

- Unit tests for: auth check, event dedupe, rate limiting, notifier policy (dedupe,
  coalesce, quiet hours), thread binding, adapter exclusion.
- A `FakeOperatorChannel` driving e2e tests; no network in CI.
- Follow `docs/ops/validation-policy.md`: prettier + eslint --fix per changed file, scoped
  vitest per file; project-wide checks only at the end of the phase.
- Docs: add `docs/api/operator-channel.md` (setup, manifest, scopes, trust model,
  event table) and link it from `docs/README.md` and the channels README (the exclusion).

## Open questions — resolved by the operator

1. Workspace: undecided; setup doc covers both. No app exists yet.
2. `publicBaseUrl`: Tailscale.
3. Quiet hours: supported, default off; Tier-3 may break through when enabled.
4. Copy: cs + en parity, default cs.
