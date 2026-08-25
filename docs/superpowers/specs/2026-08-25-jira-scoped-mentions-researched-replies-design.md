# Jira channel — operator-scoped ingestion + researched replies

**Date:** 2026-08-25
**Status:** Draft, awaiting operator review

## Goal

Stop the Jira channel from parking a courtesy-phrase approval on every issue in
`CZ3TDR1`, and make every drafted reply a real answer.

Three changes, one of which is channel-global:

- **A. Scope** — an inbound item is created only from a **comment**, and only when
  the comment sits on an issue the operator owns (assignee / reporter / watcher)
  **or** explicitly `@`-mentions the operator. Issue creation and issue field
  changes create nothing.
- **B. Substance** — the item carries the real text (issue description + comment
  body, ADF flattened), and a reply draft is produced by a **read-only codebase
  research pass** against the project's repo, not a one-line classifier guess.
- **C. No filler, anywhere** — the `DEFAULT_DRAFT` courtesy phrase is deleted for
  **all** channels. When no concrete answer can be produced, no reply approval is
  created at all; the item surfaces as notify-only for the operator to answer.

Laws preserved: the Tier-3 gate is untouched (Law 1) — this changes draft
_quality_, never autonomy. Inbound Jira content stays untrusted data behind
`envelopeInbound` (Law 4). Nothing is sent without operator approval (Law 3).

### Operator decisions taken during brainstorming

1. Owner scope is **assignee OR reporter OR watcher** (`currentUser()`).
2. Only comments create reply items — issue events do not (option A).
3. The no-filler rule is **global across integrations**: _"Odpověď by u všech
   integrací měla vždy být konkrétní a pokud to není možné tak musím zasáhnout
   já."_
4. The one-time GitHub→Jira migration backlog is explicitly out of scope; new
   issues are authored natively in Jira with correct `author` fields.

---

## Findings that constrain the design

Verified live against `teamdotblue.atlassian.net` (project `CZ3TDR1`, as
`karel.zibar@team.blue`) during brainstorming:

- **JQL cannot express mentions on this instance.** `comment ~ currentUser()`,
  `comment ~ "<accountId>"`, `comment ~ "Zíbar"` and `comment IS NOT EMPTY` all
  return 0, while `CZ3TDR1-471` demonstrably holds 6 comments. Comment search is
  not usable here. Mention filtering **must** happen adapter-side. (The design is
  correct whether the cause is a missing index or an API-path quirk, so no further
  diagnosis is warranted.)
- **Owner scope is small.** `project = CZ3TDR1 AND (assignee = currentUser() OR
reporter = currentUser() OR watcher = currentUser())` → **21 issues**, versus
  100+ items ingested today.
- **Comments arrive inline on the search response.** `/rest/api/3/search/jql` with
  `fields=comment` returns `fields.comment.comments` — no per-issue N+1 call. It
  returns one page (`maxResults`/`total` present on the object), so pagination
  needs a guard (see A3).
- **Migrated comments carry no real mentions.** Every pre-existing comment is
  authored by the `SVC Jira CZ3 shoptet-migration` service account with the real
  author embedded in the body text, and `@handles` as plain text with placeholder
  `data-id="id-0"`. AccountId-based ADF mention matching therefore ignores them
  automatically — which is exactly the agreed behaviour, at no extra cost.
- **`ProjectLocalService.resolveForRun()` already solves the repo problem**
  (`apps/api/src/projects/project-local.service.ts:112`): it returns the local
  checkout, cloning from `gitRemote` into the machine `cloneRoot` when absent.
  `shoptet-partner-cli` has no `path`, only `gitRemote`, so this path is load-bearing.
- **Precedent exists.** The GitHub adapter already scopes to
  `mentions:{username}` (`github.adapter.ts:110`, phase-126a). The Jira adapter is
  the laggard; this aligns the two.

---

## A. Adapter — `apps/api/src/channels/adapters/jira.adapter.ts`

### A1. Operator identity

Resolve the operator's `accountId` once per integration via
`GET /rest/api/3/myself`, memoized for the process lifetime (same posture as the
existing `test()` call). Needed because ADF mention nodes carry `accountId`, not
email. Failure to resolve → the poll throws and the watcher's existing
retry/backoff (M8) applies; it must **not** silently degrade to un-scoped ingest.

### A2. Poll JQL stays broad

```
(<config.jql ?? `project = <projectKey>`>) AND updated >= "<cursor>"
```

Unchanged from today, deliberately: a mention on an issue the operator does _not_
own must still be fetched, and JQL cannot filter it (see Findings). **Owner scope
governs item creation, not fetching.** A custom `config.jql` still wins verbatim.

Fields requested: `summary,description,updated,reporter,assignee,watches,comment`.
`watches.isWatching` supplies the watcher leg of the owner test per issue with no
extra call (the API token user _is_ the operator).

### A3. Comment pagination guard

The inline `fields.comment` object exposes `total` and `comments`. When
`comments.length < total`, fetch that issue's comments from
`/rest/api/3/issue/<key>/comment` with `startAt`/`maxResults` paging, newest-relevant
first, and use that list instead. Prevents silently dropping the newest comments if
the inline page is the oldest one.

### A4. Item construction — comments only

For each issue in the response, for each comment:

| Test                                                                                                | Behaviour                                             |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `comment.author.accountId === operatorAccountId`                                                    | **skip** (never reply to self)                        |
| `comment.created`/`updated` older than cursor                                                       | **skip** (already seen; dedup-by-id also covers this) |
| issue is owned (`assignee`/`reporter` accountId === operator, **or** `watches.isWatching === true`) | **emit**                                              |
| else, comment ADF contains a `mention` node with `attrs.id === operatorAccountId`                   | **emit**                                              |
| else                                                                                                | **skip**                                              |

No issue-level `InboundMessage` is emitted under any condition.

Emitted shape:

- `id`: `jira-<KEY>-c<commentId>` — deterministic, distinct from the old
  `jira-<KEY>` ids, so dedup-by-id keeps re-polls idempotent.
- `externalRef`: `{ channel: projectKey ?? baseUrl, messageId: <KEY> }` —
  **the issue key, not the comment id**, so `send()` continues to POST the reply
  as a comment on the right issue.
- `from`: comment author `displayName`.
- `receivedAt`: comment `created` (ISO).
- `url`: `<baseUrl>/browse/<KEY>?focusedCommentId=<commentId>`.
- `text`: the flattened context block —

  ```
  [<KEY>] <summary>

  Issue description:
  <ADF→text of fields.description, truncated>

  Comment by <displayName>:
  <ADF→text of comment.body>
  ```

- `raw`: `{ issue, comment }`.

Cursor advance is unchanged: newest `fields.updated` seen this poll.

---

## B. ADF → plain text — `apps/api/src/shared/text/adf-to-text.ts` (new)

A pure module, no Nest DI:

- `adfToText(node: unknown): string` — handles `doc`, `paragraph`, `text`,
  `hardBreak`, `heading`, `bulletList`/`orderedList`/`listItem`, `codeBlock`,
  `blockquote`, `rule`, `mention` (→ `@<attrs.text ?? attrs.id>`), `emoji`
  (→ `attrs.shortName`), `inlineCard`/link marks (→ `text (href)`), `mediaGroup`
  (→ `[attachment]`). Unknown node types recurse into `content` and are otherwise
  ignored — never throws on unexpected input.
- `collectMentionAccountIds(node: unknown): string[]` — every `mention` node's
  `attrs.id`.

This is the fix for the root cause: today `description` is fetched and then
**discarded** (`jira.adapter.ts:110` builds `text` from the summary alone), which
is why the triager had nothing to answer and fell through to the phrase.

Truncation: the enriched `text` is far longer than `[KEY] summary`, and
**`ChannelItemSchema.text` is capped at 4500 characters**
(`libs/contracts/src/channels/channel.schema.ts:69`). Exceeding the cap is not a
soft failure — `ChannelItemStore.readFile` schema-parses on every read, so an
oversized item silently vanishes from `list()`. The adapter therefore truncates
when building the item: the comment (the thing that must be answered) claims its
budget first, the description takes what is left, and a cut is marked with `…`.
_(Amendment: the cap was not stated in the first draft of this spec.)_

---

## C. Contracts — `libs/contracts` (first, source of truth)

- `ChannelItemSchema.state`: add `"needs-draft"`. Semantics: triaged, awaiting the
  research sweeper; **no approval exists**, so nothing is sendable.
- `ChannelItemSchema`: add `draftResearch?: { status: "pending" | "ok" | "failed";
attempts: number; startedAt?: string; finishedAt?: string; reason?: string }` —
  the in-flight marker and audit trail (files are the source of truth).
- No `JiraConfigSchema` change: `jql` already exists and is honoured; the new
  scoping is behaviour, not configuration.

---

## D. Reply research — `apps/api/src/channels/reply-draft/` (new)

### D1. `ReplyDraftService`

`research(item: ChannelItem): Promise<string | null>`

1. Resolve the project from `item.projectId` → `ProjectLocalService.resolveForRun()`
   → repo path (clones on first use). No `projectId`, or unresolvable → return
   `null` immediately (no repo, no grounded answer).
2. Spawn headless Claude via the existing `spawnClaudeCli` helper:
   - `cwd` = the resolved repo path
   - `--allowedTools Read,Grep,Glob` — **read-only, no Write/Edit/Bash**
   - `--model sonnet`, `--output-format json`
   - timeout ~5 minutes (contrast: the triager's 8s)
   - the same `process.env.VITEST` guard as `ClaudeCliTriager` so tests never spawn
3. Prompt = operator-authored system prompt + `envelopeInbound(item.text)`. The
   system prompt instructs: answer the question **concretely**, cite
   `file_path:line` for every claim drawn from the repo, and — if the repo does not
   contain the answer — return the explicit sentinel `NO_ANSWER` rather than
   guessing or padding.
4. Return the answer text, or `null` on `NO_ANSWER` / timeout / spawn failure /
   empty output.

### D2. `ReplyDraftSweeperService`

Mirrors the existing `sweepOutcomes()` pattern on `ChannelTriageFlowService`:

- Selects items in state `needs-draft` where `draftResearch` is absent, **or**
  `status === "failed"` with `attempts < 2`. An item with
  `status === "pending"` is skipped (in flight); one with `attempts >= 2` is
  terminal-failed and is swept once to the notify-only path (F), never re-researched.
- Bounded concurrency — at most **N = 2** researches per tick; writes
  `draftResearch.status = "pending"` and increments `attempts` **before** spawning,
  so a slow research is not double-spawned across ticks.
- On success → `status = "ok"`, hands the draft to the tier/gate stage (E).
- On `null` → `status = "failed"` with `reason`; if `attempts >= 2`, the item takes
  the notify-only path (F) immediately.
- A `pending` item whose `startedAt` is older than 3× the research timeout is
  considered crashed (process restart mid-research) and is reset to `failed` so the
  retry budget — not a stuck marker — decides its fate.

---

## E. Flow reordering — `channel-triage-flow.service.ts`

This is the structural change; it must not be bolted onto the existing order.

**Today**

```
handle() → triage → tier decision → park approval (or Tier-2 auto-send) with whatever draft exists
```

**New**

```
handle() → triage → item.state = "needs-draft"        (no approval; nothing sendable)
sweeper  → ReplyDraftService.research()
         → draft?  → tier decision + gate → park approval (or Tier-2 auto-send)
           no draft → notify-only surface (F)
```

The Tier-2 auto-send path, the `evaluateReply()` gate, and the Herald graduation
promotion **all move to the sweeper stage**, after the draft exists. Leaving them
in `handle()` would make Tier-2 fire before any researched draft is available and
regress the auto-send to sending nothing.

Tier-1 dispatch (a `bug` verdict spawning a delivery task) and the gated
`maybeFileJiraBug` remain in `handle()` — they do not depend on a reply draft.

Herald ledger semantics are preserved: `recordProposal` fires when the proposal is
actually made (now in the sweeper), `recordDecision` on approve/reject as today.

---

## F. No-filler rule — global

- Delete the `DEFAULT_DRAFT` constant (`channel-triage-flow.service.ts:40`) and the
  `|| DEFAULT_DRAFT` fallback in `draftOf()` (`:572`).
- Delete the **two further filler phrases in the keyword triager** —
  `keyword-triager.ts:46` ("Thanks for the details — I'll review and get back to you
  shortly.") and `:56` ("Thanks for reaching out — here's where things stand."). The
  deterministic fallback triager classifies; it never proposes reply text. Its test
  (`keyword-triager.test.ts:16`) asserts `suggestedReply` is truthy today and must be
  inverted. _(Amendment: found while writing the plan; the first draft of this
  section named only the flow-service constant.)_
- `draftOf()` returns `string | null`.
- **No draft → no reply approval.** The item is set to `state: "triaged"` and
  surfaces through the existing `channel-needs-attention` activity path with the
  operator-owned summary. `parkForApproval` is never called without a draft.

This is channel-global by the operator's decision (3) and affects the GitHub
channels (`shoptet-github-cms4`, `shoptet-partner-cli-github`) as well as Jira. The
research path (D) keys off `item.projectId`, not `item.kind`, so it applies to any
channel whose project resolves to a repo — GitHub included.

Email stays notify-only throughout (`NOTIFY_ONLY_KINDS`), unchanged.

---

## G. Security posture (Law 4)

The researcher processes untrusted inbound text **while holding tools** — the one
genuinely new exposure in this design. Non-negotiable constraints:

- Tools are **read-only**: `Read`, `Grep`, `Glob`. No `Write`, `Edit`, `Bash`,
  `WebFetch`.
- The item text enters the prompt **only** inside `envelopeInbound`, and the
  system prompt states the message is data, never instructions.
- The researcher's only output is draft text. It cannot change tier, gate, or
  approval state — it returns a string to the sweeper, which owns those decisions.
- The Tier-3 approval gate is unchanged. Every reply still requires the operator.

---

## Testing

- `adf-to-text` unit: each node type, nested lists, mention/emoji/link, unknown
  node tolerance, `collectMentionAccountIds`.
- `jira.adapter` poll (stub `fetch`, existing pattern): self-authored comment
  skipped; owned-issue comment emitted; non-owned + mention emitted; non-owned +
  no mention skipped; watcher leg via `watches.isWatching`; no issue-level items;
  `externalRef.messageId` is the issue key; pagination guard when
  `comments.length < total`; cursor advance.
- `ReplyDraftService` (VITEST guard, stubbed spawn): repo resolution, `NO_ANSWER`
  → `null`, timeout → `null`, missing `projectId` → `null`.
- `ReplyDraftSweeperService`: in-flight marker prevents double-spawn; concurrency
  bound respected; retry budget; success → park path, failure → notify-only path.
- `channel-triage-flow` : `needs-draft` transition creates **no** approval; sweeper
  success parks with the researched draft; sweeper failure parks **nothing** and
  surfaces notify-only; Tier-2 auto-send and graduation fire from the sweeper stage;
  `DEFAULT_DRAFT` is gone (assert no phrase-shaped fallback).

---

## Operational steps (part of the plan, not a surprise later)

Executed as the final task, after the code lands:

1. Bump the integration cursor to _now_. It currently sits at `2026-07-31`; a broad
   `updated >= cursor` poll on re-enable would drag the whole CZ3TDR1-5xx wave —
   just cleaned up — through the new pipeline.
2. Mark the 4 stored `state: "new"` items `ignored`; they predate the new scoping.
3. Optionally clear the 73 orphaned `triaged` items with no approval (inert, from
   earlier runs).
4. Re-enable `shoptet-dev-rel-jira` (`enabled: true`).

Already done before this spec: all 35 pending approvals rejected (nothing sent to
Jira), integration set `enabled: false`.

---

## `spawnClaudeCli` needs one extension

`apps/api/src/shared/spawn-claude-cli.ts` spawns with
`stdio` only — **there is no `cwd` option**, so every current caller inherits the
API process's working directory. The researcher must run inside the project repo,
so `SpawnClaudeCliOptions` gains an optional `cwd?: string` passed through to
`spawn()`. Additive and backwards-compatible: the five existing callers
(`claude-cli-router`, `claude-cli-task-namer`, `claude-cli-briefer`,
`claude-cli-distiller`, `claude-cli-triager`) omit it and are unaffected.

`--allowedTools` needs no change — `args` is full argv.

The `timeoutMs` contract already fits (the helper kills the child on timeout), and
the bare `child.kill()` posture documented in that file remains correct: the
researcher is still a one-shot, non-detached `claude -p` call.

## Verify during implementation

- `watches.isWatching` is returned by `/search/jql` for the token user. The adapter
  treats a missing `watches` object as "not watching" (falling back to the
  assignee/reporter/mention legs), so the design is correct either way; confirm
  against the live API once and pin it in a test fixture.

## Dependency order

1. **Contracts** — `needs-draft` state, `draftResearch` field. Blocks the rest.
2. **`adf-to-text`** — pure, no dependencies, needed by the adapter.
3. **Jira adapter** — poll rework, comment items, mention/owner filtering.
4. **`spawnClaudeCli` `cwd` + `ReplyDraftService`** — research pass (independent of
   3; needs 1).
5. **Flow reordering + sweeper + `DEFAULT_DRAFT` removal** — depends on 1, 4.
6. **Operational steps** — cursor bump, item cleanup, re-enable.
