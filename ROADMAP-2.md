# ZIBBY — Roadmap II: The Federation

## From a Working Monolith to Eight Accountable Subsystems

> Baselined **2026-07-17** against a five-track code-level audit (execution engine,
> autonomy layer, subsystem federation, memory, module health). The previous roadmap
> (N1–N5 + NC) is **exhausted — do not reopen it**. The canonical vision for this
> roadmap is `.zibby/data/vault/north-star-2.md` (North Star II); North Star I remains
> valid for everything it already covers.

---

## Audit Verdict — What Is Actually True Today

**Strong and real (extend, never rebuild):**

- **Delivery loop** — Architekt → Kodér ⇄ Review → Tester → Dokumentátor with bounded
  retries, model/thinking escalation ladder, durable park + operator-note resume
  (`pipeline-runner.service.ts` `drive()`; `.zibby/data/pipelines/delivery.pipeline.md`).
- **Execution substrate** — real `claude -p` spawns, detached-pgid restart survival,
  worktree isolation off `origin/<default>`, two-layer usage-limit pause/resume
  (`runner/runner-core.ts`, `workspace.service.ts`, `limits-resume/`).
- **Autonomy layer** — live Slack/email/calendar/GitHub/Jira adapters, LLM triage with
  keyword fallback (never null, low-confidence escalates tier), structurally
  un-bypassable gate floor (`mergeWithDefaultFloor`, stricter-bucket-wins,
  fail-closed to `ask`), append-only activity, narrative briefing.
- **Memory loop** — automatic run recording (event + bootstrap sweep), nightly LLM
  distillation into the vault, index-first grounding injected into every run
  (`run-recorder.service.ts`, `memory-distiller.service.ts`, `grounding.service.ts`).
- **Run extensibility** — skills/hooks/MCP/commands genuinely reach `claude -p` runs.
- **Chains & artifacts** — completion-driven pipeline→pipeline chaining over a durable
  artifact registry, restart-reconciled.

**The honest gaps (this roadmap):**

1. **Subsystems are ~15 % of their promise.** A closed 8-entry registry + derived
   read-side status. Ownership is a reverse tag on pipelines/chains/gate-rules only;
   agents/channels/monitors have no owner; the "crew roster" is a client-side illusion
   over pipeline phases. The only subsystem "decision" is the _global_ classifier
   re-run with a filtered candidate list, and only on explicit `@mention` — ambient
   tasks are subsystem-blind by design (`isCoherent` rejects `kind:"subsystem"`,
   `task-classifier.service.ts:305-311`). Three mandates (Sentinel, Maestro, Loom)
   have **zero backend**.
2. **PR-gate tier split.** ~~Pipeline `pr` output approval-gated vs task `pr`
   immediate.~~ **CORRECTED by F0 planning (2026-07-17):** the code already unified —
   `PipelineRunnerService.runOutputs` opens the PR immediately with no gate
   (`pipeline-runner.service.ts:1096-1111`); the park path is legacy-only. What
   remains is the operator's new requirement: per-project `prOpenMode`
   (`ready`/`draft`) — see F0b.
3. **Merge debt.** ~~Several completed branch arcs parked at the PR gate.~~
   **RESOLVED 2026-07-17:** the operator confirmed the arcs were merged into main by
   hand; 20 local branches verified patch-equivalent (`git cherry`) and deleted.
   Kept (genuinely unmerged patches): `feat/phase-45-qualify` (10),
   `feat/todo-chat-detail-width` (3), `develop` (2), `feat/speakd-tts-integration`
   (1), `chore/audit-remediation-plans` (1).
4. **Trust is mock-deep.** Every adapter is validated against mocked transports only;
   no live soak; health module doesn't probe the channel watcher, monitor watcher, or
   triage router; triage confidence is one global constant (0.5) with no accuracy
   feedback.
5. **Dead weight & duplication.** `discovery/` is backend-complete with zero web
   consumers; `features/goals` frontend hooks are dead; three parallel
   "detect → propose → Tier-3 approve" inboxes (agent-factory, gaps, discovery);
   `projects/` module does too much (vault, secrets, PR, standup, matcher).
6. **Memory is work-only and naive at scale.** Substring/token-overlap retrieval,
   no seeded vault on fresh install, self-knowledge regeneration is manual-CLI-only,
   no personal domain anywhere.
7. **Monitoring is single-source.** GitHub Actions CI only; Sentry is a documented
   seam with an enum of exactly one value.

---

## Phase Map

```
F0 Land the fleet (merge debt + PR-tier unify + dead weight) ── prerequisite hygiene
F1 Ownership is data (ownerSubsystem everywhere) ──┬─→ F2 Two-stage dispatch
                                                   ├─→ F3 Subsystem policy + accountability
                                                   └─→ F4 Memory shelves + retrieval upgrade
F5 The empty chairs (Sentinel · Maestro · Loom v1) ── needs F1–F3
F6 Herald grows up + live trust harness ── needs F3
F7 Second monitor + merge-queue polish ── needs F5 (Maestro)
F8 Personal domain (second brain, whole life) ── independent after F4
FC Simplification / architecture / bug sweep ── CONTINUOUS (carries NC forward)
```

Every phase is contract-first (`libs/contracts` before implementation), tests are the
definition of done, and every phase ends at a checkpoint commit — the PR is the gate.
Phases are sized for cheaper implementation models; each names its files.

---

## F0 — Land the Fleet _(hygiene before construction)_

**Why first:** the PR-tier split undermines the system's core promise, and dead
modules distort every catalog the classifier and the federation will build on.
(Branch cleanup already done 2026-07-17 — see gap 3 above.)

**Subphases:**

- **F0a — Delete the orphans** _(operator decision: delete)._ Remove
  `apps/api/src/discovery` + its contract + `app.contract.ts` entry, and the dead
  `apps/web/features/goals` hooks (goals API stays — the loop engine uses it).
- **F0b — Per-project draft PR mode.** _(Tier unify verified already shipped — see
  gap 2.)_ The project profile gains `prOpenMode: "ready" | "draft"` (contract-first;
  default `ready` preserves today's behavior) — both PR-opening paths (task output
  `task-output.service.ts:183`, pipeline `openPrOutput`) honor it via
  `gh pr create --draft`, and the project settings UI exposes it. `pr.merge` stays a
  locked `deny`.
- **F0c — One proposal inbox.** Collapse agent-factory / gaps proposal flows onto a
  single generic proposals store + approvals surface; the detectors become producers
  into it.
- **F0d — Law-3 text amendment.** North Star I's Law 3 names PR-opening as the
  sanctioned autonomous push (closes the long-open tension).

**Tests:** pipeline `pr` output opens a PR with no approval record; a `draft` project
opens a draft PR from both runner paths; merge attempt via any API path still denied;
proposals from both detectors land in the one inbox.

**Output:** one PR posture (with per-project draft choice), no orphan modules.

---

## F1 — Ownership Is Data

**Why:** the federation's first law — "ownership is explicit" — is currently false
for agents, channels, and monitors, and the roster is a render-time illusion
(`phase-124` doc: `Agent` has no `subsystem` field).

**Build (contract-first):**

- Add `ownerSubsystem: SubsystemIdSchema` to **Agent**, **Integration** (channel
  ownership → puls/herald split by stream kind), and monitor registration; it already
  exists on Pipeline/Chain/GateRule.
- Seed the canonical mapping (delivery pipelines+agents → forge; channel
  integrations → puls; research pipelines/chains → scout; reply-capable channel
  config → herald). A migration backfills existing entities; unowned → validation
  error at write time, report-listed at read time.
- `SubsystemsService` aggregates from stored tags only; delete the derived-crew
  computation; `RosterTab` renders the real roster and becomes navigable.
- **Seat the new chairs (operator 2026-07-17):** the registry grows by charter to
  10 ids — **codex** (memory: vault, grounding, distillation, shelves) and **ledger**
  (budget caps, usage windows, token spend, limit-resume governance) join the eight.
  Memory/budget machinery gets owner-tagged accordingly. (**hearth** — the personal
  domain — is seated later, in F8.) Registry remains closed to ad-hoc growth.

**Tests:** creating an agent without an owner fails 422; roster equals stored tags;
subsystem detail counts match a seeded fixture.

**Output:** every dispatchable unit has exactly one owner, stored on disk.

---

## F2 — Two-Stage Dispatch: Switchboard → Subsystem Brain

**Why:** the heart of the operator's federation vision — subsystems that decide.
Today ambient tasks never reach subsystem logic at all.

**Build:**

- **Stage 1 (switchboard):** the global classifier may now emit
  `{kind:"subsystem"}` for undirected tasks — remove the `isCoherent` guard
  (`task-classifier.service.ts:305-311`); its catalog gains all seated mandates as
  routing candidates.
- **Stage 2 (subsystem dispatcher):** extend `classifyWithinSubsystem`
  (`task-classifier.service.ts:89-104`) with a **per-subsystem routing prompt**
  composed from the subsystem's mandate + its owned catalog (agents now included via
  F1, not just pipelines), and a per-subsystem fallback policy (default: its primary
  pipeline; forge falls back to the orchestrator).
- Explicit operator target remains a hard override at any level (unchanged law).
- Dispatch records both verdicts (`switchboard → subsystem → unit`) in the task's
  classification trace; activity entries carry the owning subsystem.
- Global orchestrator remains the terminal safety net for stage-1 misses.

**Tests:** an undirected "oprav bug v CI" task routes puls→investigation or
forge→delivery per fixture; explicit `@forge` skips stage 1 (assert classifier not
invoked); empty-roster subsystem verdict falls through to orchestrator, never no-op.

**Output:** subsystems route their own work; the Velín map shows real dispatch flow.

---

## F3 — Subsystem Policy & Accountability

**Why:** charter duties 3 and 5 — a domain owner needs its own autonomy posture and
must be answerable.

**Build:**

- Per-subsystem **tier defaults + gate-rule sets** (rules already carry
  `ownerSubsystem`; add subsystem-scoped defaults resolved between the global floor
  and project rules — harden-only, `validateHardenOnly` extended).
- **Briefing per subsystem:** the briefing's sections gain a per-subsystem grouping
  ("Forge: 2 PRs čekají · Puls: CI zelené · Herald: 3 odpovědi odeslány · Ledger:
  62 % týdenního okna"); Beacon owns the "needs you" section shape, Ledger owns the
  budget/limits lines.
- Approvals queue filterable/groupable by owning subsystem; activity log entries
  subsystem-tagged (extend `ActivityLogService` entry schema additively).
- Chat `get_status` MCP tool answers per subsystem ("co dělá Forge?" → from record).

**Tests:** a subsystem rule weaker than the floor is rejected; briefing fixture
renders per-subsystem lines; approval list filters by subsystem.

**Output:** each orb is accountable from the record, with its own posture.

---

## F4 — Memory Shelves & Retrieval That Scales

**Why:** charter duty 4, plus the audit's memory gaps (naive retrieval, unseeded
fresh install, manual self-knowledge).

**Build:**

- **Subsystem MOCs:** one shelf per subsystem in the vault; `RunRecorderService` and
  `MemoryDistillerService` tag and file by owning subsystem; `GroundingService`
  loads the owning subsystem's MOC alongside North Star + project note.
- **Retrieval upgrade — still index-first, still no vectors:** frontmatter
  tag/alias matching and 1-hop wikilink-graph expansion from matched MOC entries
  (`vault.service.ts` `graph()` already parses links), scored above raw substring.
- **Seed the vault:** commit starter `north-star.md` + root MOC + one MOC per seated
  subsystem so a fresh install grounds on something (fixes the silent
  fail-open-to-nothing gap). The shelves live under Codex's ownership.
- **Self-knowledge on schedule:** the existing generator
  (`self-knowledge.service.ts`) becomes a nightly automation next to
  `memory-distill`, drift surfaced in the briefing.

**Tests:** a run owned by scout files onto scout's shelf; grounding for a forge run
includes forge's MOC; link-expansion retrieval beats substring on a fixture query;
fresh-install e2e grounds non-empty.

**Output:** memory compounds per domain and retrieval survives vault growth.

---

## F5 — The Empty Chairs: Sentinel · Maestro · Loom v1

**Why:** three of eight mandates have zero backend — the map writes checks the system
can't cash. Each v1 is deliberately one bounded automation + existing machinery.

**Build:**

- **Sentinel v1 — dependency & secret watch.** Scheduled automation runs `pnpm audit`
  (or osv-scanner) per project repo + a secret-pattern scan over outbound artifacts;
  findings triage into proposals (F0's single inbox) and, for critical CVEs, a gated
  fix task dispatched to forge. Owner tags per F1.
- **Maestro v1 — the merge queue.** Read-side release view over open ZIBBY PRs per
  project (`gh` via existing integration): mergeability, CI state (reuse
  `GET /api/monitors/status`), draft changelog from merged-since-last-tag. Surfaces
  in briefing + `/chat` map. **No merge capability — display and preparation only.**
- **Loom v1 — scheduled quality audit.** Nightly automation runs the tooling already
  in-repo (graphify god-node report, madge cycles, knip) against ZIBBY itself (and
  later per-project repos), diffs against last run, files new findings as proposals
  to forge. This is NC institutionalized as a subsystem duty.

**Tests (per chair):** fixture scan produces a proposal; critical finding produces a
gated task; green/no-delta run is a silent no-op (Tier-1, logged).

**Output:** every seated orb has at least one real, recurring duty.

---

## F6 — Herald Grows Up + Live Trust Harness

**Why:** "ZIBBY handles the communication" is the least-proven half of the mission —
correct plumbing, zero live evidence, and email is (rightly) notify-only until
evidence exists.

**Build:**

- **Reply ledger:** every drafted reply records draft → operator decision
  (approved-unedited / edited / rejected) — feeding the existing pattern extractor.
- **Evidence-based graduation:** a per-project, per-channel autonomy proposal
  ("Slack replies: 12/12 approved unedited → propose Tier-2 auto-send") generated
  from the ledger, decided as a Tier-3 approval. Email graduation additionally
  requires explicit operator opt-in per North Star I's law.
- **Live soak harness:** an opt-in, credentialed live test lane (real sandbox Slack
  workspace, dedicated Gmail, sandbox GCal) exercising poll → triage → gated reply
  end-to-end; never in CI; results filed to the vault.
- **Watcher health:** `subsystem-health.service.ts` gains probes for the channel
  watcher, monitor watcher, and triage router (last-tick age, fallback-mode flag);
  degraded state surfaces in briefing + Puls orb state.
- Per-subsystem triage confidence threshold (replacing the global 0.5) as Herald
  policy under F3.

**Tests:** ledger accumulates from approval flow; graduation proposal fires at the
fixture threshold; a stale watcher tick flips health + orb state.

**Output:** autonomy widens only where the record proves it safe.

---

## F7 — Second Monitor + Merge-Queue Polish

**Why:** proves the monitor seam is real (the audit confirmed one enum value), and
finishes the operator's "review & merge" verb end-to-end.

**Build:**

- **Sentry `MonitorAdapter`** — drop-in per the documented seam (`monitor-adapter.ts`,
  `wants()` opt-in); new `MonitorEventKindSchema` value; alerts ride the existing
  triage → tier path to beacon/forge. Zero watcher changes expected — that's the test
  of the seam.
- **Merge-queue actions:** from Maestro's queue, one-click _open in GitHub_; a merged
  or closed PR feeds back into the ledger/pattern extractor (post-merge learning);
  briefing celebrates merged work per project.
- Post-merge deploy watch: if the project has CI deploy workflows, Maestro reads
  their status via the existing monitor.

**Tests:** Sentry fixture alert → monitor event → triaged task with correct owner;
second adapter registers with zero runtime change (already the seam's law); merged-PR
webhook/poll updates the queue and ledger.

**Output:** ZIBBY watches errors like it watches CI; the merge loop closes cleanly.

---

## F8 — Personal Domain: Second Brain, Whole Life

**Why:** North Star has always said "professional and personal alike"; the audit found
zero personal surface anywhere.

**Build:**

- **Seat Hearth** — the personal-domain chair (registry 10 → 11), owning everything
  below.
- **Personal vault area** (`personal/` + personal MOCs) with the same grounding
  isolation used between projects (`visibleToProject` generalized to domains).
- **Quick capture from chat:** a `capture_note` MCP chat tool filing to the personal
  inbox note; nightly distiller triages it like the existing "halda" flow.
- **Calendar-aware daily note:** Puls's calendar reads compose into a daily personal
  note (agenda + captures + yesterday's outcomes).
- Personal tasks route through the same task/dispatch machinery (scout/herald as
  owners) with a `domain: personal` attribution — never mixed into project grounding.

**Tests:** personal note never appears in a project-scoped grounding block; capture
tool files and distills; daily note composes from fixture calendar.

**Output:** one vault, two lives, zero re-explaining.

---

## FC — Simplification, Architecture & Bug Sweep _(continuous — carries NC)_

Standing lens on every phase, plus named debts from the audit:

- Split the overgrown `projects/` module (vault/secrets/PR/standup/matcher are five
  responsibilities).
- Durable `budgetApproved` overage releases (in-memory Set loses operator approvals
  across restarts — fails safe but re-prompts).
- Thread task attachments into pipeline-target dispatch (documented deferred gap,
  `task-scheduler.service.ts:1115`).
- Generalize `resolveGrantId`'s single-MCP-server assumption
  (`claude-run-command.service.ts:365`).
- Keep `graphify update .` current; madge cycle guard stays green; every cleanup is a
  bounded, tested phase — never a big-bang.

---

## Recommended Order

1. **F0 — Land the fleet** (merge debt is the riskiest thing in the repo today)
2. **F1 — Ownership is data** (one contract change unlocks the whole federation)
3. **F2 — Two-stage dispatch** (the vision's heart: subsystems that decide)
4. **F3 — Policy & accountability** (the orbs become answerable)
5. **F4 — Memory shelves + retrieval** (compounding per domain)
6. **F5 — Empty chairs v1** (all eight orbs earn their place)
7. **F6 — Herald + live trust** (communication autonomy, evidence-first)
8. **F7 — Sentry + merge queue** (seam proven, merge loop closed)
9. **F8 — Personal domain** (the second life)

- **FC — continuous** throughout.

---

## Non-Negotiables (inherited + one new)

All North Star I DNA holds: files as truth · contract-first · approval-first floor ·
`pr.merge` locked deny · index-first memory, no vectors · SSE for streams · explicit
target overrides the classifier · one interaction grammar · harden-only per-project
rules · single operator.

**New — the Federation Law: ownership is explicit.** Every dispatchable unit belongs
to exactly one subsystem; every subsystem can account for everything it owns. No
orphan agents, no derived rosters, no unowned heartbeats.
