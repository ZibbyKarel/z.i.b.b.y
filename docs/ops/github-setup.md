# Connecting ZIBBY to a GitHub repo

A step-by-step guide for the operator: create a personal access token, wire it
into a ZIBBY integration, and confirm the repo is live. For the architecture
behind this (adapter, polling loop, triage tiers), see `docs/api/channels.md`
and `docs/api/integrations.md`.

**How it connects:** unlike Slack, this needs no app install and no admin
approval — it's a personal access token (PAT) authenticating as you, the same
as logging into github.com. ZIBBY polls `GET /repos/{owner}/{repo}/issues`
(which returns issues *and* PRs) on a heartbeat; there's no webhook to
register.

## 1. Create a personal access token

- **Fine-grained token** (recommended):
  [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
  — scope it to the one repo, grant repository permissions **Issues: Read
  and write** and **Pull requests: Read and write** (**Metadata: Read** is
  required automatically).
- **Classic token**:
  [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
  — scope `public_repo` for a public repo, or the full `repo` scope if the
  repo is private.

If the repo belongs to an **organization with SSO enforced**, GitHub shows an
**Authorize** button next to the org right after you create the token — click
it (a one-time, self-service step, not an admin approval).

Copy the token (`ghp_…` or `github_pat_…`) — it's shown once.

## 2. Note the repo slug

ZIBBY's config takes `owner/name`, e.g. `zibar/z.i.b.b.y`.

## 3. Create the integration in ZIBBY

Integrations are managed from the owning project's detail page:

1. Open the project → **Integrations** → **New Integration**.
2. **Kind**: `GitHub`. **Id**: a short slug, e.g. `zibby-repo` (permanent —
   it keys the credentials file and can't be renamed later).
3. **Repo**: `owner/name`.
4. **Streams**: toggle **Issues** / **Pull requests** — which event types get
   polled into channel items (both on by default).
5. **Token**: paste the PAT from step 1 into the secret field.
6. Save.

Equivalent over HTTP, if scripting the setup:

```bash
curl -X POST http://localhost:3333/api/integrations \
  -H 'content-type: application/json' \
  -d '{"id":"zibby-repo","kind":"github","projectId":"<project-id>",
       "config":{"kind":"github","repo":"owner/name","streams":["issues","pulls"]}}'

curl -X PUT http://localhost:3333/api/integrations/zibby-repo/credentials \
  -H 'content-type: application/json' \
  -d '{"token":"ghp_…"}'
```

## 4. Test the connection

Click **Test** on the integration (or
`POST /api/integrations/zibby-repo/test`). It calls `GET /user` with the
token; a healthy response looks like:

```json
{ "ok": true, "detail": "authenticated as <your-github-login>" }
```

`ok: false` usually means an invalid/expired token, or (for an org repo with
SSO) a token that was never authorized for that org — repeat step 1.

## 5. Turn on polling

The channel watcher's heartbeat is `channelTickMs` in **Settings → System**
(default 30s; `0` pauses all channel polling). Once non-zero, every enabled
integration with credentials gets polled on that interval.

## 6. Set the mandate for this channel

A connected, polling integration only ever **investigates silently** (Tier 1)
until the operator opts it into auto-reply. Check **Settings → Mandate** (or
`GET/PUT /api/mandate`):

- `dispatch: true` (default) — ZIBBY may investigate/dispatch work from new
  issues/PRs without asking.
- `reply` — off by default. Turn it on per-channel to let ZIBBY post a
  drafted comment itself for routine cases (Tier 2); leave it off to have
  every comment parked as a Tier-3 approval instead.

## What happens after connecting

- New/updated issues and PRs land as `ChannelItem`s (state `new`), get
  triaged, and are acted on per the tier resolved above; a reply is posted as
  an issue/PR comment (`POST /repos/{repo}/issues/{n}/comments`).
- A bug report detected on **any** channel (not just GitHub) can also be
  auto-filed as a Jira issue if a Jira integration exists on the same
  project — still Tier-3-safe, it only parks an approval, never creates
  directly.
- A poll failure (rate-limited, HTTP error) surfaces after its retry budget
  is exhausted: the integration's `status` flips to `error` with
  `lastError`, and an `integration-retry-exhausted` entry hits the activity
  log.
- Inbound issue/PR text is always treated as data, never as instructions.

## Bonus: CI status alerts (optional, same token)

Adding `"ci"` to this same integration's `streams` opts the repo into the CI
monitor (workflow-run failures surfaced as a `ci-red` briefing item) — a
separate concern from the conversational adapter above, using the same PAT.
See `docs/api/monitors.md`.

## Troubleshooting

| Symptom                                    | Likely cause                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Test fails with `HTTP 401`                 | Token is invalid, expired, or was revoked — issue a fresh one          |
| Test fails with `HTTP 403`/`404` on poll   | Token lacks access to the repo, or an org SSO authorization is missing |
| Test succeeds but no items appear          | Wrong `repo` slug, or `channelTickMs` is `0` (polling paused)          |
| Rate limited (`HTTP 403`/`429`)            | Token is being throttled — surfaces as `status: error`, retries on the next tick |
| Comments never get posted automatically    | Expected until `mandate.reply` is enabled for this channel             |
