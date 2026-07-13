BATCH: web-runs-components

[SEVERITY: Critical] [FILE: apps/web/features/runs/components/RunDetail.tsx:411-420] [CATEGORY: DS violation]
`RunInputSection` renders a raw `<a>` with a hand-written Tailwind `className` (`"inline-block w-fit rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"`) wrapping `FilePreview` — direct violation of "apps/web never writes its own Tailwind classes"; no DS passthrough or eslint-disable is used, unlike the sanctioned `style` passthrough pattern.
Add an `onOpen`/`href` prop to the DS `FilePreview` primitive instead of hand-rolling a styled anchor in the app.

[SEVERITY: High] [FILE: apps/web/features/runs/components/RunDetail.tsx:1-858] [CATEGORY: file size / component boundary]
Single file is 858 lines and owns 8 separate concerns as top-level function components (`LimitPausedPanel`, `MetaCell`, `AssignProjectControl`, `PrOutputCard`, `RunOutputPanel`, `RunInputSection`, plus the `RunDetail` header/meta-strip/action logic) plus two free-floating util functions (`firstUrl`, `attachmentOpenHref`).
Split into `RunDetailHeader.tsx`, `RunOutputPanel.tsx`, `RunInputSection.tsx`, `LimitPausedPanel.tsx`, and a `run-output.ts`/`run-links.ts` util module; keep `RunDetail.tsx` as the thin orchestrator.

[SEVERITY: High] [FILE: apps/web/features/runs/components/PipelineStageTimeline.tsx:1-522] [CATEGORY: file size / component boundary]
522-line file mixes a pure data-transform (`buildPhaseNodes`, ~55 lines), three log-fetching components (`StageLog`, `LiveStageLog`, `TerminalStageLog`), `RetryBlock`, and the main timeline — whose per-node row header is itself a ~75-line inline IIFE built inside JSX (lines 403-478).
Extract `buildPhaseNodes` to `pipeline-stage-nodes.ts`, move `StageLog`/`RetryBlock` to their own files, and pull the inline IIFE header into a named `PhaseRowHeader` subcomponent.

[SEVERITY: High] [FILE: apps/web/features/runs/components/RunParkedPanel.tsx:38-65 ; apps/web/features/runs/components/GoalDetailPanel.tsx:274-294] [CATEGORY: duplication]
The "resume with note" form (TextAreaField + note state + end-aligned Button calling `resume.mutate({ params: { runId }, body: { note: note.trim() || undefined } })`) is duplicated near-verbatim across two components, differing only in which mutation hook is used.
Extract a shared `ResumeWithNoteForm` component parameterized by the mutation hook/runId.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/RunDetail.tsx:184-191] [CATEGORY: business logic in component]
`firstUrl` (regex URL extraction) and `attachmentOpenHref` (API URL construction) are pure utility functions defined inline in the component file rather than alongside the project's existing `utils/cost.ts` / `utils/time.ts` helpers.
Move both to a `utils/` module (e.g. `utils/url.ts`) with their own unit tests.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/GoalDetailPanel.tsx:57-69] [CATEGORY: business logic in component]
The daily/weekly budget-window calculation (`within`, `budget`, `budgetPct`) is nontrivial date-filtering logic embedded directly in the render body, mirroring backend budget-guard logic but untested in isolation.
Extract to a pure `computeGoalBudgetUsage(iterations, goal, now)` util and unit-test it directly.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/GoalDetailPanel.tsx:112-253] [CATEGORY: component size]
The iteration-timeline `.map()` body is ~140 lines of nested JSX (row header, verifier status, expandable maker/verifier logs) inlined in the parent render — file sits at exactly 300 lines already.
Extract a `GoalIterationRow` subcomponent taking the iteration + open/close state as props.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/ChainStepsPanel.tsx:21-26] [CATEGORY: duplicate pattern]
`stepTone(status)` is an ad-hoc, locally-defined status→tone map ("done"→ok, "failed"→bad, "running"→run) that parallels the canonical `RUN_STATE`/`runStateTone` map already defined in `run.ts` and used everywhere else in this feature.
Fold chain-step statuses into the shared `RUN_STATE` map (or a documented subset of it) instead of a second parallel mapping.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/PipelineStageTimeline.tsx:358-360] [CATEGORY: missing/weak typing]
`(agent?.glyph as IconName | undefined)` casts a free-form `z.string().optional()` contract field (`agent.schema.ts:48`) straight to the closed `IconName` union with no validation — an unrecognized glyph string passes typecheck but can render an invalid icon at runtime.
Validate/narrow via a lookup table or a runtime guard (`isIconName`) before casting, falling back to the existing `bot`/`check` default on a miss.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/RunLogStream.tsx:1-99 vs PipelineStageTimeline.tsx:143-218] [CATEGORY: inconsistent duplicate pattern]
Two different "tail a run's log" renderings coexist: `RunLogStream` (used by `RunDetail` and `GoalDetailPanel`) renders the raw text through a plain `CodeBlock`, while `PipelineStageTimeline`'s `StageLog`/`LiveStageLog`/`TerminalStageLog` parse the same kind of agent transcript through `RunTranscript` (markdown + foldable tool calls). If both are meant to show the same transcript shape, this is an unintentional divergence rather than a documented design choice.
Confirm whether top-level run logs should also render via `RunTranscript`; if the difference is intentional, document why in the component doc comment.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/RunApprovalGate.tsx:83-104] [CATEGORY: componentization opportunity]
The severity-tinted "consequence" callout (icon + label + body over a `color-mix`-derived background/border) is a bespoke, one-off `<div style={{...}}>` block with a properly-used `eslint-disable-next-line react/forbid-dom-props` — legitimate per the DS passthrough rule, but the same "tone-tinted callout" shape recurs conceptually across the runs/approvals surfaces.
Consider promoting this to a DS `Callout`/`InlineNotice` primitive so future consumers don't need their own `eslint-disable` + inline style block.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/RunDetail.tsx:216 ; 367] [CATEGORY: duplication]
`window.open(url, "_blank", "noopener,noreferrer")` is repeated ad hoc in two places within the same file (`PrOutputCard`, `RunOutputPanel`).
Factor into a tiny `openInNewTab(url)` helper.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/ParkedRunsPanel.tsx:20] [CATEGORY: business logic in component]
Client-side `runs.filter((r) => r.status === "parked")` filtering happens directly in the component instead of via a `select` on the query hook.
Add a `select` (or a dedicated `useParkedRunsQuery`) mirroring the `selectApiResponseBody` convention.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/RunParkedPanel.tsx:32-36] [CATEGORY: business logic in component]
Trailing-log-tail computation (split/filter/slice/join, `TAIL_LINES = 30`) is inline transform logic in the render body.
Extract to a small `tailLines(text, n)` util, reusable if other panels need the same trimming.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/ChainStepsPanel.tsx ; ParkedRunsPanel.tsx] [CATEGORY: test coverage]
Neither `ChainStepsPanel.tsx` (fetch + toggle + status-tone logic) nor `ParkedRunsPanel.tsx` (client-side filter) has a corresponding `.test.tsx`, unlike every sibling panel of comparable complexity in this batch.
Add unit tests covering the open/close toggle and the empty-state (`null` return) branches.

STATS: 22 files, 4471 total lines. Top 3 largest: RunDetail.tsx (858), RunDetail.test.tsx (609), PipelineStageTimeline.tsx (522).
