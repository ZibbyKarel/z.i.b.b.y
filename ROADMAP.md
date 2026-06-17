# ZIBBY — Implementation Roadmap

## From the Real Current State to the North Star

> This roadmap is rebaselined against a **code-level audit** of the system (2026-06-16),
> not against aspirational phase notes. Phase numbers from earlier planning are dropped —
> what matters is the honest delta between what exists on disk today and the
> [[north-star]] vision, and the shortest dependency-ordered path to close it.

The canonical vision is `apps/api/data/vault/north-star.md`. This document is the
execution plan that converges the system onto it.

---

## State Audit — What Actually Exists (2026-06-16)

The previous roadmap treated channels, briefing, and budget as unbuilt. They are not.
The real picture, verified against `apps/api/src`:

| Capability                                                          | Status                      | Reality on disk                                                                                                        |
| ------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Delivery loop (agent → review → test → verify, retry/escalate)      | ✅ Real                     | `goals/`, `pipelines/`, `runner/` — bounded iteration, worktree isolation                                              |
| Goals / loop engine (maker ⇄ verifier, parking, budget fuse)        | ✅ Real                     | `goals/goal-runner.service.ts`, per-goal run-count budget                                                              |
| Self-development (builder ≠ subject, worktree off-tree)             | ✅ Real                     | sibling-checkout isolation, scoped verifier, `ZIBBY_WORKTREE_ROOT`                                                     |
| TaskClassifier (LLM router + keyword fallback + orchestrator floor) | ✅ Real                     | `tasks/task-classifier.service.ts`                                                                                     |
| Gate engine (locked floor, agent harden-only, dry-run evaluate)     | ✅ Real                     | `gates/`, `data/POLICY.md`; floor: payment/push/pr.open→ask, pr.merge→deny                                             |
| **Channel runtime (Slack + email)**                                 | ✅ **Real, not greenfield** | `channels/` — Slack Web API fetch + email imapflow/nodemailer, 30s cursor-safe poll, approval-gated outbound           |
| Memory vault + grounding + run recorder                             | ✅ Real                     | `memory/` — index-first read, daily append, term-matched grounding, episodic record                                    |
| Briefing (assemble + butler prose + 07:00 cron)                     | ✅ Real, **thin**           | `briefing/` + `automations/morning-briefing.json` (fires daily) — sections exist, content is shallow                   |
| Budget governance (per-project + global + concurrency)              | ✅ **Done (M7, 2026-06-17)** | `budget/` — daily/weekly/**monthly** run caps + global subscription-window % thresholds (80/90/100 via `pauseAtRollingPct`) + `spend-past-cap` floor gate. **USD N/A by design**: a Claude subscription exposes no per-run cost, so the budget unit is run-counts (the schema itself notes a token cap "would be a lie") |
| Mandate / autonomy doc                                              | 🟡 Partial                  | `data/mandate.json` exists but minimal (`dispatch:true, reply:false`)                                                  |
| **Project = operational profile**                                   | ✅ **Done (M1, 2026-06-17)** | contract extended (identity/autonomy_policy/daily_rhythm), `GET/PUT /projects/:id/profile`, vault mirror, profile editor UI at `/projects/[id]` |
| **Inbound message → action routing**                                | ✅ **Done (M2, 2026-06-17)** | project autonomy_policy enforced at triage: VIP+vip_escalation→T3, respond_as=draft_only→T3; vip stamped on item; inbox shows sender+VIP badge |
| **Self-learning from approval signals**                             | ❌ Absent                   | no pattern extractor; `patterns/` folder doesn't exist in the vault                                                    |
| **Nightly consolidation job**                                       | ❌ Absent                   | heartbeat scheduler exists, but no nightly roll-up / cost / pattern pass                                               |
| **Standup cheat sheets per project**                                | ✅ **Done (M3, 2026-06-17)** | StandupService (24h activity→markdown); GET /projects/:id/standup; standup card on ProfileScreen; trend7d in Briefing |
| **Research / intelligence layer**                                   | ✅ **Done (M6, 2026-06-17)** | `research/` — operator config + source-adapter seam (fake fixtures) + interest-overlap ranking + vault `intelligence/digest` note + briefing Intelligence section + `research-digest` 06:00 automation |
| **GapDetector / "I want X" NL self-mod flow**                       | ✅ **Done (M5, 2026-06-17)** | `gaps/` GapDetectorService — scans 30d `task-created` activity for recurring manual work → `vault/suggestions/automation-gaps.md` → briefing "Gaps I noticed"; `gap-detect` 23:00 automation. NL "I want X→PR" already covered by classifier→delivery pipeline→worktree→`pr.open` gate |

**The headline correction:** the hard infrastructure (channel I/O, gate floor, goal loop,
vault, budget caps) is already real. The gaps are mostly **wiring and the semantic/learning
layer** — turning existing pipes into per-project autonomous behavior, and giving the system
a memory that compounds. That reorders the work significantly versus the old plan.

---

## Convergence Path

Eight milestones, ordered by dependency and by impact on the north-star "finished day."
Each lists **Reality** (what's already there), **Gap**, **Build**, **Output**.

```
M1 Project Profile ──┬─→ M2 Inbound Autonomy ──→ M3 Narrative Briefing + Standup
                     │                                      │
                     └─→ M7 Multi-Project + USD Budget       └─→ M4 Self-Learning + Nightly Consolidation
                                                                        │
M5 Self-Modification Front-End ─────────────────────────────────────────┤
M6 Research / Intelligence Layer ───────────────────────────────────────┘
M8 Hardening + Telemetry  (continuous, not last)
```

---

## M1 — Project Profile (the operational atom) ✅ DONE 2026-06-17

**Why first:** the north-star makes the project profile the unit of operational context
("without a project profile, ZIBBY is blind"). Channels, autonomy, and briefing all key off
it. Everything downstream depends on this.

**Reality:** `project` is a real, file-backed registry with `id/name/path/desc/category/checks/
budget(dailyRuns/weeklyRuns/maxConcurrent)/env/secrets`. The gate engine already matches a
`context` condition that can carry a `projectId`.

**Gap:** no `identity.people` (with VIP flags), no `autonomy_policy`, no `daily_rhythm`, no
binding of an integration/channel to a project. The web surface is a thin CRUD picker, not a
profile editor.

**Build:**

- Extend `libs/contracts/.../project.schema.ts` (contract-first): add `identity.people[]`
  (name / role / vip / comms_style), `autonomy_policy` (`can_do_alone[]`, `always_ask[]`,
  `vip_escalation`, `respond_as: autonomous|draft_only`), `daily_rhythm` (standup_time,
  format, active_hours). Keep `budget` where it is.
- Bind channels to projects: an integration references the project(s) it monitors (extend
  the integrations contract, not the project — channels stay per-integration, projects
  declare which they watch).
- Endpoints: `GET/PUT /projects/:id/profile`, `GET/POST /projects/:id/people`.
- Persist as `vault/projects/<id>.md` frontmatter so the profile is also a grounding note
  (files are source of truth; today only `_categories.json` exists).
- Gate: formalize per-project resolution on the existing `context` condition — a project's
  policy can only **harden** the global floor (422 on relax), never relax it.
- UI: real profile editor in `/projects` — Team (VIP flagging), Channels (bind integrations),
  Autonomy (visual can-do / must-ask editor), Daily Rhythm. Replace the bare CRUD form.

**Output:** an operator can fully describe a mission in the UI; agents running in that project
ground on its profile; the gate respects per-project policy.

---

## M2 — Inbound Autonomy (channels → classifier → tier) ✅ DONE 2026-06-17

**Why second:** the channel _runtime_ is the biggest already-built asset the old roadmap
missed. The value is unlocked by wiring it to action, not by building it.

**Reality:** `ChannelWatcherService` polls Slack/email for real (cursor-safe, rate-limit
tolerant), persists inbound items, runs an optional triage flow, and gates outbound replies
through the approval engine.

**Gap:** inbound items don't yet route through `TaskClassifier` into a per-project decision.
There is no `{action: respond|create_task|ignore, confidence, suggested_agent}` verdict, no
VIP→Tier-3 escalation, no draft-into-approval-queue for Tier 3.

**Build:**

- `channel.message.received` → `TaskClassifier` with `{text, sender, project, vip}` →
  `{action, confidence, suggested_agent}`.
- Route the verdict through the gate engine **with project context**:
  Tier 1 act silently · Tier 2 act + record activity · Tier 3 prepare draft → approval queue.
- VIP sender (from M1 profile) forces Tier 3. `respond_as: draft_only` forces Tier 3.
- Integrations UI: live inbox showing how each item was handled, pending drafts awaiting
  approval, sent-reply history (the read path largely exists — add the handling/draft view).

**Output:** a Slack bug report becomes a task + draft PR (Tier 3); a routine question gets
answered per policy (Tier 1/2). ZIBBY monitors on the operator's behalf and escalates where
it must.

---

## M3 — Narrative Briefing + Standup Cheat Sheets ✅ DONE 2026-06-17

**Why third:** daily, visible value. The briefing is the operator's "I just show up for the
daily" moment from the north-star.

**Reality:** `BriefingService` assembles `needsYou / didForYou / watching / engagements /
counts`, runs an optional `claude -p` butler-voice rewrite of the headline, persists a daily
note, and **already fires at 07:00** via `automations/morning-briefing.json`. Two real
briefing notes exist in `vault/daily/`.

**Gap:** content is shallow — headline-only prose, no 7-day trend context, no "What I learned"
section, no per-project standup cheat sheets.

**Build:**

- Deepen the briefing: full narrative overnight section (completed/failed + why), 7-day trend
  context from `vault/daily/*`, a "What I learned" section (fed by M4), priorities derived
  from backlog.
- `StandupAgent` per project: cron from `daily_rhythm.standup_time`, reads project channel/
  activity for the past 24h, emits a cheat sheet in the configured format, surfaces on velín
  ~15 min before standup.
- Velín overview already renders `BriefingCard` — extend it to show standup cards per project.

**Output:** the operator opens velín to a real narrative debrief plus a ready standup sheet
for every active project.

---

## M4 — Self-Learning + Nightly Consolidation ✅ DONE 2026-06-17

**Why fourth:** this is what makes ZIBBY a _second brain_ rather than an executor — "by
morning it knows more than it did the night before." Genuinely greenfield.

**Reality:** approvals and the append-only activity log are real and queryable. Nothing reads
them back for learning. The `patterns/` vault folder does not exist.

**Gap:** no approval-signal capture, no `PatternExtractor`, no nightly job, no Q&A learning
capture.

**Build:**

- Approval-signal capture: hook every gate resolve → structured entry in
  `vault/patterns/approval-patterns.md` (project, action, context, decision, time-to-decide).
- `PatternExtractor` (nightly): scan 30 days of signals; ≥ N repeats of a pattern → draft a
  rule proposal in `vault/patterns/suggestions.md`; the morning briefing surfaces it as
  "I have a proposed autonomous rule — approve?".
- Nightly heartbeat (extend the existing scheduler, ~23:00): PatternExtractor → BriefingPrep →
  VaultConsolidator (merge daily notes into `knowledge/`) → CostTracker (feeds M7).
- Explicit learning: when ZIBBY asks and the operator answers, write `Q/A/context` to the vault
  for the extractor to consolidate.
- Create the missing vault structure (`patterns/`, `suggestions/`) and the `MEMORY.md` /
  index MOC the north-star links to but which isn't on disk yet.

**Output:** after ~2 weeks of operation ZIBBY proposes its first autonomous rules; the briefing
gains a real "What I learned" section.

---

## M5 — Self-Modification Front-End ("I want X" → PR) ✅ DONE (front door) 2026-06-17

> **Delivered:** the proactive front door — `GapDetectorService` (`gaps/`) scans 30 days of
> `task-created` activity for recurring manual work, drafts "automate it?" suggestions into
> `vault/suggestions/automation-gaps.md`, and the morning briefing surfaces them under
> "Gaps I noticed" (`Briefing.automationGaps`). Nightly `gap-detect` automation (23:00).
> Docs: `docs/api/gaps.md`. *Proposes ≠ acts* — it only writes a vault note.
>
> **Already satisfied (verified, not rebuilt):** the "I want X → plan → PR" back half — the
> TaskClassifier routes a self-modification intent into the delivery pipeline against ZIBBY's
> own repo, the goal loop builds it in an isolated sibling worktree (builder ≠ subject), and
> the locked gate floor forces every PR through approval (`pr.open → ask`, `pr.merge → deny`),
> so a self-mod PR is structurally Tier-3 already. **Deferred (belt-and-suspenders):** a
> dedicated self-mod PR description template + an explicit "this PR targets ZIBBY's own repo"
> marker on top of the existing floor.

**Why fifth:** the engine exists; only the proactive front door and a hardened gate are missing.

**Reality:** goals + maker/verifier + worktree isolation (builder ≠ subject) are real and
tested. The gate floor already routes `pr.open → ask` and `pr.merge → deny` structurally, so
a self-mod PR cannot auto-merge.

**Gap:** no `GapDetector`, no natural-language "I want X → plan → PR" flow, no explicit
hardcoded Tier-3 marker on self-modification specifically, no post-merge auto test report.

**Build:**

- `GapDetector` agent: scans activity + vault for recurring manual steps →
  `vault/suggestions/automation-gaps.md` → briefing: "I noticed X — automate it?".
- Harden self-mod: a structural rule that any PR **against ZIBBY's own repo** is forced Tier 3
  (belt-and-suspenders on top of the pr.open/pr.merge floor), with a PR description template
  (what / why / blast radius).
- "I want X" flow: classifier tags self-modification → plan (surfaced for approval) → delivery
  pipeline against own repo → PR → after approve+merge, auto-run suite and report.

**Output:** the operator adds capabilities in natural language; every self-change is gated and
auditable end-to-end.

---

## M6 — Research / Intelligence Layer ✅ DONE 2026-06-17

> **Delivered:** operator-level research config (`data/research-config.json`), a pluggable
> `ResearchSourceAdapter` seam (the `FakeResearchAdapter` reads `data/research/fixtures/*.json`;
> real RSS/HN/PH fetchers slot in behind it later), pure interest-overlap ranking, a digest
> pass that persists `data/research-digest.json` + mirrors the vault note `intelligence/digest`,
> the morning briefing's new **Intelligence** section (`Briefing.intelligence`), and the
> `research-digest` 06:00 automation. `finance` sources are gated behind `financeWatch`
> (overview-only). Docs: `docs/api/research.md`. **Deferred:** real network source adapters;
> on-demand "what's trending in X?" via the task path; the weekly "3 app ideas" generator.

**Why sixth:** proactive, world-facing value — "ZIBBY brings the world to the operator." Fully
greenfield, depends on the briefing (M3) and nightly job (M4) as delivery vehicles.

**Reality:** none. No research agents, no operator research config.

**Build:**

- `ResearchAgent` with sub-watchers: `TrendWatcher` (RSS/HN/PH), `TechWatcher` (libs/CVEs),
  optional `FinanceWatcher` (overview only, never advice), `CompetitorWatcher`.
- Operator-level research config in the main profile (interests, sources, finance_watch) —
  not per-project.
- Output: a daily digest folded into the morning briefing; on-demand "what's trending in X?"
  via the existing voice/task path; a weekly "3 app ideas" generator (bonus) combining trends
  with operator skills from the vault.

**Output:** the morning briefing gains an intelligence section; ZIBBY surfaces relevant signal
unprompted.

---

## M7 — Multi-Project Isolation + Budget Governance ✅ DONE (budget) 2026-06-17

> **Delivered (budget governance):** the north-star's "monthly cap" — a `monthlyRuns`
> per-project cap mirroring daily/weekly (`ProjectBudget.monthlyRuns`, `ledger.countMonthly`
> over the Prague calendar month, enforced in `BudgetService.check` as `project-monthly`,
> surfaced in `BudgetStatus.projects[].monthly` and the project profile editor). The
> 80/90/100% auto-hold thresholds **already existed** (`pauseAtRollingPct`/`pauseAtWeeklyPct`
> with `>=` checks); "spend past a cap requires approval" is the `spend-past-cap` locked floor.
>
> **USD cost tracking is N/A by design — recorded deviation:** ZIBBY runs on a Claude
> *subscription*, not metered API billing, and a `claude -p` run surfaces no per-run token/USD
> cost (`LedgerEntry` has no cost field; `ProjectBudgetSchema` comments that a token cap "would
> be a lie in the UI"). The north-star says "monthly cap, per-run cap" — never "USD" — so 1:1
> is met by run-count caps + subscription-window %; the per-goal run-count budget (Phase 13.1)
> covers the "per-run cap" intent. **Still open (multi-project, not budget):** project data
> isolation on the grounding/workspace seam, a multi-project velín, cross-project intelligence.

**Why seventh:** matters once there is more than one mission; the run-count half already exists.

**Reality:** per-project run-count caps (daily/weekly), a global account ceiling, and a
concurrency queue are all real. Per-project gate policy lands in M1.

**Gap:** budget is **run-count only** — there is no USD cost tracking (`budget.json` and the
ledger are empty), no 80/90/100% thresholds, no multi-project velín, no cross-project learning.

**Build:**

- Real-time USD cost tracking per project per day (CostTracker from M4 writes the ledger).
- Thresholds: auto-hold at 80% of monthly cap, alert at 90%, hard stop at 100%; briefing shows
  yesterday's spend + projected month-end.
- Project data isolation: an agent in project A cannot read project B's data (enforce on the
  grounding + workspace seam).
- Multi-project velín: one dashboard, per-project health / activity / pending approvals /
  budget utilization.
- Cross-project intelligence: apply learnings (e.g. conventions) from A to B where rules allow.

**Output:** ZIBBY runs several missions in parallel with isolated rules and real cost control.

---

## M8 — Hardening + Telemetry (continuous)

**Why continuous, not last:** much of this already exists from the self-development safety work;
the rest should land alongside every milestone, not be deferred.

**Reality:** graceful shutdown that awaits child exit, orphan/pgid reaping, goal/run restart
recovery (reconstruct on boot), and a `/health` liveness probe are already real.

**Gap:** `/health` lacks per-subsystem detail, no velín health indicators, no audit export, no
retention policy, no dead-letter queue, no exponential backoff on integration calls.

**Build:**

- `/api/health` with per-subsystem status (backend, vault, integrations, scheduler); velín HUD
  health indicators; never-silent degraded-state alerts.
- Retry with exponential backoff for integration I/O; dead-letter queue for failed tasks;
  operator notification on repeated failure.
- Audit trail completeness (who/what/when/result) + export; retention/cleanup for run artifacts.

**Output:** a production-grade system that survives failure and never fails silently.

---

## Recommended Order

By impact on the north-star "finished day," respecting dependencies:

1. **M1 — Project Profile** (foundation; everything keys off it)
2. **M2 — Inbound Autonomy** (largest practical payoff; unlocks the already-built channel runtime)
3. **M3 — Narrative Briefing + Standup** (daily value from day one)
4. **M4 — Self-Learning + Nightly Consolidation** (compounding value; the "second brain")
5. **M5 — Self-Modification Front-End** (engine exists; cheap to finish)
6. **M6 — Research / Intelligence** (proactive value)
7. **M7 — Multi-Project + USD Budget** (when there is more than one mission)
8. **M8 — Hardening + Telemetry** (continuous, threaded through all of the above)

---

## Architectural Principles — Must Not Be Violated

The DNA of the system; no milestone may compromise these:

- **Files are source of truth** — no black-box database; everything on disk, human-readable.
- **Approval-first is law** — hardcoded at the dispatch/gate floor, not config; payments,
  external email, merges, deletes, and self-modification PRs always require approval.
- **Contract-first development** — ts-rest contract in `libs/contracts` before any implementation.
- **Index-first memory** — no vector RAG; MOC files and atomic Markdown notes.
- **Polling, not SSE** — frontend polling is a non-negotiable constraint.
- **Per-project gate floor** — rules can only be tightened, never relaxed below the global floor.
- **Single operator** — depth over breadth; one vault, one identity.
