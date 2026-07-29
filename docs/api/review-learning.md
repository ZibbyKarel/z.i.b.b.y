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
outside the store's directory. Parsing is tolerant **per rule**: each rule in the
`rules` array is validated individually against `ReviewRuleSchema`, and a single
malformed rule is dropped without discarding its siblings (mirrors
`GateRulesStorageService.list()`); only a file that isn't even parseable/shaped
JSON falls back to `{ rules: [] }` wholesale. Writes are atomic, mirroring
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

Not yet built (later tasks): the ingest pass that reads GitHub review comments and
calls `record`, the controller/route exposing `listGrounded`/`promoteToGlobal`, the
`review-learn` automation target kind, and grounding the active rules into runs.
