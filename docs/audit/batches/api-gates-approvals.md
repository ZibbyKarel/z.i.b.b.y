BATCH: api-gates-approvals

POZN. ORCHESTRÁTORA: nejcitlivější batch celého auditu (zákonná vrstva). Nálezy níže tvrdí, že approval-first floor lze za určitých okolností obejít nebo oslabit editací POLICY.md — to je přímý útok na Law 1/3/4. Doporučuji tyto nálezy verifikovat spot-checkem před nápravou (viz finální report Fáze 2).

[SEVERITY: Critical] [FILE: apps/api/src/gates/gate-evaluator.service.ts:156-223] [CATEGORY: Gate bypass / harden-only]
`validateHardenOnly`/`sameAction` compare only `action`-type match conditions, but runtime `rulesForAgent` puts agent rules before the floor with first-match-wins (`matchOnce`, l.121-128). An agent rule matching the same real operation via a `tool`/`scope`/`context`/`threshold` matcher (e.g. an `allow` on the gh/git tool that carries `pr.merge`) fires before the floor's action-based `deny` and passes harden-only validation because it contains no action condition — the locked floor is silently shadowed.
Doporučení: make harden-only match-agnostic (evaluate every floor action against each agent rule's full match set, or evaluate floor-first for locked `deny` rules) so no non-action matcher can shadow a floor decision.

[SEVERITY: High] [FILE: apps/api/src/gates/policy.storage.service.ts:42-53] [CATEGORY: Policy floor erasability / fail-open]
`DEFAULT_FLOOR` is used only when disk yields zero valid rules; a POLICY.md that keeps one valid rule but drops the `pr.merge` locked-`deny` (or the `ask` actions) returns that partial set as the whole floor — the canonical floor is not re-merged. The "structural, non-erasable floor" is therefore only a seed/empty-fallback, not an enforced minimum.
Doporučení: union the on-disk floor with DEFAULT_FLOOR (disk may only add/harden, never remove a locked rule).

[SEVERITY: High] [FILE: apps/api/src/approvals/approvals.service.ts:140-150] [CATEGORY: Race condition / TOCTOU]
`decide` reads status, checks `!== "pending"`, then writes — no atomic compare-and-set or lock. Concurrent approve+reject (or double-approve) both pass the pending check and both route to the runner, so a run can be resumed despite a concurrent reject, or `resume` called twice (double-spawn). (Stejný TOCTOU vzor jako scheduler outcome write.)
Doporučení: serialize decisions per approval id so exactly one decision ever routes to the runner.

[SEVERITY: High] [FILE: apps/api/src/gates/gate-evaluator.service.ts:127] [CATEGORY: Tier escalation / fail-open]
An unmatched action returns `{ decision: "allow" }` — the lowest tier. This contradicts the law "when unsure which tier applies, treat it as the higher one": any novel/unenumerated action that no floor or agent rule names is silently allowed rather than surfaced.
Doporučení: default unmatched mutating/unknown actions to `ask` (or a conservative catch-all in the floor).

[SEVERITY: Medium] [FILE: apps/api/src/gates/policy.storage.service.ts:78-108] [CATEGORY: HIGH_RISK completeness]
`deploy` is a Tier-3 outbound action but is NOT on the locked floor — it exists only in the deletable/editable `DEFAULT_CATALOG` (gate-rules.storage.service.ts:143-149). Removing that catalog rule leaves deploy ungated.
Doporučení: promote `deploy` (and audit for other Tier-3 verbs) into the locked ASK/deny floor.

[SEVERITY: Medium] [FILE: apps/api/src/mandate/mandate.storage.service.ts:1-51] [CATEGORY: Missing critical tests]
No test file for the mandate. The Law-4 invariant ("only the operator PUT writes; unknown/smuggled keys rejected with 422") and the fail-closed fallback to `DEFAULT_MANDATE` on malformed input are entirely untested for the autonomy-tier gate.
Doporučení: add tests asserting 422 on unknown keys, DEFAULT_MANDATE on corrupt file, and that read never returns inbound-writable state.

[SEVERITY: Medium] [FILE: apps/api/src/gates/policy.storage.service.ts:32-54] [CATEGORY: Missing critical tests]
`PolicyStorageService` has no dedicated test; the security-critical behaviors (forcing `source:"system"/locked:true`, dropping a single malformed rule, fallback) are only exercised indirectly. The partial-tamper case (High above) is uncovered.
Doporučení: add direct tests for provenance-forcing, tolerant parse, and floor enforcement under a partially-stripped POLICY.md.

[SEVERITY: Low] [FILE: apps/api/src/gates/gates.controller.ts:44-58] [CATEGORY: Nest best practices / boilerplate]
`replaceAgentGates` hand-rolls try/catch + `errors.isMissing`/`errors.notFound` instead of the `errors.or404` helper used by every other handler here.
Doporučení: fold the 404 path through `errors.or404`, keep only the 422 harden-only branch inline.

[SEVERITY: Low] [FILE: apps/api/src/gates/gate-evaluator.service.ts:85-89] [CATEGORY: Enforcement layering]
Runtime `evaluate`/`rulesForAgent` never re-checks harden-only; safety relies entirely on write-time validation in the controller. Any path writing `agent.gates` without going through `replaceAgentGates` (seed data, direct agents-store update) yields an unvalidated own-first ruleset the engine trusts.
Doporučení: apply a floor-precedence guarantee inside the evaluator (locked deny/floor rules win regardless of own-rule order).

STATS: 19 souborů (16 source + 3 test skimnuto), 1533 řádků. Top 3: gate-evaluator.service.test.ts (230), gate-evaluator.service.ts (224), gate-rules.storage.service.ts (165).
