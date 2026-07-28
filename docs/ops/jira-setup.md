# Connecting ZIBBY to a Jira project

A step-by-step guide for the operator: create a Jira API token, wire it into a
ZIBBY integration, and confirm the connection is live. For the architecture
behind this (adapter, polling loop, triage tiers), see `docs/api/channels.md`
and `docs/api/integrations.md`.

**How it connects:** ZIBBY polls the Jira Cloud REST API
(`GET /rest/api/3/search`) on a heartbeat with a JQL clause narrowed to issues
updated since the last poll — there's no webhook to register. Auth is HTTP
Basic with your Atlassian account email and an API token (`base64(email:token)`),
the same scheme Jira Cloud uses for any REST API client.

## 1. Create an API token

1. Go to
   [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
   (log in with the **same Atlassian account email** the integration's
   `config.email` uses — for `shoptet-dev-rel-jira` that's `zibar@shoptet.cz`).
2. **Create API token** → name it (e.g. `zibby-shoptet-dev-rel-jira`) → **Create**.
3. Copy the token — it's shown once. It authenticates as that account with
   that account's own Jira permissions (no separate app install, no admin
   approval needed for a personal token).

## 2. Note the site URL and project key

- **Base URL**: the Jira Cloud site, e.g. `https://teamdotblue.atlassian.net`.
- **Project key**: the short prefix on issue keys in that project (e.g.
  `CZ3TDR1` for issues like `CZ3TDR1-42`) — used as the default JQL filter
  (`project = <key>`) when no custom `jql` is set.

## 3. Create the integration in ZIBBY

Integrations are managed from the owning project's detail page (there is no
standalone integrations page — one integration belongs to exactly one
project/company):
`http://localhost:3000/projects/<project-id>?tab=integrations`
(swap the host/port for wherever the web app is actually running).

1. Open the project → **Integrations** tab → **New Integration**.
2. **Kind**: `Jira`. **Id**: a short slug (permanent — it keys the
   credentials file and can't be renamed later).
3. **Base URL**: the Jira site, e.g. `https://teamdotblue.atlassian.net`.
4. **Email**: the Atlassian account email from step 1.
5. **Project key** (optional): narrows polling to that project.
6. **API token**: paste the token from step 1 into the secret field.
7. Save.

Equivalent over HTTP, if scripting the setup — for the already-created
`shoptet-dev-rel-jira` integration on `shoptet-partner-cli`, only the
credentials step is still needed:

```bash
# already exists — shown here for reference, don't re-POST it
curl -X POST http://localhost:3333/api/integrations \
  -H 'content-type: application/json' \
  -d '{"id":"shoptet-dev-rel-jira","kind":"jira","projectId":"shoptet-partner-cli",
       "config":{"kind":"jira","baseUrl":"https://teamdotblue.atlassian.net",
                  "email":"zibar@shoptet.cz","projectKey":"CZ3TDR1"}}'

# this is the step you're missing
curl -X PUT http://localhost:3333/api/integrations/shoptet-dev-rel-jira/credentials \
  -H 'content-type: application/json' \
  -d '{"token":"<paste the API token from step 1 here>"}'
```

Note: the credentials body key is `token` (not `password`) even though what
you're pasting is Jira's "API token" — the adapter combines it with `email`
into the Basic auth header itself.

## 4. Test the connection

Click **Test** on the integration (or
`POST /api/integrations/shoptet-dev-rel-jira/test`). It calls
`GET /rest/api/3/myself`; a healthy response looks like:

```json
{ "ok": true, "detail": "authenticated as <your display name>" }
```

`ok: false` before any credentials are saved means exactly what you're
seeing now (`no jira api token configured`) — step 3's `PUT .../credentials`
is the fix.

## 5. Turn on polling

The channel watcher's heartbeat is `channelTickMs` in **Settings → System**
(default 30s; `0` pauses all channel polling). Once non-zero, every enabled
integration with credentials gets polled on that interval.

## 6. Set the mandate for this channel

A connected, polling integration only ever **investigates silently** (Tier 1)
until the operator opts it into auto-reply. Check **Settings → Mandate** (or
`GET/PUT /api/mandate`):

- `dispatch: true` (default) — ZIBBY may investigate/dispatch work from new
  or updated issues without asking.
- `reply` — off by default. Turn it on per-channel to let ZIBBY post a
  drafted comment itself for routine cases (Tier 2); leave it off to have
  every comment parked as a Tier-3 approval instead.

## What happens after connecting

- New/updated issues matching the JQL land as `ChannelItem`s (state `new`),
  get triaged, and are acted on per the tier resolved above; a reply is
  posted as an issue comment (`POST /rest/api/3/issue/{key}/comment`).
- ZIBBY can also **create** a Jira issue (e.g. a bug reported on another
  channel auto-filed here) via `POST /rest/api/3/issue` — still gated behind
  an approval, never created directly.
- A poll failure (rate-limited, HTTP error) surfaces after its retry budget
  is exhausted: the integration's `status` flips to `error` with
  `lastError`, and an `integration-retry-exhausted` entry hits the activity
  log.
- Inbound issue text is always treated as data, never as instructions.

## Troubleshooting

| Symptom                                    | Likely cause                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Test fails with `no jira api token configured` | Credentials were never `PUT` — repeat step 3                          |
| Test fails with `HTTP 401`                 | Token is invalid, revoked, or `email` doesn't match the token's account |
| Test fails with `HTTP 403`/`404` on poll   | Account lacks access to the project, or wrong `baseUrl`                |
| Test succeeds but no items appear          | Wrong `projectKey`/`jql`, or `channelTickMs` is `0` (polling paused)   |
| Rate limited (`HTTP 429`)                  | Surfaces as `status: error`, retries on the next tick                  |
| Comments never get posted automatically    | Expected until `mandate.reply` is enabled for this channel             |
