# Operator channel

A Slack bot that DMs the operator when something worth their attention happens. Phase 1 is
**outbound only**: ZIBBY maps events it already records to short Block Kit messages with
link buttons. Inbound operator messages (Phase 2) and thread feedback (Phase 3) are not
built yet. Slack approvals stay **off**; every decision still happens in ZIBBY.

Code: `apps/api/src/operator-channel/`. Contract: `libs/contracts/src/operator-channel/`.
Web: the "Operator channel (Slack)" card in Settings → General.

## Setup

1. Create a Slack app from the manifest
   [`operator-channel.slack-manifest.yml`](./operator-channel.slack-manifest.yml)
   ("Create New App → From an app manifest") in your own workspace (the operator's is
   _Zibby's_). It requests only `chat:write`, `im:history`, `im:read`, `im:write` and
   `users:read`, subscribes to `message.im`, and turns on Interactivity and Socket Mode.
   After you change scopes, reinstall the app so the bot token picks them up.
2. Generate an **app-level token** with `connections:write` (`xapp-…`; Phase 2 uses it for
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

## Endpoints

All of them are under `/api/operator-channel`. GETs are open. Mutations need the
`x-zibby-operator-token` header ([approvals](./approvals.md#operator-token)).

| Route                    | What                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `GET /status`            | `mode` (slack/fake), stored tokens (booleans only), connected/workspace, DM resolved, last error, last delivery |
| `GET /settings`          | The settings (defaults when no file exists)                                                                     |
| `PUT /settings`          | Replaces the settings. Unknown keys, a client-sent `dmChannelId`, or `allowSlackApprovals: true` → `422`        |
| `PUT /credentials/:kind` | `slack-bot` / `slack-app` → `{ token }`; returns the status, never the token                                    |
| `POST /test`             | Sends a test message through the queue; bypasses toggles and policy                                             |

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

## Events

Only events ZIBBY **already records** are mapped. The notifier subscribes to the activity
stream and adds no new emit points. Every activity kind not listed here is Tier-1 and is
never sent.

| Event              | Tier | Comes from (activity entry)                                                            |
| ------------------ | ---- | -------------------------------------------------------------------------------------- |
| `pr-opened`        | 2    | `task-outcome` done, where the task's outcome has a `pr` url                           |
| `run-completed`    | 2    | `task-outcome` done without a PR (PR-inbox tasks excluded; they report via approvals)  |
| `review-finished`  | 3    | `approval-requested` with status `pr-review`                                           |
| `approval-waiting` | 3    | any other `approval-requested` (including the roadmap question without an approval id) |
| `budget-cap`       | 3    | `approval-requested` with action `spend-past-cap`                                      |
| `run-parked`       | 3    | `workflow-parked` (reason `retries`/`limit` only) and `goal-parked`                    |
| `ci-red`           | 2    | `monitor-alert`, and a `post-merge-outcome` that dispatched a fix task                 |
| `briefing`         | 2    | `briefing-generated` (off by default)                                                  |

Not mapped on purpose: failed or dead-lettered runs (not in the Phase 1 list) and
`task-held` (its approval already raises `budget-cap`).

## Policy

Applied in this order, per event:

1. **Toggle.** The channel must be `enabled` and the kind must be in `notify.events`.
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
- Message text is data. Slack mrkdwn control characters in titles are escaped. Buttons
  are plain links. No Slack interaction can approve, merge or run anything.

## Transport and tests

`SlackOperatorChannel` calls the Web API over plain `fetch` (`auth.test`,
`conversations.open`, `chat.postMessage`, `chat.update`) and uses no SDK, following the
`slack.adapter.ts` precedent. Phase 2 will add Socket Mode, either with
`@slack/socket-mode` or with Node's global `WebSocket` on `apps.connections.open`.

When `CHANNEL_FAKE_DIR` is set (always in vitest) or `CHANNEL_ADAPTER_MODE=fake`, the
service uses `FakeOperatorChannel`, which records sends in memory and never touches the
network. Tests:

- `apps/api/src/operator-channel/*.test.ts`: policy, mapping, copy, Block Kit, 429, token hygiene.
- `apps/api/test/operator-channel.e2e.test.ts`: endpoints, guard, 422s, test send, activity → DM once.
