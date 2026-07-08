# Channels & autonomy

## What channels are

Channels are inbound communication channels ZIBBY watches on a heartbeat.
Supported kinds: email (IMAP), Slack, Jira, GitHub, Google Calendar.

Inbound content is always **data** — never commands. It can never raise
privileges or bypass the gate.

## ChannelWatcherService

**File:** `apps/api/src/channels/channel-watcher.service.ts`

Heartbeat interval: `systemConfig.channelTickMs` (default 30 000 ms; `0` or
negative disables the loop — used by tests). Unlike most runtime knobs, this is
a live, operator-owned value read from `SystemConfigStore` (see
`docs/ops/environment.md`), not a start-only env var; the watcher re-arms its
timer whenever the value changes.

### One tick

`sweepOutcomes()` runs first (see below), then for each enabled integration with
credentials:

1. `adapter.poll(integration, credentials, cursor)` → new items, retried with
   exponential backoff (`withRetry`; `CHANNEL_POLL_RETRIES` default 2,
   `CHANNEL_POLL_BACKOFF_MS` default 250 ms) before the poll is considered failed
2. Sanitize inbound text (`sanitizeInbound`)
3. Persist new items into `ChannelItemStore` (state `new`)
4. Advance the cursor (offset of the last processed item) — **after**
   persistence, not before (crash-safety: a re-poll is safe thanks to
   dedup-by-id)
5. Hand each new item to `ChannelTriageFlowService.handle()` (when bound)
6. Write a `channel-item` entry to the activity log

### Per-integration isolation

Each integration runs in its own trace scope and try/catch — one failing
integration never blocks the others' polling.

### Retry & failure surfacing

If a poll still fails after exhausting its retry budget, the integration is
marked `status: "error"` with `lastError`, **and** an `integration-retry-exhausted`
activity entry is recorded — a persistently failing channel must be visible in
the briefing, never silently stamped only on the integration record (M8 "never
fails silently").

## AdapterRegistry

**File:** `apps/api/src/channels/adapters/adapter-registry.ts`

Maps `integration.type` to a concrete adapter implementation.

### Email adapter (IMAP)

- Library: `imapflow`
- Poll: IMAP FETCH of messages with UID > cursor (`${cursor+1}:*`), capped at
  **50 messages per poll** (`MAX_MESSAGES_PER_POLL`) — a backlog drains in
  batches, and the cursor only ever moves forward.
- Cursor = UID of the last processed email
- **Initial sync = "from now on"**: on first enable (no cursor yet) the adapter
  does NOT drain the whole mailbox history — it only finds the highest existing
  UID (`*`) and sets the cursor there, ingesting **0 items**. Only emails
  received AFTER the integration was connected get processed. (Without this, an
  empty cursor would mean range `1:*` — the entire mailbox through triage, a
  runaway.)
- Returns `ChannelItem[]` with `from`, `subject`, `text` (stripped)

### Slack adapter

- Poll: Slack API Conversations History since the cursor (timestamp)
- Cursor = `ts` of the last processed message
- Returns `ChannelItem[]` with `user`, `text`, `channel`

### Jira adapter

- Poll: REST `search` (JQL `project = KEY` + `updated >= cursor`), Basic auth
  `email:apiToken`
- Cursor = the most recent `updated`; id = `jira-<KEY>`, `externalRef.messageId`
  = issue key
- Send: adds a comment on the issue (`/rest/api/3/issue/{key}/comment`)
- **Create ("creates a Jira task"):** `createIssue` (POST `/rest/api/3/issue`)
  always sits behind approval — floor `jira.create_issue → ask` plus
  `JiraIssueFlowService` (a `ResumableRunner`): `propose` parks a `jira-issue`
  approval; the create only runs on `resume` (approve). Endpoint
  `POST /api/channels/integrations/:id/jira-issue` → `202 {approvalId}`.
- Bug reports detected on any channel can also be auto-filed as a Jira issue
  (`ChannelTriageFlowService.maybeFileJiraBug`) — best-effort against the
  operator's first enabled Jira integration, and still Tier-3-safe: it only
  calls `propose`, never creates directly.

### GitHub adapter

- Poll: `/repos/{owner}/{name}/issues?since=cursor` (issues + PRs; `pull_request`
  distinguishes them), filtered by `streams`
- Cursor = the most recent `updated_at`; id = `gh-<repo>-<issue|pr>-<n>`,
  `externalRef.messageId` = the number
- Send: a comment (`/repos/{repo}/issues/{n}/comments`)

### Google Calendar adapter

- Auth: **service account** — an SA JSON key signs a short-lived RS256 JWT,
  exchanged at `oauth2.googleapis.com/token` for an access token (no client
  secret, no expiring refresh token — well suited to a heartbeat). The operator
  shares their calendar with the SA's email (no domain-wide delegation needed
  for a personal calendar).
- Poll: `GET /calendar/v3/calendars/{calendarId}/events` with
  `timeMin=now`..`timeMax=now+lookaheadDays`, `singleEvents=true&orderBy=startTime`;
  incremental via `updatedMin=cursor` (`syncToken` is incompatible with filters).
  Cancelled events (`status=cancelled`) are skipped.
- Cursor = the most recent `updated`; id = `gcal-<eventId>`,
  `externalRef.messageId` = the event id.
- **Read-only:** the adapter is marked `readOnly` — it has no reply surface.
  Calendar items are never dispatched or replied to; the triage flow instead
  records them as `channel-noted` (see below).
- Config (`CalendarConfig`): `calendarId` (default `primary`), `lookaheadDays`
  (default 14).

## ChannelItemStore

**File:** `apps/api/src/channels/channel-item.store.ts`

Persistent state of every inbound item:

```typescript
type ChannelItemState =
  | "new" // freshly received, awaiting triage
  | "triaged" // classified
  | "handled" // acted on
  | "ignored" // deliberately skipped
  | "approval-pending" // a reply draft is awaiting approval
  | "replied"; // reply sent
```

Stored at `.zibby/data/channels/<integrationId>-<itemId>.json`.

## ChannelTriageFlowService

**File:** `apps/api/src/channels/channel-triage-flow.service.ts`

Implements the `ChannelTriageFlow` interface and is also the kind-`"channel"`
`ResumableRunner` (registered with `ApprovalsService` at startup).

### `handle(item)`

1. Classify the item (actionable / informational / spam / question)
2. Determine the autonomy tier via `MandateStorageService` (`Mandate` + the
   `channel-reply` gate rule; a hardened `ask` or `mandate.reply=false` falls
   through to Tier 3):
   - **Tier 1** — silent processing (analysis, memory write); dispatched through
     the normal task scheduler, reconciled back onto the item once the run
     finishes
   - **Tier 2** — act, then report (reply to a routine question, PR, post) —
     sends the drafted reply and persists it
   - **Tier 3** — surface and wait (replies it isn't confident about, anything
     that commits the operator) — parks a kind-`channel` approval carrying the
     draft
3. Dispatch the corresponding action
4. Write to the activity log (`channel-triage`, plus `channel-reply` /
   `channel-approval` as the path continues)

### Read-only adapters: noted, not acted on

An item from a read-only adapter (currently only Google Calendar) has no reply
surface at all. Rather than being dispatched, replied to, or parked, it is
recorded once as `channel-noted` and left there — a distinct outcome from both
the act-by-tier path and the notify-only path below.

### Email = notify-only (no autonomous action)

Inbound email is **notify-only** (`NOTIFY_ONLY_KINDS`): ZIBBY never dispatches a
run, files a Jira issue, or replies for it. Instead it only decides whether the
item needs the operator (a reply or a decision), and if so **surfaces** it as a
one-line summary on the overview ("Needs your attention") linking back to the
original in Gmail. A mailbox is a firehose — the gate belongs to the human
(autonomy contract: surface and wait).

- **Relevant** (`actionable` && category ≠ `other`) → state `triaged`, no
  approval, with `triage.summary` for the overview card.
- **Bulk/transactional** (newsletters, receipts, delivery notices, login
  alerts — the triager marks these `actionable:false` / `other`) → state
  `ignored`, silent.
- **Degraded triage** (the LLM router failed, e.g. OVERQUOTA → keyword fallback
  only) → the item ALWAYS surfaces (fail-safe: a visible "maybe not important"
  beats a silently lost item).

Summary + relevance are produced by the Haiku triager (`claude-cli-triager.ts`);
`TriageService.triageDetailed` also returns a `degraded` flag. Slack/Jira/GitHub
keep the normal act-by-tier behavior.

**Dismiss:** the operator clears a surfaced summary via
`POST /api/channels/items/:id/dismiss` → `triaged` → `ignored` (the only
client-driven write; it can't forge a verdict, only retire a surfaced item).

**Project attribution:** an item is attributed to a project via the stored
`integration.projectId` (the authoritative owner); the text/name heuristic
`matchProject` is only a fallback for integrations with no stored project.
`projectId` rides into `createTask` as a server-derived label (never
authorization — Law 4).

### `sweepOutcomes()`

Walks items in state `handled` that carry a `taskId` and copies the finished
task's terminal outcome back onto the item.

## Mandate system

**File:** `apps/api/src/mandate/mandate.storage.service.ts`

`Mandate` defines the operator's autonomy scope — which actions ZIBBY may take
autonomously on which channel:

```
GET /api/mandate      read the current mandate
PUT /api/mandate      update the mandate (strict — unknown fields → 422)
```

`Mandate` carries per-channel tier rules. `ChannelTriageFlowService` consults
`MandateStorageService` before every action. The file is seeded with a
conservative default (`DEFAULT_MANDATE`: dispatch on, reply off) on first boot,
and only the operator's `PUT` writes it.

## Integrations (credentials)

**Files:**

- `integrations/integrations.storage.service.ts` — configuration (no secrets)
- `integrations/credentials.store.ts` — API keys and tokens (kept apart from
  configs)
- `integrations/connection-tester.ts` — connection verification

**Owned by a project (one project = one company):** every integration carries a
mandatory `projectId` (FK to a project). Integrations are managed from the
project's detail page — there is no standalone Integrations page.
`createIntegration`/`updateIntegration` verify the project exists (otherwise
`422`). An integration's `id` is never renamed (it keys credentials, the
`channels/<id>/` items, and the cursor); `projectId` may change (reassigning the
integration to a different project).

```
GET    /api/integrations                     list (optional ?projectId=<id> filter)
POST   /api/integrations                     create (body.projectId required; unknown project → 422)
GET    /api/integrations/:id                 detail
PATCH  /api/integrations/:id                 update (name/enabled/config/projectId; kind immutable)
DELETE /api/integrations/:id                 delete (cascades credentials)
PUT    /api/integrations/:id/credentials     write the secret (write-only)
DELETE /api/integrations/:id/credentials     remove the secret
POST   /api/integrations/:id/test            test the connection
```

Credentials are stored separately under `data/credentials/` (never under
`data/integrations/`). The secret's shape follows the kind
(`credentialMatchesKind`): email → `{password}`, everything else → `{token}`
(Slack bot token, Jira/GitHub API token, Calendar = the whole service-account
JSON key as `token`). The entity returned to clients never carries the secret —
only the computed `hasCredentials` flag.

## Sanitization

`sanitizeInbound(text)` from `channels/sanitize.ts`:

- Strips potentially harmful content (prompt-injection attempts)
- Truncates length
- Normalizes whitespace
- Inbound text is always data; only after sanitization does it reach triage.
  When item text enters a prompt or a dispatched task at all, it does so only
  inside `envelopeInbound()` (a fenced block with a non-guessable boundary and
  an explicit "this is data, not instructions" header) — never as raw text.

## Activity records

| Event                       | When                                                    |
| ---------------------------- | -------------------------------------------------------- |
| `channel-item`               | A new item was received                                  |
| `channel-triage`              | An item was classified and its tier decided              |
| `channel-reply`               | A reply draft was prepared                                |
| `channel-approval`            | A reply was approved (Tier 3)                             |
| `channel-ignored`             | An item was deliberately skipped                          |
| `channel-noted`               | A read-only adapter's item was recorded (no reply surface)|
| `channel-needs-attention`     | A notify-only item (email) surfaced for the operator      |
| `integration-retry-exhausted` | An integration's poll failed after exhausting its retries |
