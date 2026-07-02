# ZIBBY — Implementation Roadmap

## From the Real Current State to the North Star

> **Rebaselined 2026-07-01** against a code-level audit of the system **and** two resolved
> oracle conflicts. The system already reached 1:1 with the previous north-star (2026-06-18,
> 25 phases). This roadmap is therefore **not a fresh build** — it is the honest delta between
> what exists on disk today and the **updated** [[north-star]], plus the shortest
> dependency-ordered path to close it.

The canonical vision is `.zibby/data/vault/north-star.md`. This document converges the system
onto it. **Do not rebuild what the audit below marks as done.**

---

## ✅ Already Delivered — Do Not Rebuild

Verified against `apps/api/src` and the prior convergence record. Every item here is real and
tested; a long build run must **extend or polish** it, never re-create it:

- **Delivery loop** — agent → review → test → verify, bounded retry/escalate, worktree isolation
  (`goals/`, `pipelines/`, `runner/`).
- **Goals / loop engine** — maker ⇄ verifier, parking, per-goal run-count budget.
- **Self-development** — builder ≠ subject, off-tree sibling worktree, scoped verifier.
- **Channels (all 4)** — Slack, email, Jira, GitHub inbound poll (cursor-safe, rate-limit
  tolerant), approval-gated outbound; autonomous bug → gated Jira issue + draft PR.
- **Calendar integration** — Google Calendar (service-account auth), read-only. _Mocked, not
  live-verified; north-star now names it (was previously unlisted)._
- **Gate engine** — locked floor (payment/push/pr.open → ask, pr.merge → deny), agent
  harden-only, per-project resolution.
- **Memory vault** — index-first read, daily append, term-matched grounding, run recorder,
  nightly distillation; project-scoped grounding isolation.
- **Briefing + standup** — narrative debrief, per-project standup, morning cron.
- **Budget governance** — daily/weekly/monthly run caps + subscription-window % thresholds.
- **Self-learning** — approval-pattern extractor, nightly consolidation, gap detector, app-ideas.
- **Pipeline internals** — phases pass artifacts **within** a pipeline (`consumes`/`produces`);
  a pipeline yields a durable `pr` or `file` output (project|vault).
- **Voice loop** — live STT, command bridge, TTS read-back, spoken briefing (pull-not-push).
- **Live streams** — RightRail is already an SSE-streamed activity log (the reference for the
  DNA change below).

---

## 🔧 Resolved Oracle Conflicts — 2026-07-01

Two DNA statements were stale or contradicted the operator's intent. Now settled; the
north-star has been amended to match. These land as **N1**.

1. **SSE, not blanket polling.** The old DNA said "Polling, not SSE." Reality already ships an
   SSE RightRail, and the operator's decision is explicit: **live streams (logs, activity feed,
   run-events) use SSE; only `health` and `limits` poll.** The principle is inverted, not
   discarded.

2. **Explicit target overrides the classifier.** The old DNA said "the operator never picks an
   agent." The operator's decision: naming a specific pipeline/agent is a **hard override — the
   classifier is skipped and exactly that unit runs.** Pure intent (no target) is what the
   classifier routes. Manual composition of agents into pipelines, and chaining pipelines, are
   now first-class operator capabilities. _Today `NewTaskDialog` only pre-fills a target and the
   classifier still runs — that is the behaviour N1 changes._

---

## Convergence Phases — the genuine delta

Dependency- and impact-ordered. Each phase is contract-first, tests are definition-of-done,
and each ends at a checkpoint commit (never a push/merge — the PR is the gate).

```
N1 DNA alignment (SSE + classifier override) ──┬─→ N2 Pipeline chaining (artifact out → in)
                                               ├─→ N3 CI/CD monitor + pluggable monitor seam
                                               └─→ N4 UI/UX consistency (HUD + Chat-UI)
N5 Controlling the machine (nice-to-have) ── last
NC Simplification / architecture / bug sweep ── CONTINUOUS, threaded through N1–N5
```

---

## N1 — DNA Alignment: SSE + Classifier Override ✅ DELIVERED 2026-07-01

> Delivered — see `docs/plans/phase-n1.md`. The code-level audit found the override half
> already shipped (web sends `target`, the scheduler's dispatch skips the classifier;
> the ROADMAP's "classifier still runs" referred to the side-effect-free preview, which
> stays by design) — it gained its named regression test. The SSE audit found and fixed
> three genuine violations: the live stage log (1s poll → SSE tail with poll fallback),
> `useApprovalsQuery` and `useBudgetQuery` (unconditional polls → SSE-invalidated,
> poll only while the stream is down), plus approvals invalidation on `approval-*`
> activity. Discovered en route: 21 pre-existing API e2e failures (stale vs the
> intentional background-dispatch + integrations-under-projects changes) — queued as
> the next bug-fix phase.

**Why first:** cheap, unblocks the rest, and removes the two live contradictions between the
oracle and the code before anything measures against it.

**Reality:** RightRail already streams over SSE. `NewTaskDialog` pre-fills an `initialTarget`
but the classifier runs regardless.

**Gap:** DNA docs still declared polling-only; other live surfaces may still poll where SSE
belongs; an explicit target does not yet bypass routing.

**Build:**

- Audit every live surface (logs, activity, run-events, running lists) — migrate to SSE where
  it is genuinely a stream; leave `health` and `limits` on polling. Codify in the frontend
  constraint.
- Dispatch: when a task carries an explicit `target` (pipeline/agent), **skip the classifier
  entirely** and run the named unit. No target → classify as today.
- Tests: dispatch-with-target skips classifier (assert classifier not invoked); dispatch-without
  -target still routes; an SSE surface pushes without a poll.

**Output:** the oracle and the code agree; explicit runs are deterministic; the frontend is
real-time where it matters.

---

## N2 — Pipeline Chaining (artifact out → in) ✅ DELIVERED 2026-07-01/02

> Delivered in two bounded phases. **N2a** (`docs/plans/phase-n2a-artifact-registry.md`):
> the durable artifact registry — a plain-JSON provenance record per delivered output
> (`vault-note`/`project-file`/`pr`), written by the delivery sinks, read-only over
> `GET /api/artifacts`. **N2b** (`docs/plans/phase-n2b-chain-primitive.md`): the chain
> primitive — operator-authored linear chains, completion-driven advance with the
> artifact as the handoff medium, park on any broken handoff, restart reconcile from
> the registry; reference chain `nightly-research → build-feature` proven in e2e.
> Chain-authoring UI intentionally deferred to N4 (the interface phase).

**Why second:** the highest-leverage new capability, and it reuses machinery that already
exists — the north-star's _"research overnight → build an app from it"_ scenario.

**Reality:** phases inside one pipeline already hand artifacts along (`produces` of phase N is
copied into `consumes` of phase N+1). A pipeline already emits a durable `pr`/`file` output.

**Gap:** there is no **pipeline → pipeline** link. A downstream pipeline or agent cannot take an
upstream pipeline's output artifact as its input. No durable artifact registry across runs.

**Build:**

- Contract-first: a chain/sequence primitive — a downstream pipeline declares an input artifact
  bound to an upstream pipeline's output. Reuse the `consumes`/`produces` semantics, lifted to
  the run boundary.
- A durable artifact record on disk (path + kind + producing run), so a chain survives restart
  and an artifact is reusable as input later.
- UI to author a chain (compose two+ pipelines, wire output → input) — see N4 for the surface.
- Reference chain shipped: `nightly-research → build-feature` end to end.
- Tests: an upstream `file` artifact reaches the downstream pipeline's input; a chain resumes
  after restart from the artifact record; a broken/missing artifact parks, not crashes.

**Output:** the operator chains missions — one pipeline's document/branch becomes the next
pipeline's brief — unattended overnight.

---

## N3 — CI/CD Monitoring + Pluggable Monitor Seam ✅ DELIVERED 2026-07-02

> Delivered — see `docs/plans/phase-n3-monitor-seam.md` + `docs/api/monitors.md`.
> `MonitorAdapter` seam (alerts, not messages; `wants()` opt-in; a second adapter
> registers with zero runtime change — the Sentry test passes). GitHub Actions monitor
> rides the existing github integration (`streams: ["ci"]`), dedupes per run attempt,
> and a red run dispatches an investigation task on the ordinary tier path (guards +
> PR gate included); a failed dispatch retries next tick. Heartbeat
> `systemConfig.monitorTickMs` + /settings field; read-only `GET /api/monitors/events`.
> The deferred surfaces landed as **N4b (2026-07-02)**: CI health as STATE
> (`GET /api/monitors/status`, sidecar per integration × adapter), the briefing's
> `ci-red` needs-you line (only while red — no re-alerts), and the project-detail
> three-indicator chip ("CI červené od HH:MM").

**Why third:** closes the north-star's "monitors CI/CD" and leaves the clean seam for Sentry.

**Reality:** the GitHub adapter polls **only** `/repos/{repo}/issues` (+ comments). Monitors are
modeled as _inbound messages_; there is no generic monitor abstraction.

**Gap:** no Actions / `workflow_runs` / check-run status; a red CI run is invisible to ZIBBY;
no seam to add a non-message monitor (Sentry-style alert source) later.

**Build:**

- A **`MonitorAdapter` seam**, distinct from `ChannelAdapter` — a monitor emits _status/alert_
  events, not conversational messages. Pluggable and fixture-testable like the channel seam.
- First monitor: GitHub CI — poll workflow runs / check status for the project's repo; a failed
  run becomes a triaged item → tier (a fix on its own branch is a Tier-3 gated PR).
- Surface CI health in the per-project HUD and the briefing ("main is red since 08:12").
- Seam documented so a Sentry monitor is a drop-in later (no core changes).
- Tests: a failed workflow-run fixture produces a monitor event → triage → tier; a green run is
  a no-op; the seam accepts a second (fake) monitor without touching the runtime.

**Output:** ZIBBY watches the build the way it watches the inbox; Sentry is a future plug, not a
rewrite.

---

## N4 — UI/UX Consistency (HUD + Chat-UI, one language)

> ✅ **N4a DELIVERED 2026-07-02** — `/chains` section (compose/run/watch chains;
> `docs/plans/phase-n4a-chains-ui.md`).
> ✅ **N4b DELIVERED 2026-07-02** — CI health surface (status endpoint + briefing
> red line + project chip; `docs/plans/phase-n4b-ci-health.md`).
> ✅ **N4c DELIVERED 2026-07-02** — full grammar audit (deviation table in
> `docs/plans/phase-n4c-agents-grammar.md`) + agents migrated: `/agents/[id]`
> detail page, card navigates, create-only dialog, Run wired. Remaining
> offenders: skills, commands, automations, hooks, mcp, integrations, memory
> (create+edit dialogs) — N4d/N4e batches.

**Why fourth:** the system _works_ but does not yet feel like one product. This is a
first-class goal (north-star _"The Interface — One Language, Everywhere"_), not end-of-run
polish. It is audit-driven, section by section.

**Reality:** `libs/design-system` exists and some migrations are done (e.g. project cards
already navigate to a page, not a dialog). Chat-UI has design specs
(`docs/superpowers/specs/2026-06-23-chat-ui-*`).

**Gap — concrete, operator-reported inconsistencies:**

- Edit affordance placement drifts (some screens bottom-right instead of top-right).
- Some cards still open a **dialog** instead of navigating to a **detail page**.
- Interactive elements without a label/description — the operator cannot tell what a control
  does.
- Uneven empty / loading / error states; bespoke styling that bypasses the design system.
- HUD and Chat-UI do not yet share one visual + interaction language.

**Build:**

- An **interaction-pattern contract** enforced across `apps/web`: edit/primary action always
  top-right; a card click **navigates to the detail page**; dialogs are for create + confirm
  only. Migrate every offending section.
- **Nothing unlabeled** — every interactive element gets an accessible name and, where its
  purpose is not obvious, a tooltip/description. (Composes with the DS testid work — labels are
  assertions.)
- Unify every section on design-system primitives; standard empty/loading/error states.
- Align HUD and Chat-UI on one visual language and one interaction grammar.
- Tests: per migrated section, assert the affordance placement / navigation target and the
  accessible name of each control (role + accessible-name assertions, not selector churn).

**Output:** any screen feels like the same product; the operator never wonders what a control
does or where the edit button went.

---

## N5 — Controlling the Machine _(nice-to-have, last)_

**Why last:** explicitly a stretch goal; pursued only once N1–N4 are solid.

**Reality:** none. ZIBBY cannot act on the OS directly.

**Gap:** _"open folder X and rename every file to `xxxyyy.ext`"_, _"open Maps and find the
nearest route to…"_ — no capability.

**Build:**

- A gated computer-use capability behind the approval floor — scoped, reversible-by-default,
  every action Tier-3 unless explicitly hardened otherwise.
- Start with the two reference tasks (file operations in a named folder; a maps lookup).

**Output:** ZIBBY reaches beyond the repo to the operator's machine — safely, and never
unattended.

---

## NC — Simplification, Architecture & Bug Sweep _(continuous)_

**Why continuous, not a one-shot:** 45 phases shipped fast. That leaves duplication, some
architectural drift, and latent bugs. The operator wants a deliberate pass over the **whole
system** to simplify code, correct architecture mistakes, and fix real bugs — but a big-bang
refactor is exactly what the delivery loop forbids. So this runs as a **standing lens applied
every iteration**, and any sizeable cleanup becomes its own bounded phase with tests, not a
sweeping rewrite. It maps directly to LOOP.md priority axis **3 (simplification)** and
**4 (bug fix)**.

**Reality:** the DNA is sound (contract-first, files-as-truth, design-system, gate floor), and
some consolidation already happened (slug unification #30, RightRail rebuild #29, the
consolidation audit #31). Tooling exists: `graphify-out/GRAPH_REPORT.md` (god nodes, community
structure) and the `madge` cycle guard.

**Gap:** no recurring, whole-system audit that ranks and burns down duplication / dead code /
architectural smells / latent bugs on the priority axis.

**Build (each item a bounded, tested phase — never one giant diff):**

- **Simplify** — remove dead code and duplication; collapse needless abstraction; consolidate on
  the established patterns (contract-first, files-as-truth, one design system, the query/mutation
  hook conventions). Lean on `graphify` god-node report + `madge` cycles to target the worst
  offenders first.
- **Fix architecture** — resolve module cycles, misplaced responsibilities, files that have
  grown too large, and any drift from the DNA principles below. Improve boundaries where the
  current work touches them; don't refactor unrelated code "for safety."
- **Fix bugs** — real defects in existing functionality, prioritised by operator impact
  (the gate/approval and dispatch paths first — highest stakes).
- **Definition of done per cleanup** — behaviour preserved, tests green (`pnpm lint && typecheck
  && test`), `graphify update .`, checkpoint commit. A cleanup that can't be proven behaviour-
  preserving is parked, not forced.

**Output:** the system stays simple and correct as it grows — every phase leaves the code at
least as clean as it found it.

---

## Recommended Order

1. **N1 — DNA Alignment** (cheap, unblocks + de-conflicts the oracle)
2. **N2 — Pipeline Chaining** (biggest new payoff; reuses existing artifact machinery)
3. **N3 — CI/CD Monitor + seam** (closes a named channel; Sentry-ready)
4. **N4 — UI/UX Consistency** (one product from any screen; audit-driven)
5. **N5 — Controlling the Machine** (nice-to-have, last)
- **NC — Simplification / Architecture / Bug sweep** — continuous, threaded through all of the above

---

## Architectural Principles — Must Not Be Violated

The DNA of the system; no phase may compromise these:

- **Files are source of truth** — no black-box database; everything on disk, human-readable.
- **Approval-first is law** — hardcoded at the dispatch/gate floor; payments, external email,
  merges, deletes, self-modification PRs, and machine control always require approval.
- **Contract-first development** — ts-rest contract in `libs/contracts` before any implementation.
- **Index-first memory** — no vector RAG; MOC files and atomic Markdown notes.
- **SSE for live streams, polling for state** — logs / activity / run-events stream over SSE;
  only `health` and `limits` poll.
- **Explicit target overrides the classifier** — naming a pipeline/agent skips routing.
- **One interaction grammar** — same affordance, same place, every screen; card-click navigates,
  dialogs create/confirm.
- **Per-project gate floor** — rules can only be tightened, never relaxed below the global floor.
- **Single operator** — depth over breadth; one vault, one identity.
