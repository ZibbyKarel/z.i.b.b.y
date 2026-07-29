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

All three calls ask for `per_page=100`. On the two repo-wide ones that is only a
round-trip saving, but on `/pulls/{n}/reviews` it is correctness: with no `since`
to narrow the window, GitHub's default 30-item page would make the 31st-and-older
review body on a long-lived PR permanently unreadable rather than merely deferred.

A project with no ZIBBY-opened PRs short-circuits before any GitHub call and is
logged at `info` (not `debug`): it only fires for a project that IS linked to
GitHub, so it can't flood the log, and it is the single likeliest reason the
feature looks dead on a first real run — otherwise indistinguishable from a
healthy "no new comments" pass.

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
  operator-authored system prompt + fenced inbound text. **Every** piece of
  text that originated outside this process goes through `envelopeInbound` —
  never bare: each comment's `body`, each comment's `author` (a GitHub login
  is still inbound, unauthenticated-by-us text), and the entire `known` rules
  block (`{ id, rule }` pairs, so the model can reuse a slug instead of coining
  a near-duplicate). `known` gets its own envelope for a specific reason: those
  rule sentences are themselves earlier model output distilled from PR
  comments with no operator sign-off yet (`observed`/`proposed`), so re-firing
  them into a _later_ prompt in "reuse these slugs" instruction position would
  otherwise be a second, unfenced injection path. The system prompt draws a
  deliberate line between the THREE fenced surfaces: the comment `body` is the
  only one the model extracts a rule _from_; the `author` and `known` fences
  are labelled REFERENCE data — untrusted, fenced, but there to be **matched
  against** (that is how slug reuse works, called out as "the MOST IMPORTANT
  part" of the job), never treated as something to extract a rule out of.
  Getting this distinction wrong would have been silent and severe: slug reuse
  is what lets a comment ever reach a second occurrence, which is what makes a
  rule `proposed` in the first place — without it the feature would propose
  nothing and look like it does nothing.
- `parseDistillOutput(raw, batchIds)` validates in two tiers and returns a
  `DistillParseResult` (`{ observations, dropped, usable }`), not a bare array.
  `ReplyShapeSchema` checks ONLY the reply's outer shape — `{ observations:
[...] }`, closed (`.strict()`) against any other top-level key, with the
  array itself bounded at `MAX_OBSERVATIONS_IN_REPLY` (500) — and the whole
  reply resolves to `{ observations: [], dropped: 0, usable: false }` if any of
  that fails (unparseable JSON, a non-object shape, an unknown top-level key, or
  an observations array too long to plausibly come from a ≤60-comment batch).
  That length bound is independent of, and checked before, the per-element
  parsing below — without it, per-element tolerance means a model-controlled
  array of arbitrary length gets `safeParse`d element by element in full
  before the keep-cap ever kicks in.

  Each element of `observations` is then validated individually and
  independently against `ObservationSchema` — also **closed** (`.strict()`),
  so an observation carrying an unexpected field (e.g. an injected `status:
"active"` riding alongside the expected keys) is rejected outright rather
  than having the extra key silently stripped and the rest let through.
  `slug` must match `REVIEW_RULE_ID_REGEX` (closing the gap Task 2's review
  flagged: the store itself doesn't validate slugs, so this is the one place
  that must), `rule` is capped at 160 chars, `rationale` at 300; `scopeHint`
  and `actionable` both `.catch()` to a safe default (`"project"`, `false`)
  rather than rejecting the observation over one bad enum value. `batchIds` is
  the id set of the **chunk the reply answers**, not of the whole pass (see
  _Argv budget_ below): a comment in one chunk must not be able to name a
  `commentId` from another, or an occurrence gets filed against a comment that
  model never saw. An observation that fails `ObservationSchema`, is flagged
  non-actionable, or names a `commentId` that was not in its own chunk is
  dropped **on its own** —
  every valid sibling in the same reply still comes through, capped at 60 kept
  observations (`MAX_OBSERVATIONS_PER_REPLY`). This mirrors
  `ReviewCommentFetcher.fetchNew`'s per-**element** tolerance within one
  endpoint's payload (a malformed array element there is warned about and
  skipped without failing the whole endpoint) for the identical reason: the
  caller is expected to leave its cursor untouched on an empty result and
  replay the batch next pass, so one deterministically-malformed observation
  must never be able to wedge an otherwise-good batch forever by discarding
  everything alongside it. `{ observations: [], dropped: 0 }` is reserved for
  a reply that is wholly unusable, never for what one observation inside an
  otherwise-fine reply happened to contain.

  `usable` is `false` for exactly that wholly-unusable case and `true`
  otherwise — including for a reply that parsed perfectly and simply carried
  nothing actionable (an `LGTM`/`thanks`/`done` window), which is `{
observations: [], dropped: 0, usable: true }`. Both produce zero
  observations, and telling them apart is what lets the caller advance its
  cursor over a genuinely non-actionable window instead of holding it forever
  (see `ReviewLearningService`'s cursor discipline below).

  `dropped` counts ONLY observations that failed `ObservationSchema` —
  malformed shape, or an unexpected field like the injected `status: "active"`
  case above. It deliberately does NOT count an observation that parsed
  cleanly but was filtered as non-actionable or as naming a `commentId`
  outside the batch — those are routine outcomes of a normal reply, not the
  security-relevant event the count exists to surface. `logDroppedObservations(log,
dropped)` — a small standalone function so it's testable without the
  `VITEST`-gated CLI path — emits one `warn` when `dropped > 0`, mirroring the
  fetcher's own "dropped malformed comment payload elements" warn: an
  observation that would once have failed loudly enough to empty the whole
  reply now vanishes silently under per-element tolerance unless something
  logs it.

- `ReviewCommentDistiller.distill(comments, known)` is the cheap-model pass
  itself — same shape as `memory/claude-cli-distiller.ts`: `claude -p …
--model haiku --output-format json` via `spawnClaudeCli`, the same
  `process.env.VITEST` guard so tests never spawn a real CLI, a 30s timeout.
  **Never throws and never blocks.** It returns a discriminated `DistillOutcome`,
  not a bare array, because "the model ran and found nothing actionable" and
  "the distiller failed or never ran" are the same empty result and must move
  the caller's cursor differently:

  - `{ status: "ok", observations }` — every call completed and returned a
    usable reply. `observations` may be empty; that is a real answer and the
    cursor MAY advance.
  - `{ status: "incomplete", observations, reason }` — at least one call
    failed, with `reason` one of `"not-run"` (the `VITEST` guard),
    `"cli-failed"` (missing binary, non-zero exit, or the 30s timeout — logged
    at `warn`, matching the fetcher, because an unattended malfunction must be
    loud) or `"unusable-reply"` (an outer-shape rejection: unparseable JSON,
    non-object, unknown top-level key, or an oversized `observations` array).
    The cursor is held and the batch replays next pass; `observations` still
    carries whatever DID come back, the same posture `failedEndpoints` takes.

  A per-observation rejection is neither — see the two-tier validation above; it
  calls `logDroppedObservations` and still returns every valid sibling under
  `status: "ok"`. `distill` never sets anything to `active`; it only ever
  proposes an observation for a later step to `record`.

- **Argv budget.** The whole prompt rides in one `claude -p <prompt>` argv
  entry, and Linux caps a single argument at `MAX_ARG_STRLEN` = 128 KiB no
  matter how much total `ARG_MAX` is free (this repo has been bitten once
  already — the agent catalog had to move to `--append-system-prompt-file`).
  `chunkForArgvBudget(comments, known)` splits a batch so no prompt exceeds
  `MAX_PROMPT_BYTES` = 96 000 **bytes** (UTF-8, not characters — the prompt
  carries Czech and whatever an outsider wrote), and one CLI call is made per
  chunk, merging the observations and reporting `incomplete` if any chunk
  failed. That loop lives in `distillChunks(chunks, known, runCli, log)`, a
  standalone function rather than inline in `distill` — `distill`'s own
  `VITEST` guard short-circuits before the loop, so as a method body the merge
  that decides whether the caller's cursor advances could not be reached by any
  test. Taking `runCli` as a parameter lets a test drive the loop with a fake
  CLI: `distill` passes the real `spawnClaudeCli` call, a test passes a stub
  that fails for one chunk and succeeds for the others. `reason` is
  first-failure-wins (`incomplete ??=`). `sanitizeInbound`'s existing `MAX_INBOUND_CHARS` = 4000 cap on
  every enveloped value means one comment can never exceed the budget alone, so
  a chunk always makes progress. Chunking rather than a file/stdin hand-off is
  deliberate: `spawnClaudeCli` spawns with `stdio: ["ignore", …]`, has no
  file-based prompt path, and is shared by five other callers — giving it one
  would change the single code path that talks to the real CLI, which the
  `VITEST` guard means no test can exercise. Chunking stays local, is directly
  testable, and keeps the guarantee `MAX_COMMENTS_PER_PASS`'s carry-over relies
  on: no comment is ever silently dropped.

## `ReviewRulesVaultService` (`review-rules.vault.service.ts`)

Renders `listGrounded`'s `active` rules into the vault notes `GroundingService`
loads unconditionally (Task 7 — see below) — the artifact this whole learning
loop exists to produce. Two note ids, exported from
`apps/api/src/memory/review-rules-note.ts` (deliberately in `memory/`, next to
`subsystem-shelf.ts`, so `GroundingService` can ground them without the memory
module importing the review-learning module):

- `GLOBAL_REVIEW_RULES_ID` = `"review-rules"` — the cross-project note
  (`<vault>/review-rules.md`), grounded into every work run (F8: not a
  `domain: "personal"` run — see Task 7 below).
- `reviewRulesIdFor(projectId)` = `` `${projectId}-review-rules` `` — one
  project's note, written to disk at
  `<vault>/projects/<projectId>-review-rules.md` but looked up by
  `VaultService.note()` as the bare basename `<projectId>-review-rules` (no
  `projects/` prefix — `VaultService.scan()` derives every note's id via
  `path.basename(file, ".md")`, same as `ProjectVaultService`'s own
  `vault/projects/<id>.md` note, which is looked up as plain `<id>`), grounded
  only into that project's runs.

`render(projectId)` reads `ReviewRulesStore.listGrounded(projectId).project` and
rewrites that project's note; `renderGlobal()` reads
`ReviewRulesStore.list(GLOBAL_SCOPE_KEY)` filtered to `status === "active"` and
rewrites the cross-project note. Both are fire-and-forget mirrors — a write
failure is logged at `warn` and never thrown (the `ProjectVaultService`
posture: rules are reinforcing context, not something a run should ever block
on).

Three things this renderer is deliberately strict about:

- **Only `active` rules are ever rendered.** `observed`/`proposed`/`retired`
  never reach a note — `listGrounded` already filters to `active`, and both
  `render` and `renderGlobal` re-apply the same `status === "active"` filter
  explicitly rather than trusting the store's contract alone (defense in
  depth — a regression in either place must not silently ship). A `proposed`
  rule showing up in a prompt would mean inbound PR text changed ZIBBY's
  behaviour without an operator approval — the Law-4 violation this whole
  feature exists to prevent.
- **M7 project isolation.** `render(projectId)` resolves the note path via
  `resolveSafeFile(projectsDir, projectId, "-review-rules.md", AGENT_ID_REGEX)`
  (the same guard `RoadmapStore`/`ReviewRulesStore` use for a caller-supplied id
  turned into a filename) — a traversal-shaped `projectId` is refused and
  logged rather than writing outside `projects/`, and the note's frontmatter
  carries an explicit `project: <id>` tag so grounding's isolation filter can
  never conflate one project's rules with another's or with the global note.
- **Untrusted rule text stays inert.** `rule.rule`/`rule.rationale` are model
  output distilled from attacker-controllable PR comments, and this note is
  prepended verbatim into every future run's prompt. Every rendered value goes
  through `sanitizeInline` (collapses `\r`/`\n` to a single space) before being
  written — without an embedded newline, a hostile value can never start a
  _new_ line of its own, so it can never fake a markdown heading, a ` ``` `
  fence, or a YAML/frontmatter `---` delimiter (all of which require being
  alone at the start of a line to take effect). It survives only as inert
  inline text on the one `- ` bullet line it was given.

Rendering is capped at `MAX_RENDERED_RULES` = 25 (the grounding block has a
char budget) — kept rules are the most recently `updatedAt`, not an arbitrary
25; the note says explicitly how many were dropped
(`_Dalších <n> pravidel se do rozpočtu promptu nevešlo._`) rather than silently
truncating. An empty rule list still produces an explicit note (`Zatím žádné
schválené pravidlo z review.`), not a missing file.

## Grounding the rules notes (Task 7)

**File:** `apps/api/src/memory/grounding.service.ts` (`GroundingService.compose`)

Two `add()` calls, grouped together right after the North Star and
self-knowledge notes and ahead of the subsystem shelf / term-matched MOCs /
1-hop wikilink expansion — never term-matched, because a rule exists
precisely because the operator already had to say it twice:

- `add(GLOBAL_REVIEW_RULES_ID)`, gated by F8: `input.domain !== "personal"` (a
  personal run stays out of work memory, so it never sees the cross-project
  review-rules note).
- `add(reviewRulesIdFor(input.projectId))`, gated only by `input.projectId`
  being present — no domain guard (deliberate: it mirrors the pre-existing
  `if (input.projectId) await add(input.projectId)` project-note line further
  down, which has never been domain-gated either). M7 isolation holds for
  free: a run in project A can never resolve project B's
  `<projectId>-review-rules` note, because the id itself is keyed off the
  _current_ run's `projectId`.

Both sit ahead of the subsystem shelf and MOC/expansion sections on purpose:
`render`'s whole-block truncation (`BLOCK_BUDGET = 8000`) drops the block's
_tail_, and operator-approved learned rules are bounded
(`MAX_RENDERED_RULES = 25`) and high-value, while MOC matches and wikilink
expansion are speculative. When the char budget binds, the speculative
material — added later — is what gets cut, never a learned rule.

`add()` fails open on a missing note (`NoteNotFoundError` swallowed), so a
project with no rules yet, or a global note not yet rendered, composes exactly
as before.

## `ReviewRuleFlowService` (`review-rule-flow.service.ts`)

The Tier-3 approval that stands between a distilled rule and ZIBBY's behaviour.
Registers itself with `ApprovalsService` under the `review-rule` kind; the
approval's `runId` is `` `${projectId}/${ruleId}` `` (round-trips through
`reviewRuleRunId` / `parseReviewRuleRunId`, which reject an id with no slash or
an empty segment).

- `propose(projectId, rule)` — parks the approval, packing the rule sentence,
  the rationale and every occurrence's excerpt + comment URL into `detail` as
  the enrichment JSON the approvals feed renders.
- `resume(runId)` — the operator approved: `setStatus(…, "active", approvalRef)`,
  then re-render that project's rules note so the rule starts grounding.
  `ResumableRunner.resume` is handed only the `runId`, so the `approvalRef` — the
  rule's forensic link back to the decision that activated it — is recovered by
  looking the decision up by `runId` among the `approved` approvals (the same
  by-`runId` lookup `ApprovalsService.cancelPendingForRun` does; `approve`
  persists the `approved` status _before_ routing to `resume`, so the record is
  already there). Best-effort: a failed lookup logs at `warn` and activates
  without the ref rather than blocking a decision the operator already made.
- `cancel(runId)` — the operator rejected: `setStatus(…, "retired")`, no
  render. A retired rule keeps absorbing occurrences (so it stays deduped
  against) but is never proposed again.

Two deliberate choices worth knowing:

- **No gate evaluation.** Unlike `AgentProposalFlowService`, this flow never
  consults `GateEvaluatorService`. There is no floor rule for "learn a rule",
  and a no-match evaluation defaults to `allow` — which would silently activate
  a rule distilled from text an outsider wrote in a PR comment (Law 4). Parking
  unconditionally is strictly stronger and needs no `POLICY.md` change.
- **`cancel` swallows its own failure.** `ResumableRunner` declares
  `cancel(runId): void` and `ApprovalsService` calls it _unawaited_
  (`approvals.service.ts:134`), while `resume` _is_ awaited (`:122`). `cancel`
  therefore catches and logs a failing store write itself, so a rejected
  retirement can never surface as an unhandled rejection.

## `ReviewLearningService` (`review-learning.service.ts`)

The nightly pass, wired into DI by `ReviewLearningModule`. `learn(now?)` walks
every project and, per project: resolves the GitHub link (skip if none — logged
at `debug` with the project id, because that skip is otherwise indistinguishable
from a healthy "no new comments" pass and produces the identical
`review-rules:0` automation ref), reads
the stored cursor, fetches new review comments, distils them against that
project's known slugs, files each observation as an occurrence via
`store.record`, and calls `flow.propose` for every rule `record` promotes —
i.e. every rule that just reached its second occurrence. Returns
`{ observations, proposed }`.

Fail-open per project: one unreachable repo or one bad credential never stops
the others.

The pass never renders a vault note and never makes a rule `active` — both
belong to `ReviewRuleFlowService.resume`, i.e. to the operator's approval.
`ReviewLearningModule` does provide and export `ReviewRulesVaultService`, but
for the review-learning controller that lands in a later task, not for this
service.

Cursor discipline — the cursor advances only when the pass saw a complete window
_and_ actually examined it. The two rules below are independent and both must
pass:

- **`distill` returned `status: "incomplete"`** → cursor held, logged at warn
  with the `reason`. The distiller failed, timed out, or never ran, so part of
  the window was never examined. Costs one replayed batch, loses nothing; the
  store's `commentId` dedup makes the replay free of double-counting.
  Observations that _did_ come back are still recorded.
- **`failedEndpoints` non-empty** → cursor held, logged at warn. A failed
  endpoint means comments in that window were never observed at all; advancing
  past a window ZIBBY never saw would lose them permanently. Occurrences that
  _did_ arrive this pass are still recorded.
- Otherwise the cursor moves to the newest comment timestamp in the batch —
  **including when the distiller ran cleanly and produced zero observations.**
  That case is a complete answer, not a failure, and it used to be conflated
  with the two above. Holding on it wedged the cursor permanently for a repo
  whose comments are all `LGTM`/`thanks`/`done`: the same batch was re-fetched
  and re-distilled (and re-paid for) every night, and because `fetchNew` always
  keeps the OLDEST `MAX_COMMENTS_PER_PASS`, every genuinely actionable comment
  created after those was unreachable **forever**.

`selfLogin` is deliberately left unpassed to `fetchNew`. ZIBBY opens its PRs
with the operator's own GitHub token, so ZIBBY's author identity _is_ the
operator's login — passing it would filter out the operator's own review
comments, precisely the feedback this feature exists to learn from.

Every occurrence's `excerpt` is capped at `EXCERPT_LIMIT = 400` chars: enough to
judge the rule, never the whole thread.

One caveat on the return value: `observations` counts what the distiller
produced, not what was actually filed. An observation whose `commentId` is not
in the batch, or one the store dedups against an occurrence it already has,
still counts — so a replayed window (see the cursor rules above) reports more
than it stored. Only logged today, but the `review-learn` automation target
reports this number.

## Scheduling it (`review-learn`)

`learn()` is triggered by the `review-learn` system automation — seeded
disabled, default cron `15 3 * * *`. See
[automations.md](./automations.md#review-learning-review-learn).

## API (`review-learning.controller.ts`)

```
GET  /api/review-rules?scope=<projectId|_global>   rules in one scope
POST /api/review-rules/:projectId/:ruleId/promote  widen an active project rule to global
```

There is deliberately **no create, edit or delete route**. Rules are born from
the nightly pass and reach `active` only through a `review-rule` approval, so no
client can mint one, reword one, or activate one. Promotion is the single
capability the nightly pass structurally cannot reach on its own.

`list` 404s only a scope key that fails `resolveSafeFile`'s regex before it can
even be turned into a path (`store.list` throws `InvalidReviewScopeKeyError`) —
e.g. a `../../etc/passwd`-shaped `scope`. A valid-but-unknown scope (no file on
disk yet for that project) is **not** an error: `ReviewRulesStore.read` treats a
missing file as `{ rules: [] }`, so that case stays `200 []`. Without this
mapping the thrown error reached `AllExceptionsFilter` as a plain `Error` (not an
`HttpException`) and surfaced as an unmodelled `500` — a status
`strictStatusCodes: true` says can't happen — logged at `error` level on every
probe, which is exactly the free error-log-flood a malicious `scope` query
could exploit.

`promote` refuses in three cases and returns the same `404` for all of them —
the contract has no status that distinguishes them, and a client should not be
able to tell "not active" from "does not exist":

- the `projectId` fails `AGENT_ID_REGEX`, or is `GLOBAL_SCOPE_KEY` (M7: the path
  parameter is caller-supplied, and the store's own scope-key regex is
  deliberately looser because it must also accept `_global`, so this route would
  otherwise be able to target the global file directly);
- the rule does not exist in that scope;
- the rule is not yet `active`. This check lives in the controller because
  `ReviewRulesStore.promoteToGlobal` does **not** gate on status — it moves
  whatever id it is handed. Law 4 lives here.

On success the rule moves out of the project file and into the global one, so
**both** vault notes are re-rendered — `render(projectId)` and `renderGlobal()`.
Re-rendering only one would leave the other claiming a rule it no longer holds.

v1 ships no web page for this; it is the API a later panel will call.

Coverage is split deliberately: `review-learning.controller.test.ts` unit-tests
`list`/`promote` directly (business logic, Law 4, M7), while
`apps/api/test/review-learning.e2e.test.ts` boots the real `AppModule` and drives
both routes over HTTP through supertest — the only suite that actually exercises
`handler()`'s `tsRestHandler` route map and the module's `controllers`
registration, both invisible to the unit tests. It isolates a temp
`REVIEW_RULES_DIR`/`VAULT_DIR` per file and asserts on the rendered vault note
contents on disk, not just the HTTP response.
