# Connecting ZIBBY to a team Slack

A step-by-step guide for the operator: create a Slack bot, wire its token into a
ZIBBY integration, and confirm the channel is live. For the architecture behind
this (adapter, polling loop, triage tiers), see `docs/api/channels.md` and
`docs/api/integrations.md`.

**How it connects:** ZIBBY polls the Slack Web API (`conversations.history`) on
a heartbeat — there is no Events API subscription, no Socket Mode, and no
public Request URL to expose. A single bot token is all that's needed.

## 1. Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
   → **From scratch**.
2. Name it (e.g. `ZIBBY`) and pick the team's workspace.
3. **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**, add:

   | Scope             | Why                                                  |
   | ----------------- | ----------------------------------------------------- |
   | `channels:history` | read messages in public channels                     |
   | `groups:history`   | read messages in private channels                    |
   | `im:history`       | read direct messages (skip if DMs aren't in scope)   |
   | `mpim:history`     | read group DMs (skip if not needed)                  |
   | `channels:read`    | resolve channel names → IDs                          |
   | `chat:write`       | post replies (Tier-2 auto-reply, Tier-3 approved reply) |

4. **Install to Workspace** → approve. Copy the **Bot User OAuth Token**
   (starts `xoxb-`) from **OAuth & Permissions** — this is the only secret
   ZIBBY needs.

## 2. Invite the bot to every channel it should watch

Slack only returns history for channels the bot is actually a member of, even
for public channels. In each channel:

```
/invite @ZIBBY
```

## 3. Find each channel's ID

ZIBBY's config takes Slack channel IDs (`C0123ABCD`), not names. In the Slack
client: right-click the channel → **View channel details** → the ID is at the
bottom of that panel (or in the URL when viewing Slack in a browser).

## 4. Create the integration in ZIBBY

Integrations are managed from the owning project's detail page (there is no
standalone integrations page — one integration belongs to exactly one
project/company):
`http://localhost:3000/projects/<project-id>?tab=integrations`
(swap the host/port for wherever the web app is actually running).

1. Open the project → **Integrations** tab → **New Integration**.
2. **Kind**: `Slack`. **Id**: a short slug, e.g. `team-slack` (permanent — it
   keys the credentials file and can't be renamed later).
3. **Channels**: the comma-separated channel IDs from step 3, e.g.
   `C0123ABCD, C0456EFGH`.
4. **Bot token**: paste the `xoxb-…` token from step 1 into the secret field.
5. Save.

Equivalent over HTTP, if scripting the setup:

```bash
curl -X POST http://localhost:3333/api/integrations \
  -H 'content-type: application/json' \
  -d '{"id":"team-slack","kind":"slack","projectId":"<project-id>",
       "config":{"kind":"slack","channels":["C0123ABCD","C0456EFGH"]}}'

curl -X PUT http://localhost:3333/api/integrations/team-slack/credentials \
  -H 'content-type: application/json' \
  -d '{"token":"xoxb-…"}'
```

## 5. Test the connection

Click **Test** on the integration (or `POST /api/integrations/team-slack/test`).
A healthy response looks like:

```json
{ "ok": true, "detail": "authenticated as <workspace name>" }
```

`ok: false` usually means a missing scope, a revoked token, or the app was
never installed to the workspace. This also stamps the integration's `status`
(`connected` / `error`) shown on its detail page.

## 6. Turn on polling

The channel watcher's heartbeat is `channelTickMs` in **Settings → System**:
`http://localhost:3000/settings?tab=system`
(default 30s; `0` pauses all channel polling — useful while still wiring
things up). Once non-zero, every enabled integration with credentials gets
polled on that interval.

## 7. Set the mandate for this channel

A connected, polling integration only ever **investigates silently** (Tier 1)
until the operator explicitly opts it into auto-reply. Check **Settings →
Mandate**: `http://localhost:3000/settings?tab=mandate` (or
`GET/PUT /api/mandate`):

- `dispatch: true` (default) — ZIBBY may investigate/dispatch work from this
  channel's messages without asking.
- `reply` — off by default for every channel. Turn it on per-channel to let
  ZIBBY send a drafted reply itself for routine questions (Tier 2); leave it
  off to have every reply parked as a Tier-3 approval instead.

## What happens after connecting

- New messages in watched channels land as `ChannelItem`s (state `new`), get
  triaged, and are acted on per the tier resolved above.
- A poll failure surfaces after its retry budget is exhausted: the
  integration's `status` flips to `error` with `lastError`, and an
  `integration-retry-exhausted` entry hits the activity log — a stuck channel
  is never silently stamped.
- Inbound Slack text is always treated as data, never as instructions — it
  can't raise its own privileges or bypass approval, no matter what it says.

## Troubleshooting

| Symptom                                   | Likely cause                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Test fails with `not_in_channel`           | Bot wasn't invited to that channel — repeat step 2                       |
| Test fails with `missing_scope`            | An OAuth scope wasn't added/reinstalled — repeat step 1, then reinstall  |
| Test says `invalid_auth` / `token_revoked` | Token was regenerated or the app was uninstalled — issue a fresh token   |
| Status stuck on `disconnected`             | No credentials saved yet, or `channelTickMs` is `0`                      |
| Messages aren't arriving                   | Wrong channel ID, or `channelTickMs` is `0` (polling paused)             |
| Replies never get sent automatically       | Expected until `mandate.reply` is enabled for this channel — see step 7  |
