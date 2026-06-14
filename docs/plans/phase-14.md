Phase 14 — Operator UX for the new goal/loop states

Context

The roadmap's Phases 1–13 are shipped. Phases 12/13 added new goal park reasons
(`verifier-scope`, `awaiting-resume`) and a per-goal `budget` (13.1) that land in the data
but rendered as raw enum strings with no operator-legible meaning. Phase 14 closes that UX
gap — thin web glue over delivered contracts.

Progress (loop tracking)

- [x] 14.1 — Surface goal park reasons + budget in the web UI (DONE 2026-06-14)
- [x] 14.2 — Refresh roadmap ground-truth + Playwright audit (DONE 2026-06-14). Rewrote the
      stale "Where we are today" block/gap table (all gaps delivered; 7 specs not 3). Ran
      `pnpm e2e` — fixed a REAL `pipeline-run.spec` failure (`/Run · max/` → dialog-scoped
      "Run pipeline" launch; the label drifted to `pipelineRun.launch`). 8 deterministic
      specs stable; `approval`/`channels` flake via shared-approvals-queue cross-spec
      contamination → parked as 14.3.
- [x] 14.3 — Playwright cross-spec isolation (DONE 2026-06-14). approval/channels shared the
      dev-server approvals queue with no per-spec reset AND the agent run used real `claude`
      → flaky. Made selection deterministic + the agent approval deterministic+token-free.
      `pnpm e2e` now 10/10 across 3 repeated local runs (and faster: ~48s vs ~1.1m).

---

14.3 Playwright cross-spec isolation

Root cause (three compounding defects, each masking the next):
1. **Fragile selection.** Both specs targeted the SHARED overview approvals queue by
   text-soup (`.first()` "Approve", `hasText: "channel-reply"`). The agent card is
   high-risk (a HoldButton) and the channel card is a plain Button, so the greedy
   `.first()` "Approve" silently approved the CHANNEL card — `approval.spec` and
   `channels.spec` fought over the *same* approval (a perfect seesaw: exactly one
   failed each run). `hasNotText` didn't help because the action label and the
   approve control live in sibling sub-trees of the card.
2. **State accumulation.** `.e2e-data` (agent-runs, approvals) persists across runs and
   global-setup never drained it, so repeated `pnpm e2e` piled up pending agent
   approvals (queue → 2, 3, … cards; selectors went ambiguous; reused server kept the
   in-memory copies a disk wipe wouldn't clear).
3. **Non-deterministic producer.** playwright.config never set `CLAUDE_BIN`, so the
   seeded gated-agent run spawned REAL `claude` — slow, token-spending, and frequently
   never reaching a gated intent within 20s → no agent card at all.

Delivered:
- **Stable kind-scoped testid.** `ApprovalCard` roots a `data-testid=approval-card-${kind}`
  (overrides Card's generic `card-root`; `kind` flows from the contract approval).
  `approval.spec` → `approval-card-agent`, `channels.spec` → `approval-card-channel`.
  Robust, deterministic, no text-soup. (`ApprovalCardProps.approval` widened with `kind?`.)
- **Queue drain + presence gate in global-setup.** Reject every pending approval at
  setup start (via the API, so it clears the live in-memory queue on a reused server),
  then after seeding poll until BOTH the `agent` and `channel` approvals are actually
  pending — the suite starts from a known, single-of-each queue.
- **Deterministic agent approval.** Point `CLAUDE_BIN` at the api e2e's `fake-claude.mjs`
  stub + a benign `FAKE_CLAUDE_INTENT`; the agent's `requires_approval: true` desugars to
  a catch-all `ask` rule (verified in gate-evaluator), so the run reliably pauses on ONE
  pending approval, token-free. Benign (non-`delete`) intent → plain Approve button → a
  simple click. (This is what the config's own "demo mode, deterministic, token-free"
  docstring always claimed but never wired for agents.)
- **Durable-outcome assertions.** `approval.spec` asserts the agent card LEAVES the
  pending queue (`toHaveCount(0)`) rather than the transient optimistic "Approved" alert
  (which unmounts with the card on refetch) — mirroring `channels.spec`'s inbox-"handled"
  assertion. Unique per-seed channel fixture id defeats the reused-server watcher dedup.

Exit met: `pnpm e2e` 10/10 across 3 consecutive local runs; web-components 211/211; lint
clean. **CLOSES PHASE 14.**

Watch-out: a global `FAKE_CLAUDE_INTENT` makes EVERY agent run announce that intent —
fine today (the only e2e agent run is the seeded gated one), but a future spec that
starts its own agent run would inherit it. The agent run's `project: "zibby-core"` label
stays cosmetic under the stub.

---

14.1 Surface goal park reasons + budget in the web UI

Verified ground truth: `GoalDetailPanel` (apps/web/features/runs/components/) interpolated
`run.goalParkedReason` as a RAW enum into `goalParkedSummary` ("parked ({reason})"). The new
reasons from 12.1/12.4/13.1 (`verifier-scope`, `awaiting-resume`, `budget`) thus showed as
machine strings. `goal.budget` (via `useGoalsQuery`) and `iterations[].startedAt` (via
`run.iterations`) are both client-side available, so the windowed budget bar is buildable.

Delivered:
- i18n (cs+en): `goalParkedReason.<reason>` friendly labels for all five reasons +
  `goalParkedHint.<verifier-scope|awaiting-resume>` next-step hints (these two aren't a
  plain resume — verifier-scope is a config fix, awaiting-resume is a Law-3 restart park).
  `goalParkedSummary` reduced to just the attempts count.
- `GoalDetailPanel`: render the friendly reason as a headline above the existing
  resume-with-note affordance + the hint when present; add a goal-budget bar (windowed
  iteration count vs `goal.budget.dailyRuns/weeklyRuns`, `warn` tone at the cap). The
  windowed "now" is read once via a lazy `useState(() => Date.now())` initializer (React
  purity — `Date.now()` in render body and `setState` in an effect are both lint-forbidden).
- Tests: `GoalDetailPanel.test.tsx` (5) — friendly label per reason, hints, budget bar
  renders "2/2 dnes", no bar without a matching goal/budget, raw enum never shown.

Watch-out: tests run in the cs locale (assert Czech strings). The api `agent-runs.e2e`
git-fixture test still flakes ~rarely under full-suite load (passes isolated) — pre-existing
git-timing transient, NOT touched by this web-only change.
