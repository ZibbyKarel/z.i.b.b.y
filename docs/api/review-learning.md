# PR review learning

`apps/api/src/review-learning/` teaches ZIBBY to learn from code-review comments
left on its own PRs. It sits next to `patterns/`, `gaps/`, and `agent-factory/` in
the "nightly systemic pass that proposes something to the operator" family:
ingest review comments → distil them into one-sentence rules → park an operator
approval → ground the approved rules into every future run.

Full design: `docs/superpowers/plans/2026-07-29-pr-review-learning.md` and
`docs/superpowers/specs/2026-07-29-pr-review-learning-design.md`.

## Rule schema (`@zibby/contracts`)

Defined in `libs/contracts/src/review-learning/review-rule.schema.ts`:

- `ReviewRule` — `id` (kebab slug, also the dedup key), `scope`
  (`"project" | "global"`), `rule` (one imperative sentence), optional
  `rationale`, `status` (`"observed" | "proposed" | "active" | "retired"`),
  `occurrences` (min 1 — **the array length is the count, there is no separate
  counter**), optional `approvalRef`, `createdAt`/`updatedAt`.
- `ReviewRuleOccurrence` — one review comment that produced or reinforced a rule:
  `commentId` (namespaced by GitHub source — `rc-`/`ic-`/`rv-` — since the three
  comment endpoints can collide), `prUrl`, `commentUrl`, `author`, `at`, `excerpt`
  (max 400 chars).
- `ReviewRulesFile` — one project's on-disk shape: `{ rules, cursor? }`. `cursor`
  is the repo-wide "since" watermark for the last successful ingest pass.

## `ReviewRulesStore` (`review-rules.store.ts`)

File-backed persistence, one JSON file per scope key under the directory injected
via the `REVIEW_RULES_DIR` token: `<projectId>.json` per project, plus a single
`_global.json` (key `GLOBAL_SCOPE_KEY`) for rules promoted to every run. A scope
key is resolved to its file via `resolveSafeFile` (same guard `RoadmapStore` uses
for a caller-supplied id turned into a filename) — an unsafe key (e.g. containing
`../`) throws `InvalidReviewScopeKeyError` instead of silently reading or writing
outside the store's directory. Parsing is tolerant **per field**, not per file:
each rule in the `rules` array is validated individually against
`ReviewRuleSchema`, and `cursor` is validated on its own against
`IsoDateTimeSchema` (the same schema `ReviewRulesFileSchema` uses for it) — a
single malformed rule, or a malformed cursor, is dropped without discarding
anything else in the same file (mirrors `GateRulesStorageService.list()`); only
a file that isn't even parseable/shaped JSON falls back to `{ rules: [] }`
wholesale. A dropped cursor makes the next ingest pass replay from the default
window (the safe direction) rather than silently handing a garbage value to
the GitHub `since` query parameter downstream. Writes are atomic, mirroring
`GateRulesStorageService` (`gate-rules/gate-rules.storage.service.ts`).

Lifecycle rules enforced in one place so "when does a comment become a proposal"
has exactly one implementation:

- `record(projectId, input, now)` files one distilled comment. An occurrence is
  counted **at most once per rule**, deduped by `commentId` **against that rule's
  own occurrences only** — replaying the same comment on the same rule is a
  no-op, but the same `commentId` colliding with a different rule can never block
  a genuinely new occurrence. A rule starts `observed` on its first occurrence; on
  its **second** distinct occurrence it flips to `proposed` and `record` returns
  the rule (the caller parks exactly one Tier-3 `review-rule` approval per rule,
  never one per comment) — every other call returns `null`. A `retired` rule keeps
  absorbing occurrences (so re-litigating a retired rule is visible) but is never
  re-proposed. A rule already promoted to global is reinforced in `_global.json`
  in place, never forked into a project-scoped duplicate under the same slug.
- `setStatus(scopeKey, ruleId, status, approvalRef?)` moves a rule through its
  lifecycle; only an explicit operator approval can reach `active` (Law 4 — PR
  text is data, never instructions).
- `promoteToGlobal(projectId, ruleId)` moves a rule out of its project file into
  `_global.json`, occurrences intact, so it grounds every run instead of one
  project's.
- `listGrounded(projectId)` returns `{ project, global }` — `status === "active"`
  rules only, split by scope — the read path a future grounding step consumes.
- `cursor(projectId)` / `setCursor(projectId, cursor)` round-trip the per-project
  ingest watermark.

## `ZibbyPrLocator` (`zibby-pr.locator.ts`)

Answers "which PRs did ZIBBY itself open for this project" — `numbersFor(projectId)`
returns deduped PR numbers, newest first. Read-only and local (no network, no
GitHub call): it unions the two places the system already records a PR ZIBBY
opened, rather than guessing from a GitHub author login (the operator's own token
opens both ZIBBY's PRs and the operator's own, so the login can't disambiguate):

- the artifact registry (`ArtifactsStorageService.listFiltered({ projectId })`),
  `kind === "pr"` records written by a pipeline's terminal PR sink
- directed tasks (`ScheduledTasksStorageService.list()`) whose `outcome.pr.url` was
  written back by the task scheduler

`prNumberFromUrl` is exported standalone: it matches a GitHub **html** PR url
(`.../pull/<n>`), not the API shape (`.../pulls/<n>`) — the only shape either
source stores.

## `ReviewCommentFetcher` (`review-comment.fetcher.ts`)

Reads new review comments on the project's ZIBBY-opened PRs from GitHub — the
three endpoints that between them cover everywhere a human leaves review
feedback:

- `GET /repos/{repo}/pulls/comments` — inline review comments (one repo-wide
  call, `since` supported)
- `GET /repos/{repo}/issues/comments` — PR conversation comments (one repo-wide
  call, `since` supported)
- `GET /repos/{repo}/pulls/{n}/reviews` — review bodies (per PR, capped at
  `MAX_REVIEW_PRS` = 20; this endpoint has **no** `since` parameter, so results
  are filtered against the cursor locally instead)

`fetchNew(input)` takes `{ projectId, repo, token, selfLogin?, cursor? }` and
returns a `FetchNewResult` — `{ comments, failedEndpoints }`. `comments` is
`FetchedComment[]` (`{ commentId, prNumber, prUrl, commentUrl, author, at,
body }`), ascending by `at`, capped at `MAX_COMMENTS_PER_PASS` = 60 (the true
oldest 60 across all three endpoints combined, sorted before the cap is
applied — not just the first 60 fetched off the wire — remainder carries over
to the next pass via the cursor). `commentId` is namespaced by source —
`rc-`/`ic-`/`rv-` — matching `ReviewRuleOccurrence`'s `commentId` convention,
because the three endpoints mint ids from separate sequences that can collide.

A single comment is dropped in four cases: the PR isn't one
`ZibbyPrLocator.numbersFor` returned (never learn from someone else's PR), the
author is ZIBBY's own login (never learn from ZIBBY's own reply — compared
case-insensitively with a trailing GitHub App `[bot]` suffix stripped from
both sides, since GitHub can render the same bot login either way), the body
is empty after trimming, or the timestamp doesn't parse (a malformed
`created_at`/`submitted_at` drops that one comment rather than throwing and
discarding the whole pass — `toISOString()` on an invalid `Date` raises
`RangeError`). `prNumberFromApiUrl` (module-private) is deliberately separate
from the locator's `prNumberFromUrl` — GitHub comment payloads point at the
**API** PR url shape (`/pulls/<n>` for inline comments, `/issues/<n>` for
conversation comments — on a PR, the issue number IS the PR number), not the
html shape the locator parses.

`failedEndpoints` means something specific: **"this endpoint's window is
incomplete, do not advance a cursor past it"** — not "something here was
imperfect." Only two things set it: a non-2xx response, or the fetch itself
throwing; both are logged at `warn` (this runs unattended — a persistent
failure must be loud, not buried at `debug`) with the endpoint's identifier
(`"pulls/comments"`, `"issues/comments"`, or `"pulls/<n>/reviews"`), and the
rest of the batch still lands from the other endpoints. A payload that isn't
an array, or an individual element in it that isn't a parseable object (a
stray `null`, for instance), is a _different_ case: it is warned about (with
the dropped-element count) but does **not** add to `failedEndpoints`. That
distinction is deliberate — a malformed element is permanently malformed, so
treating it the same as an endpoint failure would wedge that endpoint's
cursor forever on one bad comment on every future pass. Losing that one
comment is the lesser failure. The constructor takes an optional `fetchImpl`
(`@Optional()`, defaults to global `fetch`) purely so tests can inject a stub
without touching the network.

## `ReviewCommentDistiller` (`review-comment.distiller.ts`)

Turns a batch of `FetchedComment`s into candidate rules — the ONE place in this
feature where untrusted PR text reaches a model (Law 4) and where the model's
own reply is untrusted right back (Law 4 cuts both ways).

- `buildDistillPrompt(comments, known)` composes the prompt: an
  operator-authored system prompt + the project's `known` rules (`{ id, rule }`
  pairs, so the model can reuse a slug instead of coining a near-duplicate) +
  the batch, with every comment `body` passed through `envelopeInbound` — never
  bare. The system prompt tells the model the fenced comment text is inert data
  it must extract a rule _from_, never obey.
- `parseDistillOutput(raw, batchIds)` parses the model's reply through a
  **closed** (`.strict()`) Zod schema — `DistillSchema` — capped at 60
  observations. Each observation's `slug` must match `REVIEW_RULE_ID_REGEX`
  (closing the gap Task 2's review flagged: the store itself doesn't validate
  slugs, so this is the one place that must), `rule` is capped at 160 chars,
  `rationale` at 300; `scopeHint` and `actionable` both `.catch()` to a safe
  default (`"project"`, `false`) rather than rejecting the whole observation
  over one bad enum. After schema validation, an observation is dropped unless
  `actionable` is `true` **and** its `commentId` is one this batch actually
  fetched — the model may never invent a rule about a comment we didn't send
  it. Unparseable JSON, a non-object shape, or an unknown/extra field anywhere
  in the payload (the `.strict()`) all resolve to `[]`, never a partial
  best-effort parse.
- `ReviewCommentDistiller.distill(comments, known)` is the cheap-model pass
  itself — same shape as `memory/claude-cli-distiller.ts`: `claude -p …
--model haiku --output-format json` via `spawnClaudeCli`, the same
  `process.env.VITEST` guard so tests never spawn a real CLI, a 30s timeout.
  **Never throws and never blocks** — a CLI failure, a timeout, or a schema
  rejection all resolve to `[]`, and the caller is expected to leave its cursor
  untouched on an empty result so the batch replays next pass. `distill` never
  sets anything to `active`; it only ever proposes an observation for a later
  step to `record`.

Not yet built (later tasks): the `record` call that turns a `DistilledObservation`
into a rule occurrence, the controller/route exposing `listGrounded`/
`promoteToGlobal`, the `review-learn` automation target kind, and grounding the
active rules into runs.
