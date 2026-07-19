# Agent Factory (M-style self-modification: propose missing specialists)

**Phase 4.** ZIBBY notices when a recurring task keeps falling through to the
orchestrator (no dedicated agent confidently matched it), drafts a
deterministic candidate specialist agent, and parks it behind the existing
Tier-3 approval gate. _Detects ≠ activates_ — nothing here dispatches or
widens capability on its own; only an approved decision makes a candidate
dispatchable. Sibling to `docs/api/gaps.md` (recurring manual tasks →
automation suggestions) and `docs/api/patterns.md` (approval history → gate-rule
proposals) — same template (`GapDetectorService`/`ProposedTaskFlowService`)
applied to the classifier's escape hatch instead.

## Pieces

| Piece     | File                                                        | Role                                                                           |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Detector  | `apps/api/src/agent-factory/agent-factory.service.ts`       | `AgentFactoryService.detect()` — scans telemetry, groups, proposes             |
| Generator | `apps/api/src/agent-factory/candidate-generator.ts`         | pure: `generateCandidateAgent`, `candidateAgentId`, `isCoveredByExistingAgent` |
| Flow      | `apps/api/src/agent-factory/agent-proposal-flow.service.ts` | `AgentProposalFlowService` — writes candidate, gates it, resumes/cancels       |
| Module    | `apps/api/src/agent-factory/agent-factory.module.ts`        | imports Agents/Approvals/Gates; exported to `AutomationsModule`                |

## Where the input comes from: `orchestrator-fallback` telemetry

Recorded by `apps/api/src/tasks/task-scheduler.service.ts` (around
`kind: "orchestrator-fallback"`): whenever the task classifier can't
confidently match a specific agent/pipeline for an **implicit** dispatch (no
explicit `@-mentioned` target — an explicit target is a deliberate operator
choice and never counts toward the tally), it records an activity entry
carrying `refs: { normalizedSummary, terms }` — the normalized task summary
and the classifier's matched terms, comma-joined.

## Detection flow (`AgentFactoryService.detect`)

1. Read the past **30 days** (`WINDOW_DAYS`) of activity, keep only
   `orchestrator-fallback` entries.
2. Group by `refs.normalizedSummary`, tallying occurrence count, up to 5
   sample raw summaries per group, and term frequency.
3. Keep groups with **≥ 3 occurrences** (`MIN_OCCURRENCES`), sorted by count
   descending, capped at **10** (`MAX_CANDIDATES`) — bounds a runaway approval
   queue.
4. For each qualifying group, skip it if:
   - it's already covered by an existing agent's name/description/category
     (`isCoveredByExistingAgent` — substring containment on the group's
     dominant terms, checked against **every** existing agent, proposed or
     active, so a drafted-but-not-yet-approved candidate blocks a duplicate);
   - its deterministic candidate id already exists as an agent;
   - a candidate with that id already has a **pending** `agent-proposal` approval.
5. Otherwise generate the candidate (`generateCandidateAgent`) and call
   `AgentProposalFlowService.propose(candidate)`.

Deterministic — **no LLM call**, fully unit-testable.

## Candidate generation (`candidate-generator.ts`)

- **Id**: `auto-<slug>`, slugified from up to 4 dominant terms (or the
  normalized summary if there are none) — `auto-` prefixed so a
  machine-generated candidate never collides with a hand-authored agent's id
  namespace.
- **Tools**: `["read"]` only — least-privilege by construction; the operator
  widens it explicitly on activation.
- **Category/status**: `"Proposed"` / `"proposed"` — keeps it out of every
  dispatchable catalog until approved (enforced by `AgentsStorageService.listActive`,
  and by `ClaudeRunCommandService.buildCatalog`'s use of `listActive()` when
  assembling the `--agents` delegation catalog).
- **Instructions**: a templated body naming the recurrence count and folding
  in up to 5 sample task summaries the pattern was drafted from.

## The `agent-proposal` approval flow

`AgentProposalFlowService` registers itself as the `agent-proposal` runner
(`ApprovalsService.register`) and implements `ResumableRunner`:

1. **`propose(candidate)`** — writes the candidate agent file
   (`status: "proposed"`), then evaluates the floor-gated action
   `agent.propose_new` through `GateEvaluatorService`:
   - `deny` → the candidate file is deleted immediately, nothing is parked.
   - anything other than `ask` (should the floor's own guarantee ever weaken)
     → logs a warning and parks anyway — Tier 3 is a floor commitment, never a
     soft default.
   - otherwise (the expected path) → `ApprovalsService.requestApproval` parks
     a Tier-3 `agent-proposal` approval, `risk: "medium"`, with a
     `FrontmatterPreview`-shaped `detail` (a diff-style preview of the
     candidate's frontmatter for the approval card).
2. **`resume(agentId)`** (approve) — flips the candidate's `status` to
   `"active"`. Visible immediately — no restart needed, since agents are
   read-through storage.
3. **`cancel(agentId)`** (reject) — deletes the candidate file; the approval
   record itself remains as the durable trace of the decision.

## Scheduling

Dispatched by the `agent-factory` system automation target
(`apps/api/src/automations/scheduler.service.ts`, case `"agent-factory"`):
calls `agentFactory.detect()`, records `agent-proposals:<count>` as the
automation's ref. Deterministic — no `claude` run, same posture as
`gap-detect`/`pattern-extract`.

## Wired into the rest of the system

- **`tasks`** — the source of `orchestrator-fallback` telemetry
  (`task-scheduler.service.ts`).
- **`automations`** — the nightly (or configured-cadence) trigger.
- **`approvals`** — the Tier-3 gate every candidate parks behind; approve/reject
  routes through `ResumableRunner.resume`/`cancel`.
- **`gates`** — the locked floor rule for `agent.propose_new` (guarantees `ask`).
- **`agents`** — the storage service candidates are written to/read from
  (`status: "proposed"` vs `"active"`); `runner`'s `ClaudeRunCommandService`
  reads only `listActive()` when building a run's delegation catalog, so a
  pending proposal is never delegatable.

## Gotchas

- A candidate agent is a REAL entry in the agents store the instant it's
  proposed (not a separate staging area) — `status: "proposed"` is the only
  thing keeping it out of dispatch. A direct write to the agents store
  bypassing this flow could accidentally activate a candidate.
- The 30-day window and thresholds (`MIN_OCCURRENCES = 3`, `MAX_CANDIDATES = 10`)
  are module-level constants, not configurable — tune by changing the source.
- Deleting a rejected candidate (`cancel`) only removes the agent file; the
  `Approval` record (and the fact that pattern was proposed and rejected once)
  persists, so `pendingProposalIds` correctly won't re-detect it as pending,
  but nothing stops the SAME pattern (same `normalizedSummary`) from being
  re-grouped and re-proposed with a fresh candidate id on a later run, since
  the group key isn't itself remembered as "previously rejected".
