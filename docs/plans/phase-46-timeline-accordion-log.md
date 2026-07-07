# Phase 46 — PipelineStageTimeline: drop the "log" button, whole-row Accordion toggles the phase log

> TODO (line 73): _"v souboru PipelineStageTimeline odstraníme tlačítko 'log' které
> zobrazuje log fáze a funkcionalitu nahradíme komponentou Accordion kde bude stačit
> kliknout na celý řádek fáze aby se log zobrazil/schoval."_

## Current state (recon done)

`apps/web/features/runs/components/PipelineStageTimeline.tsx`:
- Custom vertical timeline: left rail column (`StatusDot` + `Connector`) beside a content
  column per phase node. The content column header (≈ lines 410–458) holds the agent
  IconTile+name on the left and, on the right, cost / verdict Tag / `RunStateBadge` and a
  ghost **`Button icon="code"` labeled `t("goalOpenLog")`** (lines 447–456) that toggles the log.
- Single-open state: `openLog: string|null` + `setOpenLog` (line 322), `openKey = openLog ?? liveKey`
  (line 329) — the live phase opens by default; `isOpen = hasLog && openKey === key` (line 379).
- The log body renders below the header when `isOpen` via `<StageLog .../>` (lines 484–490);
  `StageLog` mounts the live/terminal log ONLY while open (cost control — keep this).
- `key = node.main ? \`${phaseId}#${attempt}\` : phaseId`.

The DS already has an Accordion: `libs/design-system/src/components/Accordion/Accordion.tsx`
— `Accordion` (context, `single` mode), `AccordionItem({summary, children, defaultExpanded})`,
`AccordionSummary` (renders a clickable summary row + `AccordionTestId.Chevron`),
`AccordionDetails` (renders `children` only when expanded). `AccordionTestId` = Root/Summary/Chevron/Details.

## Goal

Remove the separate "log" Button. Make the **entire phase row header clickable** to
show/hide that phase's log, with a chevron affordance — i.e. the accordion interaction.
Keep single-open behavior, the live-phase-opens-by-default, and mount-log-only-when-open.

## Approach

Evaluate DS `Accordion`/`AccordionItem` fit first, then pick the lower-risk of:

**(A) Use DS `AccordionItem` per phase** — wrap the content column so the header becomes the
`summary` and `StageLog` the `children`. PROBLEM to check: `AccordionItem` is uncontrolled
(local `useState`) unless inside a `single` `Accordion` keyed by `useId` — it can't express the
existing "live phase open by default, single-open across rows, collapsing falls back to live"
state machine, and `AccordionSummary`/`AccordionDetails` bring their own padding/chevron chrome
(`px-3.5 py-3`) that will fight the timeline rail. If that chrome/omission of controlled-open
can't be reconciled cleanly, do NOT force it.

**(B) (preferred if A clashes) Replicate the accordion INTERACTION with the existing state.**
Keep `openLog`/`openKey`/single-open. Replace the header's right-side `Button` with:
- Make the header row a real toggle: wrap the header `Stack` in a DS control that is a labeled
  button (Law 4 — nothing interactive unlabeled: `aria-label` like `t("togglePhaseLog")` /
  reuse `toggleToolOutput`), `aria-expanded={isOpen}`, `aria-controls` the log's id, calls
  `setOpenLog(isOpen ? "" : key)`. Must have a visible **focus-visible ring** (DS pattern) and a
  pointer cursor only when `hasLog`.
- Add a **chevron** `Icon name="chevron"` on the right (where the old button was), rotated when
  open (`rotate-90`, `transition-transform` — mirror DropDownButton's chevron), tone muted. For a
  placeholder/`!hasLog` row, render no chevron and no toggle (nothing to open).
- Keep cost / verdict Tag / `RunStateBadge` visible in the header (they move to sit left of the
  chevron). Ensure clicking the badges still toggles (they're inside the toggle) — that's fine.
- Keep `<StageLog>` rendering below on `isOpen` exactly as now (mounted only when open).

Whichever path: the "log" text Button and its `goalOpenLog` usage here are removed. Do NOT break
the left rail (StatusDot/Connector) or the RetryBlock/produced rows. Don't turn the whole node
(including the rail) into a button — only the content-column header toggles.

## Files
- `apps/web/features/runs/components/PipelineStageTimeline.tsx` (remove log Button; row-header toggle + chevron)
- `apps/web/features/runs/components/PipelineStageTimeline.test.tsx` (update: clicking the phase-row
  header toggles the log; no standalone "log" button; chevron reflects state; keyboard focus/Enter toggles)
- i18n `apps/web/i18n/messages/{cs,en}.json` — add a toggle aria-label key if a suitable one
  (`toggleToolOutput`) doesn't already fit; remove `goalOpenLog` ONLY if nothing else uses it (grep first — goal timeline may share it; if shared, leave the key, just stop using it here).
- possibly reuse `PipelineStageTimelineTestId` — add a `RowToggle` testid if needed for the test.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/runs/components/PipelineStageTimeline.tsx` (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run apps/web/features/runs/components/PipelineStageTimeline` green
  (confirm any pre-existing runs failures via `git stash` — don't chase unrelated reds).
- Manual: on a pipeline run detail, clicking a phase row opens/closes its log; chevron rotates;
  the live phase is open by default; only one log open at a time; keyboard: Tab to the row, Enter toggles.

## Constraints
- No forwardRef, no `any`, no raw inline DOM `style` beyond the existing `style` passthroughs on DS
  components (the file already routes dynamic connector/rail styling through DS `Container style` — a
  chevron rotation is a className, not inline style). Keep StageLog mounted only when open (cost).
- Reuse `runStateTone`/existing meta; glow/pulse only when live (unchanged). Don't touch operator WIP
  (SummaryWidget, `apps/api/src/machine/*`, `libs/contracts/src/machine/*`, `design/*`, `apps/web/features/chat/**`).
