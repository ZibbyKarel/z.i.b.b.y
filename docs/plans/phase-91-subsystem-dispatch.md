# Phase 91 — Dispatch to a subsystem: @-mention + recursive scoped routing

> Design doc "Pipelines & chains inside subsystems": routing an incoming task to the right
> pipeline WITHIN a subsystem reuses the existing `TaskClassifier` pattern recursively — the
> same mechanism, scoped to one subsystem's pipelines. One pipeline → direct dispatch, nothing
> to classify. Naming a subsystem is, like naming any unit, a HARD OVERRIDE (explicit target
> skips the top-level classifier — DNA rule).

## Scope guard

RECON: today `TaskClassifierService.classify()` routes agent|pipeline|orchestrator over a
candidate catalog; nothing "recursive" exists. This phase adds subsystem as an EXPLICIT
target only — the top-level classifier does NOT learn to emit subsystem targets (that would
change routing behavior for undirected tasks; out of scope, note as future work).

## 1 — API — explicit subsystem target

Where explicit targets resolve (the task-create path that honors named pipeline/agent
overrides — locate in `apps/api/src/tasks/`):

- Accept a subsystem target (`{ kind: "subsystem", id: SubsystemId }` in the task routing
  contract types — extend the routing schema additively).
- Resolution: owned pipelines (phase-81 tag) →
  - **0 owned** → reject at validation with a clear Czech message ("subsystém zatím nemá
    žádnou pipeline") — a described task must never silently no-op; surfacing the empty roster
    beats guessing. (Deliberate v1 floor: not routing to the orchestrator, because a mandate
    without capability shouldn't pretend to execute. Note in report.)
  - **1 owned** → direct dispatch to that pipeline (no classifier).
  - **>1 owned** → run `TaskClassifierService` with the candidate catalog RESTRICTED to the
    owned pipelines (reuse the existing candidate-catalog construction with a filter — do not
    fork the classifier; lowest-confidence fallback inside the subsystem is the subsystem's
    first pipeline by registry/file order, never the global orchestrator — the operator named
    the subsystem, the task must land inside it).
- The run record keeps the standard shape (it IS a pipeline run) + the routing note in the
  existing routing/attribution metadata so briefings can say "via Herald".

## 2 — Web — @-mention target

CommandLine @-mentions already list agents/pipelines (phase-59 inline @Name). Add subsystems
to the mention catalog (icon = colored dot, name = mythic name) — ONLY those with ≥1 owned
pipeline (mentioning a capability-less subsystem would only ever error; keep them out of the
picker until they earn a roster; revisit with the 0-owned decision above).
Selecting one sets the explicit target exactly like naming a pipeline does today.

## Tests

- API: 1-pipeline subsystem → direct dispatch (classifier NOT called — assert); 3-pipeline
  fixture → classifier called with restricted catalog only; 0-pipeline → validation error;
  low-confidence → first owned pipeline, never orchestrator.
- Explicit-override: subsystem target never enters the top-level classifier.
- Web: mention catalog contains only roster-bearing subsystems; selection produces the
  subsystem target in the create payload.

## Verification (paste real output)

- `npx tsc -p` contracts, api, web — clean; `npx eslint <touched>` — clean.
- `npx vitest run libs/contracts apps/api/src/tasks apps/web/features/commandline apps/web/features/subsystems` — green (adjust paths to the real CommandLine feature dir).

## Constraints

- Top-level classifier output space unchanged (no subsystem targets from classification).
- Hard-override DNA: an explicit subsystem name must never fall through to global routing.
