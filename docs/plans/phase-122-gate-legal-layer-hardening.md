# Phase 122 — Gate legal-layer hardening (harden-only bypass, erasable floor, fail-open default, missing deploy floor, approval TOCTOU)

> Zdroj: `docs/audit/report-final.md` (Critical table, 1× Critical + 4× High v gate/approval
> clusteru) a `docs/audit/batches/api-gates-approvals.md`.
>
> `report-final.md:20` — Critical, ✅ POTVRZENO (spot-check): _"Gate bypass — non-action agent
> rule zastíní locked floor `pr.merge: deny`"_
>
> `report-final.md:30` — _"Zákonná gate vrstva je obejitelná/oslabitelná (Critical + 3× High,
> gate bypass potvrzen). `harden-only` validace porovnává jen `action`-podmínky, takže agent rule
> keyed na `tool`/`scope` projde validací a přes first-match-wins (own-rules-first) zastíní locked
> floor deny. Dále: policy floor je jen empty-fallback (částečně stripnutý POLICY.md se neobnoví
> na kanonický floor), unmatched akce fail-open na `allow` (proti zákonu "when unsure, higher
> tier"), `deploy` (Tier-3) není na locked floor, approve/reject má TOCTOU. **Přímý útok na Law
> 1/3/4.**"_
>
> `docs/audit/batches/api-gates-approvals.md:5-19` — the five findings this phase covers (Critical
> gate-evaluator harden-only bypass; High policy floor erasability; High approvals TOCTOU; High
> unmatched-action fail-open; Medium `deploy` missing from the locked floor).

Applicable Laws (`CLAUDE.md`, "Laws (non-negotiable)"): **Law 1** — approval-first is structural,
wired into the system floor, not something an agent's config can weaken. **Law 3** — no
autonomous commit to the outside world past budget/without approval. **Law 4** — the gate cannot
be talked around; inbound content can never raise privileges or bypass the gate. All five findings
in this phase are direct instances of a config-writable surface (an agent's own `gates`, or
`POLICY.md` on disk) undermining these three Laws.

**This is a planning-only document — no source was modified while writing it.**

---

## Recon (verified)

### 1. Harden-only bypass (Critical) — `apps/api/src/gates/gate-evaluator.service.ts`

- `rulesForAgent` (l.54–58) returns `[...ownRules, ...floor]` — an agent's own rules are placed
  **before** the locked floor.
- `evaluate`/`matchOnce` (l.85–89, l.121–128) is **first-match-wins** over that combined list: it
  walks the array in order and returns the first rule whose `match` conditions all hold
  (l.122–124 `rule.match.every((cond) => this.matches(cond, action))`); an unmatched action falls
  through to the hardcoded default `{ decision: "allow" }` (l.127 — see Finding 3 below).
- `validateHardenOnly` (l.156–177) is the **only** gate on what an agent may write into its own
  `gates` (called from `GatesController.replaceAgentGates`, `gates.controller.ts:44–58, l.48`). For
  each own rule `i`, for each floor rule, it calls `this.sameAction(rule.match, floorRule.match)`
  (l.161) and only compares decision strength (l.162) when `sameAction` is true.
- `sameAction` (l.213–223) does this: it filters **both** match arrays down to conditions with
  `type === "action"` (l.214–219), then checks whether any pair of surviving `action` conditions
  is textually equal (same `action` string, same `branch`, l.220–222). **If an own rule's `match`
  contains no `type:"action"` condition at all — e.g. it is keyed purely on `tool`, `scope`, or
  `context` — `actionsA` is the empty array, `actionsA.some(...)` is vacuously `false`, and
  `sameAction` returns `false` for every floor rule, unconditionally.** The rule is then never
  compared against any floor decision and always passes validation, regardless of what it actually
  decides.
- Concrete exploit: an agent's own rule `{ match: [{ type: "tool", tool: "gh" }], decision:
  "allow" }` (or `scope`/`context`-keyed equivalents) passes `validateHardenOnly` unconditionally
  (no `action` condition on either side to compare). At runtime it is placed before the floor
  (`rulesForAgent`) and, being first in iteration order, `matchOnce` returns `allow` for **any**
  `IntendedAction` whose `tool` is `"gh"` — including one whose `action` is `"pr.merge"` — before
  the loop ever reaches `floor-pr.merge` (`policy.storage.service.ts:119–125`, locked `deny`). The
  locked "never autonomously merge" floor rule is silently shadowed. This matches
  `report-final.md:20`'s "✅ POTVRZENO (spot-check)" status.
- `gate-evaluator.service.ts:85–89` (flagged Low in the audit, `api-gates-approvals.md:37–39`):
  `evaluate`/`rulesForAgent` never re-check harden-only at runtime — the only enforcement is
  write-time, in the controller. Any code path that writes `agent.gates` other than through
  `replaceAgentGates` (seed data, a direct `AgentsStorageService.update`) produces an
  unvalidated own-rule set the evaluator trusts as-is. Confirmed by reading — no second check
  exists anywhere in `evaluate`/`matchOnce`/`evaluateForOrchestrator`.

### 2. Policy floor erasability (High) — `apps/api/src/gates/policy.storage.service.ts`

- `floor()` (l.33–54): reads `POLICY.md`; `raw === null` (file missing) → `DEFAULT_FLOOR`
  (l.35); frontmatter parse throws → `DEFAULT_FLOOR` (l.39–41); otherwise every item in
  `data.policy` is schema-validated with provenance **forced** to `source:"system", locked:true`
  (l.46–50, a single malformed rule is dropped, not fatal) and the method returns
  `rules.length > 0 ? rules : DEFAULT_FLOOR` (l.53). **There is no merge/union step.** As long as
  the on-disk file parses and yields at least one valid rule, that rule set — and nothing else —
  is the floor. A file that keeps one harmless rule (e.g. `floor-channel-reply`) but drops
  `floor-pr.merge` or downgrades every `ask` action to `allow` is accepted wholesale; the "locked,
  non-erasable floor" described in the module docstring (l.12–18, "agents may only *harden* it")
  is only a first-boot seed / total-failure fallback, not an enforced minimum on every read.
- **Live evidence found during recon** (not modified — reported as-is): `.zibby/data/POLICY.md`
  (tracked, committed at `HEAD`, `git show HEAD:.zibby/data/POLICY.md` = working tree, no diff) is
  today a real instance of this gap — every `ASK_FLOOR_ACTIONS` rule except `floor-pr.merge`
  (`deny`, correct) and `floor-channel-reply` (`notify`, correct) is currently persisted with
  `decision: allow` instead of the code's `DEFAULT_FLOOR` `ask`: `floor-purchase`,
  `floor-payment`, `floor-git.force_push`, `floor-git.push`, `floor-send_email`,
  `floor-jira.create_issue`, `floor-spend-past-cap` all read `decision: allow`. Because the file
  parses and yields >0 valid rules, `floor()` returns this weakened set verbatim — the running
  system's actual floor today auto-allows purchase/payment/force-push/push/email/Jira/over-budget
  spend actions unless an agent rule happens to re-ask. This is exactly the erasable-floor
  finding, observed in production data, not merely theoretical. The Approach below (disk-union)
  self-heals this file the next time `floor()` runs post-fix, with no manual data edit required —
  confirm this in testing (§ Testing) but do not hand-edit `.zibby/data/POLICY.md` as part of this
  plan (data, not source; out of scope for a planning-only pass, and the fix must work generally,
  not patch this one file).
- `DEFAULT_FLOOR` (l.110–136) / `ASK_FLOOR_ACTIONS` (l.78–108) is the canonical minimum: `ask`
  rules for `purchase`, `payment`, `git.force_push`, `git.push`, `gh.api_write`, `send_email`,
  `delete`, `jira.create_issue`, `spend-past-cap`, `agent.propose_new`; a locked `deny` for
  `pr.merge`; a `notify` for `channel-reply`. `deploy` is **not** in this list (see Finding 4).

### 3. Unmatched action fail-open (High) — `gate-evaluator.service.ts:127`

- `matchOnce` (l.121–128): if no rule in the ordered list matches, the method returns `{ decision:
  "allow" }` — no `ruleId`, so `recordEvaluation` (l.132–150, condition l.143) does not even log
  it to the activity feed (a no-match default-allow is deliberately silent per the comment at
  l.139–142). Any `action` string the caller sends that isn't named by the floor or by any agent
  rule is allowed outright and invisibly. This directly contradicts the north-star's "when unsure
  which tier applies, ZIBBY treats it as the higher one" (`CLAUDE.md`, "The autonomy contract").
  `action` is a free string (`IntendedActionSchema.action: z.string().min(1)`,
  `libs/contracts/src/gates/gate.schema.ts:103`) — any new/renamed/mistyped action name that
  hasn't yet been added to the floor silently defaults to the *weakest* decision instead of the
  conservative one.

### 4. `deploy` missing from the locked floor (Medium) — `policy.storage.service.ts` / `apps/api/src/gate-rules/gate-rules.storage.service.ts`

- `deploy` is a Tier-3 outbound action (north-star autonomy contract: "Tier 3 — Surface and wait
  … deploy"-class actions) but the only rule matching it today is `gr-deploy-work`
  (`gate-rules.storage.service.ts:143–149`): `{ match: [{ type: "action", action: "deploy" }],
  decision: "ask", resolve: { type: "agent", agent: "reviewer" } }`. This lives in the **global
  gate-rule catalog** (`GateRulesStorageService`, `DEFAULT_CATALOG` l.125–165) — a fully
  create/update/delete/reorder-able collection via `gate-rules.controller.ts` (the "Pravidla
  schvalování" web page), **not** the locked `POLICY.md` floor. Deleting or reordering
  `gr-deploy-work` behind another `allow`-shaped catalog rule leaves `deploy` completely ungated:
  `gate-evaluator.service.ts` has no separate awareness of the catalog (`rulesForAgent`/`floor`
  only read `PolicyStorageService`), so a `deploy` action with no matching agent rule and no
  surviving catalog rule falls straight through to the Finding-3 default `allow`.

### 5. Approve/reject TOCTOU (High) — `apps/api/src/approvals/approvals.service.ts:140–150`

- `decide(id, status)` (l.140–150): `await this.storage.get(id)` (a file read via
  `ApprovalsStorageService` → `EntityFileStore`), then a plain in-memory check `if
  (approval.status !== "pending") throw new ApprovalAlreadyDecidedError(id)` (l.142), then later
  (after building `decided` and recording activity) `return this.storage.update(decided)` (l.149,
  another file write). Nothing between the read and the write prevents a second concurrent call
  for the same `id` from also reading `status === "pending"` before the first call's write lands.
  `approve()` (l.103–112) and `reject()` (l.115–124) each call `decide()` and then, **outside**
  `decide`, route to the runner: `approve` calls `this.runners.get(approval.kind)?.resume(...)`
  (l.110), `reject` calls `.cancel(...)` (l.122). Two concurrent `approve(id)` + `reject(id)` calls
  (e.g. a double-tap in the UI, or an operator rejecting from one tab while an automated retry
  approves from another) can both pass the pending check, both call `storage.update`, and both
  then call `resume`/`cancel` on the same run — the run may resume despite a concurrent reject
  (Law 1/3 breach: an action proceeds despite an explicit rejection), or `resume` may fire twice
  (double-spawn). Same TOCTOU shape the audit notes elsewhere for the scheduler outcome write
  (`report-final.md:14`, "Stejný TOCTOU vzor jako scheduler outcome write") — which the codebase
  already fixes with `withPathLock`.
- **Fix ingredient already exists in the codebase** — `withPathLock<T>(key, fn):
  Promise<T>` (`apps/api/src/shared/file-storage/file-lock.ts:20–36`, re-exported from
  `apps/api/src/shared/file-storage/index.ts:11`). It is in-process, per-key FIFO serialization —
  exactly the "one instance per data root" model this API already runs under (see the file's own
  docstring, l.7–11). It is already used this way for an analogous double-dispatch TOCTOU in
  `apps/api/src/tasks/task-scheduler.service.ts:831` (`withPathLock("scheduler:drain", …)`) and in
  `apps/api/src/memory/vault.service.ts`. **No new dependency, no phase-123 wait** — this task's
  brief flagged `withPathLock` as "authored in phase-123" for the sibling storage plan; that
  turned out to be inaccurate on inspection: the utility is already shipped and in use. This
  phase can and should consume it directly.

### Confirmed vs. assumed

- Confirmed by direct source read, with exact line numbers as cited above: all five findings,
  including the harden-only vacuous-`sameAction` mechanism, the floor's `rules.length > 0 ? rules
  : DEFAULT_FLOOR` no-union logic, the `matchOnce` default-allow, `deploy`'s catalog-only
  placement, and the `decide()` read-check-write gap.
- Confirmed by data inspection (not code): `.zibby/data/POLICY.md` today already exhibits the
  weakened-floor condition described in Finding 2 — a real, present-tense instance, not a
  hypothetical.
- Assumed/not directly re-verified in this pass: whether any *runtime* `IntendedAction` for
  `pr.merge` actually carries `tool:"gh"` end-to-end (the audit's exploit example) — plausible
  given `classifyGh` in `apps/api/src/runner/claude-approval-hook.mjs` maps `gh pr merge` to
  `pr.merge`, but the exact `tool` field populated on that `IntendedAction` at the call site was
  not traced in this pass; irrelevant to the fix (the fix must close the bypass for *any* non-action
  matcher shape, not just the `tool:"gh"` case) but worth a targeted regression test using the
  literal shapes the runner emits, if time allows in implementation.
- Not addressed by this phase (adjacent audit items, explicitly out of scope): mandate test
  coverage (`report-final.md`/`api-gates-approvals.md:25-27`, Medium — a separate, non-legal-layer
  test-only gap), `policy.storage.service` direct test coverage as a standalone item beyond what
  this phase's new tests provide, `gates.controller.ts` 404-boilerplate cleanup (Low,
  `api-gates-approvals.md:33-35`), and the approval-hook `gh api` denylist gap (already the
  subject of the existing `docs/plans/phase-17-security-gate-hardening.md` §17.1).

---

## Goal

The gate legal layer is fail-closed and un-shadowable by construction:

1. **Harden-only is match-agnostic.** An agent rule can never pass write-time validation by virtue
   of using a non-`action` matcher — every floor action is tested against the rule's *full* match
   set, not just its `action` conditions, so a `tool`/`scope`/`context`/`threshold`-only rule that
   would fire on a floor-governed action is caught and rejected (422) at write time.
2. **Floor precedence holds at runtime too**, not only at write time — a locked floor `deny`/`ask`
   decision cannot be shadowed by an own rule even if it somehow reached the evaluator unvalidated
   (seed data, a direct store write bypassing the controller).
3. **The on-disk floor can only add or tighten, never remove or weaken** a locked rule — `floor()`
   always returns at least the union of `DEFAULT_FLOOR` and whatever the disk adds, with disk
   permitted to *override* a floor rule's decision only in the stricter direction (rank ≥ the
   default's rank), never weaker.
4. **An unmatched mutating/unknown action defaults to `ask`, not `allow`.**
5. **`deploy` is a locked floor rule**, not solely a deletable catalog entry.
6. **Approve/reject is atomic per approval id** — a decision, once made, cannot be raced by a
   second concurrent decision on the same id; exactly one of resume/cancel ever fires per approval.

---

## Approach

### A. Harden-only match-agnostic (`gate-evaluator.service.ts`)

1. Replace `sameAction` with a match-agnostic overlap check. For each own rule and each floor
   rule, determine whether **any `IntendedAction` could satisfy both rules' match sets
   simultaneously** — i.e. the rules are not provably disjoint. Concretely:
   - Group each rule's match conditions by `type`. Two rules can co-match the same action only if,
     for every condition type present in *either* rule, the two rules' conditions of that type do
     not contradict (same `action`+`branch`, overlapping `scope` prefixes, compatible
     `threshold`, or the type is present in only one of the two rules — in which case it imposes
     no constraint on the other and cannot rule out overlap).
   - Practically: an own rule with **no `action` condition at all** must be treated as "could match
     any action" for the purpose of this check — the current bug's root cause. So: if own rule has
     zero `action` conditions, treat it as overlapping with **every** floor rule (safest closed
     assumption — matches "when unsure, higher tier"), and go straight to the decision-rank
     comparison. If the own rule *does* have `action` conditions, keep something like today's
     equality check on those specific conditions, but additionally verify no *other* condition
     type on the own rule (`tool`/`scope`/`context`/`threshold`) could exclude a floor-relevant
     action — i.e. don't early-return `false` just because a non-`action` type differs; only
     `type:"action"` conditions can prove *disjointness* (a floor rule for `action:"pr.merge"` and
     an own rule with `action:"git.push"` genuinely can't co-fire), everything else is either a
     narrowing filter (still allows overlap) or absent (no constraint).
   - Simplify to the safe rule: **evaluate every floor action against the full match-set of every
     own rule** by literally invoking the same `matches()` predicate the runtime evaluator uses,
     against a representative synthetic `IntendedAction` built from the floor rule's own `action`
     condition (and, where present, its `branch`). If `own.match.every(cond => this.matches(cond,
     syntheticAction))` — i.e. the own rule as a whole *would* match an action shaped exactly like
     the floor rule's target — treat that as "same action" for harden-only purposes, regardless of
     which condition types are present on either side. This reuses the existing `matches()`
     matcher instead of hand-rolling a second comparison semantics, and is the most literal
     "would this own rule actually fire on the floor's action" test — closing the vacuous-`tool`/
     `scope`-only-rule gap directly, because a `tool:"gh"` own rule with no `action` condition at
     all has `match.every(...)` trivially true for *any* synthetic action (empty-vacuous the other
     way is now the *conservative* direction: no `action` condition imposes no exclusion, so
     `every()` only depends on the conditions that *are* present, which must also hold for the
     synthetic action — a `tool:"gh"` condition holds only if the synthetic action also carries
     `tool:"gh"`, which the floor's `pr.merge` synthetic action should be built to carry when the
     runner is known to tag it that way, per the Confirmed/Assumed note above; if the tool tag
     can't be reconstructed generically, fall back to the safe default: any own rule lacking an
     `action` condition targeting a *different, disjoint* action is presumed to overlap every floor
     action).
   - Land on the simplest version that is still provably safe: **rename/rewrite `sameAction` to
     `mayOverlap(ownMatch, floorMatch)` that returns `true` unless it can affirmatively prove
     disjointness** (only `type:"action"` conditions on *both* sides with different `action`/
     `branch` values prove disjointness; every other combination — one side missing an `action`
     condition, or matching `scope`/`tool`/`context`/`threshold` conditions — is treated as
     "could overlap"). This flips the current bug (default-safe → default-unsafe) to
     default-safe: an own rule needs an explicit, provably-non-overlapping `action` condition to
     be exempted from a floor comparison; anything else is checked.
2. Keep the decision-rank comparison (l.162) unchanged — once `mayOverlap` says "compare", the
   existing `DECISION_RANK[rule.decision] < DECISION_RANK[floorRule.decision]` violation logic is
   correct.
3. **Floor precedence at runtime** (closing the Low finding at l.85–89 as defense-in-depth, not
   just relying on write-time validation): in `matchOnce`, after finding the first matching rule,
   if that rule's `source === "agent"` and there exists a **locked** floor rule (`source ===
   "system"`, `locked === true`) whose match set also matches the same `action` with a *stricter*
   decision, return the floor's decision instead. Simplest implementation: iterate own rules first
   as today, but when an own rule matches, also check it against the passed-in floor list (already
   available inside `evaluate`/`matchOnce` via the `rules` array — separate `own`/`floor` by
   `source`/`locked` before the loop, or pass `floor` explicitly into `matchOnce`) and take the
   stricter of {own match, any locked floor rule that also matches this same action}. This makes
   the evaluator itself the enforcement point, not just the controller's write-time check — closing
   the "any path bypassing `replaceAgentGates`" gap.
4. Add a `floor-precedence` unit test reproducing the exact exploit from the audit: an own rule
   `{ match: [{ type: "tool", tool: "gh" }], decision: "allow" }` (and a `scope`-only, and a
   `context`-only variant) attempting to write via `validateHardenOnly` against a floor containing
   `floor-pr.merge: deny` — assert rejection (422-shaped `PolicyViolation`), and separately assert
   that even if such a rule were force-injected past validation (simulating the "any path
   bypassing the controller" scenario), `evaluate`/`matchOnce` still returns `deny` for a
   `pr.merge`-shaped action.

### B. Policy floor union (`policy.storage.service.ts`)

1. In `floor()`, replace the `rules.length > 0 ? rules : DEFAULT_FLOOR` tail with a union step:
   - Build a map of `DEFAULT_FLOOR` rules keyed by their canonical target (the `action` string on
     their sole `type:"action"` match condition — every current `DEFAULT_FLOOR` entry has exactly
     one).
   - Build a map of the disk-parsed `rules` the same way, for any that key the same way (single
     `action` condition).
   - For each `DEFAULT_FLOOR` key: if the disk has a rule for that same `action` key, take the
     **stricter** of the two decisions (`DECISION_RANK` comparison — disk `decision` used only if
     its rank is ≥ the default's rank; otherwise keep the default's rule verbatim, effectively
     ignoring the disk's attempt to weaken it). If the disk has no rule for that key, keep the
     default rule verbatim.
   - Any disk rule that does **not** correspond to a `DEFAULT_FLOOR` key (a genuinely new
     locked rule an operator added by hand) passes through union untouched — disk may *add*
     rules freely, per "disk may only add/tighten, never remove."
   - Rules with a `match` shape not reducible to a single `action` condition (e.g. an operator
     hand-wrote a floor rule keyed on `scope`) are out of scope for the per-key union (there's no
     canonical key to merge on) — pass them through as additional disk-only floor rules, unioned
     alongside, never used to silently *replace* a `DEFAULT_FLOOR` entry.
2. Keep the existing tolerant-parse behavior (single malformed disk item dropped, `raw === null`
   or parse-throw → `DEFAULT_FLOOR` unchanged — those paths already return the canonical floor
   with nothing to union against).
3. This directly self-heals the live weakened `.zibby/data/POLICY.md` state found in recon: once
   deployed, the next `floor()` call unions the disk's `decision: allow` entries against
   `DEFAULT_FLOOR`'s `ask`, and `ask` (rank 2) beats `allow` (rank 0), so the effective floor
   reverts to `ask` for every affected action without any manual data edit. Add a regression test
   using that exact fixture shape (a POLICY.md with `ASK_FLOOR_ACTIONS` downgraded to `allow`)
   asserting `floor()` returns `ask` for those actions.

### C. Unmatched action → `ask` (`gate-evaluator.service.ts:127`)

1. Change `matchOnce`'s fallback from `{ decision: "allow" }` to a conservative default: `{
   decision: "ask", resolve: { type: "human" } }` for any action that reached the end of the rule
   list unmatched. Do **not** synthesize a `ruleId` (there's no rule — keep `ruleId` undefined so
   the evaluation is still distinguishable from an explicit floor/agent match), but **do** still
   record it to the activity feed — flip `recordEvaluation`'s silence condition (l.139–142,
   currently `if (evaluation.ruleId !== undefined)`) so an unmatched-default `ask` is logged too
   (only a genuine unmatched-`allow` was meant to stay silent as routine noise-suppression; an
   unmatched action now surfacing for human resolution is exactly the kind of event the activity
   feed and approval queue must show, or the "ask" is invisible and never gets answered).
2. Verify this doesn't create an approval for every no-op read-type action: check how
   `evaluate()`'s callers (the runner) already treat `ask` decisions — presumably by pausing and
   calling `requestApproval`. Confirm/trace that only genuinely mutating/write actions reach
   `gate-evaluator.evaluate` at all (read-only tool calls likely don't route through the gate) so
   this doesn't spuriously gate benign reads; if any caller does send read-shaped actions through
   evaluate, either scope the fallback to actions in a mutation-shaped allowlist or document the
   caller-side contract that only mutating `IntendedAction`s are evaluated. Resolve this by reading
   the runner call site(s) of `GateEvaluatorService.evaluate`/`evaluateForOrchestrator` before
   implementing — do not guess.
3. Update `evaluateForOrchestrator`'s `best` seed (l.108, currently `{ decision: "allow" }`) to
   match — it should start from the same conservative default so the orchestrator's strictest-union
   logic doesn't silently start from `allow` either.

### D. `deploy` on the locked floor (`policy.storage.service.ts`)

1. Add `"deploy"` to `ASK_FLOOR_ACTIONS` (l.78–108) — a locked `ask:human` floor rule
   `floor-deploy`, consistent with the existing entries and their `resolve: { type: "human" }`
   shape. Add a one-line comment matching the file's existing per-entry annotation style (see the
   `pr.open`/`gh.api_write`/`spend-past-cap`/`agent.propose_new` comments, l.83–107) explaining why
   `deploy` graduates from the deletable catalog to the locked floor: it is Tier-3 per the
   north-star autonomy contract and was previously only gated by the editable `gr-deploy-work`
   catalog entry (`gate-rules.storage.service.ts:143–149`), which an operator or a compromised
   catalog write could delete or reorder away, leaving it ungated.
2. Leave `gr-deploy-work` in `DEFAULT_CATALOG` as-is (harmless now that the floor also covers it —
   harden-only still permits the catalog rule to route to an agent reviewer as a *stricter or
   equal* resolution path than the floor's plain `ask:human`; no change needed there, but note in
   the commit message that the catalog rule is now belt-and-suspenders, not the sole gate).
3. Update `data/POLICY.md` / `data-test/POLICY.md` seed references only if the implementation
   phase re-seeds fixtures — check `apps/api/data-test/POLICY.md` and any e2e fixture
   (`.e2e-data/policy/POLICY.md`) for hand-authored floors that would need the same `deploy` entry
   added, or that will now legitimately differ from `DEFAULT_FLOOR` until Part B's union normalizes
   them. Because of Part B, a stale fixture missing `deploy` will be unioned back to the default at
   read time — but confirm this in a targeted test using the actual fixture files, not just the
   in-memory `DEFAULT_FLOOR`.

### E. Approve/reject atomicity (`approvals.service.ts`)

1. Wrap the body of `decide(id, status)` in `withPathLock(`approval:${id}`, async () => { … })`
   (import from `../shared/file-storage`, matching the existing pattern at
   `task-scheduler.service.ts:831`). The lock key is per-approval-id, so unrelated approvals stay
   fully concurrent; only two decisions racing on the *same* id are serialized.
2. Because `approve()`/`reject()` each independently call `decide()` and then act on the runner
   (`resume`/`cancel`) **outside** the locked section, verify whether the runner call also needs to
   move inside the lock, or whether serializing `decide()` alone is sufic­ient: once `decide()` is
   atomic, the *second* concurrent call (whichever loses the race) will see `approval.status !==
   "pending"` (now genuinely up to date, because the first call's `storage.update` completed inside
   the same lock before the second call's `storage.get` runs) and throw
   `ApprovalAlreadyDecidedError` — which propagates out of `approve`/`reject` before the runner call
   is reached (the `await this.decide(...)` on l.104/l.116 throws first). So serializing `decide()`
   alone is sufficient to guarantee at most one of `resume`/`cancel` ever fires per approval id —
   confirm this control-flow claim holds by reading `approve`/`reject` again post-change (the
   runner call must stay textually after the `await decide(...)` line, which it already is) and
   assert it directly in the concurrency test (§ Testing).
3. `cancelPendingForRun` (l.132–138) already calls `decide()` per-approval-id in a loop and
   swallows errors (`.catch(() => {})`, l.135) — no change needed there; it naturally benefits from
   the same lock and its existing error-swallowing already tolerates a "no longer pending" race.

---

## Testing

Security-focused tests, one per finding, added to the existing `*.test.ts` files
(`gate-evaluator.service.test.ts`, a new `policy.storage.service.test.ts`, and
`approvals.service.test.ts`):

1. **Shadowing attempt rejected (harden-only, match-agnostic).** An own rule
   `{ match: [{ type: "tool", tool: "gh" }], decision: "allow" }` submitted via
   `validateHardenOnly` against a floor containing `floor-pr.merge: deny` → returns a
   `PolicyViolation` (not `null`). Repeat for a `scope`-only and a `context`-only own rule.
   Also assert a genuinely disjoint own rule (`{ match: [{ type: "action", action: "git.push",
   branch: "feature/x" }], decision: "allow" }` against the same floor) still passes — the fix
   must not become overly conservative and reject legitimate hardening/unrelated rules.
2. **Floor precedence holds at runtime even if validation is bypassed.** Construct a rule list by
   hand (own rules first, as `rulesForAgent` would produce) that includes the shadowing rule from
   test 1 *without* going through `validateHardenOnly`, call `evaluate`/`matchOnce` with a
   `pr.merge`-shaped `IntendedAction`, assert the result is `deny` (the floor), not `allow`.
3. **Stripped POLICY.md restores the floor.** Write a `POLICY.md` fixture with `ASK_FLOOR_ACTIONS`
   downgraded to `allow` (mirroring the live `.zibby/data/POLICY.md` state found in recon) and
   `floor-pr.merge` entirely removed; call `PolicyStorageService.floor()`; assert every
   `ASK_FLOOR_ACTIONS` action still resolves to `ask` (the disk's weaker `allow` is overridden) and
   `floor-pr.merge: deny` is present (re-added from `DEFAULT_FLOOR` even though the disk omitted
   it entirely).
4. **Disk may still tighten.** A `POLICY.md` fixture where an `ASK_FLOOR_ACTIONS` entry is
   upgraded to `deny` → `floor()` returns `deny` for that action (disk's stricter choice wins).
5. **Disk may still add.** A `POLICY.md` fixture with an extra locked rule for an action not in
   `DEFAULT_FLOOR` → `floor()` includes it alongside the full default set.
6. **Unmatched action → `ask`, not `allow`.** `matchOnce`/`evaluate` called with an
   `IntendedAction` whose `action` matches no floor rule and no agent rule → `decision === "ask"`.
   Assert `evaluateForOrchestrator`'s seed behaves the same way (empty catalog/agent list →
   strictest result is `ask`, not `allow`). Assert the activity feed records this case (flipped
   `recordEvaluation` condition) — spy on `ActivityLogService.record` and assert it's called for an
   unmatched action, where it previously wasn't.
7. **`deploy` denied/asked on the floor even with an empty catalog.** `PolicyStorageService.floor()`
   with a fresh/default `POLICY.md` includes a `deploy` rule (`ask`, locked); evaluate a `deploy`
   action against the floor alone (no agent rules, no catalog) and assert `ask`, not the
   fall-through `allow` from Finding 3 (this test would have failed before *either* fix, so it
   exercises the interaction of Parts C and D together).
8. **Concurrent approve+reject serialized.** Create a pending approval, register a fake runner
   (`resume`/`cancel` spies), fire `service.approve(id)` and `service.reject(id)` concurrently
   (`Promise.allSettled`), assert exactly one of the two spies was called, the other promise
   rejected with `ApprovalAlreadyDecidedError`, and the approval's final persisted `status` matches
   whichever call actually won (not left in an inconsistent state). Repeat for double-`approve`
   (both concurrent calls are `approve`) — assert `resume` called exactly once.
9. Existing test suites (`gate-evaluator.service.test.ts`'s "first matching rule wins" and other
   precedence tests, `approvals.service.test.ts`'s existing approve/reject flows) must stay green —
   these fixes must not change behavior for the non-adversarial path.

Commands: `pnpm check:lint`, `pnpm check:types`, `pnpm test` (or scoped:
`pnpm exec vitest run apps/api/src/gates apps/api/src/approvals apps/api/src/gate-rules`). Fix all
errors before considering the phase done, per project convention.

---

## Effort & risk

**M.** Touches the single most security-critical layer in the system (the legal/gate layer
directly implementing Laws 1/3/4) — small diffs, large blast radius. Practices to hold to during
implementation:

- **Fail-closed by design, not by accident.** Every change in this phase moves a decision from
  "ambiguous → permissive" to "ambiguous → conservative" (unmatched→ask, disk-weaker→overridden,
  non-action-matcher→checked). None of them should introduce a new *permissive* default anywhere —
  review the diff specifically for that direction.
- **Test coverage before merge, not after.** This phase's tests (§ Testing) are the primary
  evidence the fixes work — write them as regression tests that fail against the pre-fix code
  first (TDD red/green), especially tests 1–3 and 8, which each directly reproduce a
  Critical/High finding.
- **No behavior change for the non-adversarial path.** An operator's legitimate hardening rules,
  a legitimate disk floor that only tightens, and normal approve/reject flows must keep working
  identically — the new tests in §9 guard this explicitly.
- **PR, not merge.** Per Law 3 / the project's autonomy contract, this phase opens a PR
  (Tier-2, act-then-report) and stops at the merge gate — the operator reviews and merges a
  change to the legal layer itself.
- Sequencing note: Part E (approvals) is independent of Parts A–D (gates) and could ship as a
  separate, smaller PR if the reviewer prefers isolating the TOCTOU fix from the gate-matching
  logic change — both are self-contained given `withPathLock` already exists in the codebase (no
  cross-phase dependency, despite the original task brief's assumption that it was phase-123
  work).
