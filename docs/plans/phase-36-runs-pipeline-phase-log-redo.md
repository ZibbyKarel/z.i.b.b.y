# Phase 36 — Redo the /runs pipeline phase-log to match the design ("Tasky")

> TODO (line 61): _"stránka běhy a aktivita hlavně pak log fází běhu pipeline nevypadá
> jako v designu (stránka 'Tasky' v designu). Pořádně to předělej podle designu."_

Feedback on Phase 29: the /runs ("Běhy & aktivita") page — and ESPECIALLY the pipeline
phase/stage log — still doesn't match the design. Redo it properly against the design's
"Tasky" page.

## The design source (found)

The "Tasky" design is `design/Z.I.B.B.Y/zibby/task-detail.jsx` (421 lines) + `tasks.jsx`
+ `tasks-data.jsx` (data shape). The pipeline phase-log is the **`PipelineTimeline`**
component in `task-detail.jsx` (~lines 62-160), rendered under a HudPanel titled
"fáze pipeline" (`task-detail.jsx:383-386`). READ that file. Its concrete design — a
**vertical** stage timeline:
- A vertical connector line down the left, colored by status (done = `Z.ok` tint, else
  `Z.line`) joining consecutive stages.
- Per stage: an **Avatar** of the stage's agent (size ~22, radius 2, `accent` = the
  stage's status color, with a 1px ring `boxShadow` while `running`) + agent name +
  status; on the right, **elapsed** time (mono, faint) and **cost** `$X.XX` (mono) when
  present, and an expand chevron when the stage has a log.
- Stage **output** line shown in green (`Z.ok`) mono when present.
- A **waiting** indicator for a stage awaiting approval.
- A **RetryBlock** (`task-detail.jsx:34-58`) for a stage's rework loop: rows of
  "pokus N/maxRetries", and when retries are exhausted → "vyčerpány pokusy → eskalace →
  zaparkováno k ranní review".
- An **expandable per-stage log** (`LogStream`) shown when the row is toggled open
  (running stage streams at ~60%, done at 100%).
- Also note the header meta includes `['fáze', 'N / M hotovo', …]` (done/total count),
  and a "Phase chain preview" (vstup→výstup file hand-off between phases,
  `task-detail.jsx:208-215`).

Tokens already match (Phase 29 confirmed) — this is a component-level fidelity redo of the
PHASE LOG to this vertical-timeline design. Cross-check `screenshots/v-runs.png` for the
surrounding page. (`*-v-pipeline-multi.png`/`pipeline-graph-editor.png` are the pipeline
EDITOR — NOT the phase log; ignore for this.)

## Current implementation (Phase 29 state)

- `apps/web/features/runs/components/PipelineStageTimeline.tsx` — one row per stage
  (phase · attempt · verdict Tag · RunStateBadge · a per-stage `StatusDot` that pulses only
  on the live stage · expandable per-stage log via `StageLog`/`LiveStageLog`/
  `TerminalStageLog`). This is the primary thing to redo to match the design.
- `apps/web/features/runs/components/RunDetail.tsx` (header + meta strip — Phase 29 aligned;
  adjust only if the design's task header for a pipeline run differs).
- `apps/web/features/runs/Screen.tsx`, `RunLogStream.tsx`, `RunStateBadge.tsx` — reuse the
  Phase 29 shared run-state → tone map (`run.ts` `runStateTone`).

## Approach

1. Read the design sources above; write down the concrete phase-log spec (row anatomy,
   tags, verdict, hand-off, rework edge, timing, live-only glow).
2. Redo `PipelineStageTimeline.tsx` (and its `StageLog` sub-parts) to match — the phase
   rows, the model/thinking tags per phase, the verdict + state, the vstup→výstup file
   hand-off between phases, the rework-loop indicator, and the expandable per-phase log.
   Keep it token-driven, glow/pulse only on the live phase, matte otherwise.
3. Only touch the rest of the runs page where the design clearly diverges from Phase 29.
4. Keep the shared state map single-sourced (don't fork run-state tones).

## Files (expected)
- `apps/web/features/runs/components/PipelineStageTimeline.tsx` (primary redo)
- its `StageLog`/`LiveStageLog`/`TerminalStageLog` helpers
- possibly `RunDetail.tsx` / `Screen.tsx` if the design's pipeline-run header/layout differs
- i18n for any label wording that must match the design (cs default + en)
- tests: update `PipelineStageTimeline`/`RunDetail` assertions that encode old structure
  intentionally (not to paper over regressions)

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/runs` — never bare
  `pnpm lint`), `pnpm test` green modulo known pre-existing failures (confirm via
  `git stash`; the 2 machine.service.ts errors are operator WIP).
- Run the app, open a PIPELINE run on `/runs`, screenshot its phase log, and compare
  against the design source — the phase rows + per-phase log must match; only the live
  phase glows. (Don't get stuck on dev-server flakiness.)

## Constraints
- No forwardRef, no `any`, export props, no inline DOM `style` (DS primitives/props; a
  dynamic progress width goes through a DS style passthrough as the codebase already does).
  Don't touch the operator's WIP (machine.*, SummaryWidget, design/*).
