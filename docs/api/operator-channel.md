# Operator channel

A Slack bot DM between ZIBBY and the operator. **Outbound** (Phase 1): ZIBBY maps events it
already records to short Block Kit messages with link buttons. **Inbound** (Phase 2): what
the operator writes in that DM runs through the same chat session as the web composer, and
the answer comes back to Slack. Thread feedback (Phase 3) is not built yet. Slack approvals
stay **off**; every decision still happens in ZIBBY.

Code: `apps/api/src/operator-channel/`. Contract: `libs/contracts/src/operator-channel/`.
Web: the "Operator channel (Slack)" card in Settings → General.

## Setup

1. Create a Slack app from the manifest
   [`operator-channel.slack-manifest.yml`](./operator-channel.slack-manifest.yml)
   ("Create New App → From an app manifest") in your own workspace (the operator's is
   _Zibby's_). It requests only `chat:write`, `im:history`, `im:read`, `im:write` and
   `users:read`, subscribes to `message.im`, and turns on Interactivity and Socket Mode.
   After you change scopes, reinstall the app so the bot token picks them up.
2. Generate an **app-level token** with `connections:write` (`xapp-…`; inbound uses it for
   Socket Mode). Copy the **bot token** (`xoxb-…`) from "OAuth & Permissions".
3. Store both tokens through the API. They are never typed into the web UI.

   ```bash
   T=$(cat ~/.config/zibby/operator-token)
   curl -X PUT localhost:3333/api/operator-channel/credentials/slack-bot \
     -H "x-zibby-operator-token: $T" -H 'content-type: application/json' \
     -d '{"token":"xoxb-…"}'
   curl -X PUT localhost:3333/api/operator-channel/credentials/slack-app \
     -H "x-zibby-operator-token: $T" -H 'content-type: application/json' \
     -d '{"token":"xapp-…"}'
   ```

   A token whose prefix doesn't match its slot (`xoxb-` for `slack-bot`, `xapp-` for
   `slack-app`) is rejected with `422`.

4. Set your Slack member id (Profile → ⋯ → "Copy member ID") and switch the channel on:

   ```bash
   curl -X PUT localhost:3333/api/operator-channel/settings \
     -H "x-zibby-operator-token: $T" -H 'content-type: application/json' \
     -d '{"enabled":true,"operatorUserIds":["U0123ABCD"],"publicBaseUrl":"https://zibby.tail1234.ts.net"}'
   ```

5. Press **Send test** on the settings card (or `POST /api/operator-channel/test`). On the
   first send, ZIBBY runs `auth.test` and `conversations.open` to find the bot↔operator DM
   and saves its id as `dmChannelId`.
6. Write to the bot in its DM ("Messages" tab of the app). `GET /status` shows
   `listening: true` once Socket Mode is open. Listening starts at boot and again after
   every settings or token change, while `enabled` is on.

## Endpoints

All of them are under `/api/operator-channel`. GETs are open. Mutations need the
`x-zibby-operator-token` header ([approvals](./approvals.md#operator-token)).

| Route                    | What                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /status`            | `mode` (slack/fake), stored tokens (booleans only), connected/workspace, `listening`, DM resolved, last error, last delivery |
| `GET /settings`          | The settings (defaults when no file exists)                                                                                  |
| `PUT /settings`          | Replaces the settings. Unknown keys, a client-sent `dmChannelId`, or `allowSlackApprovals: true` → `422`                     |
| `PUT /credentials/:kind` | `slack-bot` / `slack-app` → `{ token }`; returns the status, never the token                                                 |
| `POST /test`             | Sends a test message through the queue; bypasses toggles and policy                                                          |

## Settings (`operator-channel.json`)

```jsonc
{
  "enabled": false, // master switch (default off)
  "transport": "slack",
  "operatorUserIds": ["U0123ABCD"], // the first one gets the DM; max 5
  "dmChannelId": "D…", // server-owned; dropped when operatorUserIds change
  "publicBaseUrl": "https://zibby.tail1234.ts.net", // base for "Open in ZIBBY" links
  "locale": "cs", // cs | en message copy
  "notify": {
    "events": [
      "pr-opened",
      "review-finished",
      "run-completed",
      "approval-waiting",
      "run-parked",
      "budget-cap",
      "ci-red",
    ], // "briefing" is opt-in
    "quietHours": { "from": "22:00", "to": "07:00", "tz": "Europe/Prague" }, // optional, off by default
    "maxPerHour": 20,
  },
  "allowSlackApprovals": false, // literal false in Phase 1
}
```

The file lives in `.zibby/data/operator-channel/` (or `OPERATOR_CHANNEL_DIR`) and is
gitignored. It never contains a token.

**`publicBaseUrl` is your Tailscale URL** (MagicDNS, `https://<host>.<tailnet>.ts.net`,
for example via `tailscale serve`). Then "Open in ZIBBY" buttons work from your phone on
the tailnet and nowhere else. Without it, messages carry only the PR link.

The page on the phone also has to reach the API, which the Mac serves on `localhost`:

```bash
tailscale serve --bg --https=443 http://localhost:3000    # web
tailscale serve --bg --https=8443 http://localhost:3333   # API
```

Then set `NEXT_PUBLIC_REMOTE_API_URL=https://<host>.<tailnet>.ts.net:8443` in
`apps/web/.env` (used only when the page isn't opened from `localhost`), and add
`https://<host>.<tailnet>.ts.net` to `CORS_ORIGIN` in `apps/api/.env`.

## Events

Only events ZIBBY **already records** are mapped. The notifier subscribes to the activity
stream and adds no new emit points. Every activity kind not listed here is Tier-1 and is
never sent.

| Event              | Tier | Comes from (activity entry)                                                                                                          |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pr-opened`        | 2    | `task-outcome` done, where the task's outcome has a `pr` url                                                                         |
| `run-completed`    | 2    | `task-outcome` done without a PR (PR-inbox tasks excluded; they report via approvals)                                                |
| `review-finished`  | 3    | `approval-requested` with status `pr-review`                                                                                         |
| `approval-waiting` | 3    | any other `approval-requested` (including the roadmap question without an approval id). Skipped when autopilot decided it            |
| `budget-cap`       | 3    | `approval-requested` with action `spend-past-cap`                                                                                    |
| `run-parked`       | 3    | `workflow-parked` (reason `retries`/`limit` only) and `goal-parked`                                                                  |
| `ci-red`           | 2    | `monitor-alert`, and a `post-merge-outcome` that dispatched a fix task                                                               |
| `briefing`         | 2    | `briefing-generated` (off by default)                                                                                                |
| `autopilot-action` | 2    | `autopilot-action` (a gate or approval autopilot let through) and `autopilot-changed` (switched on/off). See `docs/api/autopilot.md` |

`autopilot-action` is on by default for new settings. Settings saved before Phase 4 keep
their explicit `notify.events` list, so add `autopilot-action` there to receive it.

Not mapped on purpose: failed or dead-lettered runs (not in the Phase 1 list) and
`task-held` (its approval already raises `budget-cap`).

## Policy

Applied in this order, per event:

1. **Toggle.** The channel must be `enabled` and the kind must be in `notify.events`.
   Autopilot must also be on. With autopilot off nothing is pushed, except an event
   whose task already has a bound Slack thread (a task started or announced on Slack),
   which is still answered in that thread. Inbound (listening) is never gated.
2. **Dedupe.** `kind + target + state` is sent once per 24 h. This is in memory only,
   which is safe because the activity stream doesn't replay after a restart.
3. **Coalesce.** Events that land within 3 s of each other go out as one message: a
   "{n} updates" headline plus up to 5 bullet lines.
4. **Quiet hours** (optional, off by default). Inside the window, Tier-2 events are held
   back and logged as `quiet-hours`. Tier-3 events still go out, marked as quiet-hours.
5. **Per-hour cap.** After `maxPerHour` sends in the last hour, a batch is logged as
   `capped` instead of sent.

All sends go through one serial queue, spaced about 1.1 s apart (Slack allows about one
message per second per channel). On a `429`, the queue waits for `Retry-After` and
retries up to 3 times. Then it logs `failed`.

## Inbound (Phase 2)

`OperatorInboundService` (`operator-inbound.service.ts`) turns a DM into a chat turn:

1. **Auth** (`rejectReason`). The Slack `user` id from the envelope must be in
   `operatorUserIds`. The channel must be the resolved `dmChannelId` with `channel_type: "im"`.
   Bot messages (ZIBBY's own included), every `subtype` (edits, deletes, joins, …) and empty
   text are dropped. A dropped event is logged at debug level and gets **no reply**.
2. **Dedupe.** The key is `client_msg_id`, or the envelope's `event_id` when there is none.
   It is persisted in `inbound-seen.json` next to the settings (24 h window, at most 1000
   ids), so a Slack redelivery after a restart is still processed once.
3. **Guards** (see below).
4. **Chat turn.** `ChatSessionService.sendMessage({ conversationId, text })` is the same
   entry point as `POST /api/chat/messages`. The persona, the answer/ask/act governor,
   every chat MCP tool and the gate are reused, not copied.
5. **Reply.** A `…` placeholder is posted first. It is updated with `chat.update` at coarse
   milestones (a tool started), at most once every 2 s, and the final answer replaces it.
   An answer longer than about 2500 characters is split, and the extra chunks are posted
   as new messages. A task dispatched in the turn adds a `Task … · run …` line and an
   "Open run" link button (when `publicBaseUrl` is set).

**Conversation id.** The top-level bot DM is one chat conversation:
`slack-dm-<dmChannelId>`. `--resume` keeps context across Slack turns, and the web chat
lists the thread with the others (`GET /api/chat/conversations`). Changing the operator
(and so the DM) starts a new thread. A reply in a **bound** notification thread runs in that
thread's own conversation instead (see [Thread feedback](#thread-feedback-phase-3)); a reply in
an unbound thread is handled like a top-level message.

**Confirm buttons.** When an answer ends with `?`, the chat is asking. The last chunk gets
**Ano / Ne** (en: Yes / No) reply buttons. A tap arrives as a `block_actions` payload, is
authenticated exactly like a message (same user id and DM checks), and goes into the same
conversation as the operator's next turn (`Ano.` / `Ne.`). The prompt is then updated to
drop its buttons and show the answer. The dedupe key is the prompt's `ts`, so a double tap
runs once. A button never decides anything itself. Link-button clicks also arrive as
`block_actions`; they are acked and ignored. Approvals are never answered from Slack. A
turn that parks an approval is announced by the notifier (`approval-waiting`) with an
"Open in ZIBBY" link.

## Thread feedback (Phase 3)

Replying in the thread of a notification is feedback on that exact work.

1. **Binding.** When the notifier sends a message about exactly **one** event that names a
   task, run or PR (`pr-opened`, `run-completed`, `run-parked`, `ci-red` with a fix task, an
   approval carrying a PR url), it records the message in `thread-bindings.json` next to the
   settings (`ThreadBindingStore`, `thread-binding.store.ts`):
   `"<channel>:<ts>" → { channel, threadTs, conversationId, title, at, taskId?, runId?, prRef?, branch?, followUpTaskIds? }`.
   A coalesced message lists several things, so it binds nothing. At most 500 bindings are
   kept (oldest dropped). `branch` is filled only while the task still carries its pending
   `pr` output; otherwise the PR url is the reference.
2. **Conversation id.** Each bound thread is its own chat conversation:
   `slack-thread-<thread_ts>`. Each piece of work keeps its own context and shows up as its
   own thread in the web chat.
3. **Reply.** A reply (`thread_ts` set) passes the same auth, dedupe and guards as any DM.
   If `(channel, thread_ts)` is bound, the chat turn runs in the thread's conversation with
   an `about` block (the existing todo-29 mechanism, a random-boundary DATA block):
   `kind: pr|run`, `id` = PR url or run id, the title, and `details` naming task/run/PR/branch.
   The details also carry the routing guidance (server-built from the binding, never from the
   reply text):
   - feedback on this work → `create_task` with text starting
     `Navazující úkol k: běh …, PR …, větev ….` asking to commit onto the existing PR branch;
     no new PR, no merge;
   - an obviously unrelated request → a normal command;
   - unclear whether feedback or a new task → **one short clarifying question**, nothing started.
     The placeholder and the answer are posted **in the thread** (`thread_ts`), reply buttons
     included; a tap in a thread (`container.thread_ts`) stays in that thread's conversation.
4. **Follow-up link.** A `create_task` that succeeds during a bound turn is added to the
   binding's `followUpTaskIds` the moment the tool reports it (before its run can finish).
5. **Result in-thread.** When a notification is about a task that already has a thread
   (announced there, or a follow-up started from it), the notifier posts it **as a reply in
   that thread** (one message each, outside coalescing) and binds no new thread. The usual
   headline + one-line summary + Open PR / Open in ZIBBY links.

**How rework enters the loop.** A `pr-opened` task's run is `done` — terminal
(`docs/run-states.md`). The bounded loop's only entries for new input are
`addOperatorMessage` (a live run) and `resumeParked` (a retries/limit-parked run), and the
chat cannot reach `resumeTaskRun` (denied in the self-API catalog as an execution trigger).
So feedback becomes a **follow-up task** through the normal `create_task` path: it is
classified and dispatched like any task, its workflow runs its own bounded
Kodér ⇄ Code-Review ⇄ Tester loop (finite retries, escalating effort, then park), unchanged.
It is linked to the parent by the binding (`followUpTaskIds`) and flagged by its text
(`Navazující úkol k: …`). Pushing to the PR branch is the task's normal output path (Tier-2);
nothing here merges.

**Unbound threads.** A thread reply whose `(channel, thread_ts)` has no binding (an old
message, a coalesced one, a chat answer) degrades to a normal Phase-2 command: the DM
conversation, no `about`, answered top-level.

### Guards

| Guard               | Value                                      | When hit                                          |
| ------------------- | ------------------------------------------ | ------------------------------------------------- |
| Per minute          | 6 accepted turns                           | A short "slow down" notice, no turn               |
| Per day             | 200 accepted turns                         | A notice pointing to ZIBBY, no turn               |
| In flight           | 1 turn per conversation, up to 3 queued    | Queued turns run in arrival order; beyond: "busy" |
| Text length         | 4000 characters handed to the model        | Cut, and the answer says so                       |
| Placeholder updates | at most one `chat.update` per 2 s          | Milestones in between are skipped                 |
| Turn safety net     | 150 s (the chat's own turn timeout: 120 s) | The placeholder shows the error                   |

Budget is enforced where it always is. A task started from Slack goes through the
scheduler's budget guard (hold + `budget-cap` approval), the same as from the web. A chat
reply or notice that hits a 429 waits for `Retry-After` and retries up to 3 times.

## Delivery log

`deliveries.jsonl` next to the settings is append-only, with one line per event outcome:
`{ ts, kind | "test", targetRef, messageRef?, status: sent|failed|quiet-hours|capped, detail? }`.
`GET /status` shows the newest line.

## Trust model

- Tokens live only in `credentials/operator-channel/{slack-bot,slack-app}.json` under
  the credentials dir. They are sent only in the `authorization` header. They never
  appear in the settings file, the delivery log, log lines, error messages, API
  responses or notification text. A unit test and an e2e test check this.
- The bot can only DM the configured operator. It has no channel scopes, so it can't
  read or post in channels.
- The Slack **ingest** adapter (`channels/adapters/slack.adapter.ts`) skips the bot↔operator
  DM (`dmChannelId`). ZIBBY's own notifications are never ingested as inbound work.
- Message text is data. Slack mrkdwn control characters in titles and chat answers are
  escaped. Notification buttons are plain links. The only other buttons are chat reply
  buttons, and a tap is just the operator's next chat turn. No Slack interaction can
  approve, merge or run anything outside the chat's normal path.
- **Two classes of inbound input (Law 4).** A message in the bot DM from an allowlisted
  user id is the operator's own words, with the same trust as the web composer. It still
  cannot change gate rules, settings or tokens, because those need the operator token, which
  neither the chat nor this bridge has. Everything else stays data: other users, an mpim,
  channels, bots, edits. It is dropped here and never reaches the chat. Client DMs and
  @-mentions keep going through `envelopeInbound()` in the channels flow.
- A thread binding never widens trust: the reply is authenticated exactly like any DM, and
  the `about` block is built from ZIBBY's own binding file, never from message text.
- Identity comes only from the Socket Mode envelope's user id, never from a name, display
  text or message content. The transport passes events through raw; only the inbound
  service authenticates.

## Transport and tests

`SlackOperatorChannel` calls the Web API over plain `fetch` (`auth.test`,
`conversations.open`, `chat.postMessage`, `chat.update`) and uses no SDK, following the
`slack.adapter.ts` precedent.

Socket Mode uses Node's global `WebSocket` on the URL from `apps.connections.open`, which is
called with the app token. There is no `@slack/socket-mode` dependency, which would pull in
`ws`, `@slack/web-api` and an event emitter for one socket. Every envelope is acked
(`{ envelope_id }`) before it is handled, and handling is asynchronous. `hello` resets the
backoff. `disconnect` (Slack rotating the connection) opens a new socket and then closes
the old one. An unexpected close reconnects with a backoff from 1 s up to 30 s. `stop()`
closes the socket for good.

When `CHANNEL_FAKE_DIR` is set (always in vitest) or `CHANNEL_ADAPTER_MODE=fake`, the
service uses `FakeOperatorChannel`, which records sends in memory and never touches the
network. Tests:

- `apps/api/src/operator-channel/*.test.ts`: policy, mapping, copy, Block Kit, 429, token
  hygiene, Socket Mode (ack-first, refresh, reconnect), inbound auth, dedupe, guards and
  confirm buttons.
- `apps/api/test/operator-channel.e2e.test.ts`: endpoints, guard, 422s, test send, activity → DM once.
- `apps/api/test/operator-inbound.e2e.test.ts`: "spusť úlohu X" creates a task and replies with
  its run link, "co je nového?" gets an answer, an unknown user or an mpim gets no turn and no
  reply, a redelivery is processed once, and the transcript shows up in the web chat.

`FakeOperatorChannel.receive(event)` plays an inbound event as if Slack had delivered it.
