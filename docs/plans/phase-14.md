Phase 14 — Operator UX for the new goal/loop states

Context

The roadmap's Phases 1–13 are shipped. Phases 12/13 added new goal park reasons
(`verifier-scope`, `awaiting-resume`) and a per-goal `budget` (13.1) that land in the data
but rendered as raw enum strings with no operator-legible meaning. Phase 14 closes that UX
gap — thin web glue over delivered contracts.

Progress (loop tracking)

- [x] 14.1 — Surface goal park reasons + budget in the web UI (DONE 2026-06-14)
- [ ] 14.2 — Refresh roadmap ground-truth + Playwright `pnpm e2e` audit

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
