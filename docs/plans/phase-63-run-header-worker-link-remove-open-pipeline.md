# Phase 63 — Run header: worker name links to its detail; remove the "Otevřít pipeline" button

> TODO (line 13): _"Stránka Běhy a aktivita - Detail běhu - tlačítko »otevřít pipeline«
> odstraníme. Na detail přiřazeného agenta/pipeliny/… se pak uživatel bude moci dostat
> klikem na jméno workera uvedené v headeru běhu."_

## Two changes

### A — make the worker/owner name in the run header clickable → its detail page

`apps/web/features/runs/components/RunDetail.tsx`:
- **Agent runs:** `agentName` currently folds into the meta line (`{run.runId} · {kind} · agent {agentName}`,
  ~line 468–473). Make the `agentName` a clickable link to `/agents/${run.owner}` (an agent detail route
  exists). Keep the rest of the meta line plain.
- **Pipeline runs:** the owner MetaCell (`~line 548–552`, `value={run.owner}`, shown when
  `run.kind !== "agent"`) — make the pipeline name clickable to `/pipelines/${run.owner}`.
- Navigation via `useRouter().push` (next/navigation), matching how `agents/Screen.tsx`
  (`router.push(\`/agents/${id}\`)`) and `pipelines/Screen.tsx` (`/pipelines/${id}`) already navigate.
  RunDetail is a client component — add `useRouter` if not already imported.
- **Only agent and pipeline kinds get the link** — `goal`/`chain`/`orchestrator` owners have no detail
  route, so their name stays plain text (don't link to a 404). Gate on kind.
- Compose the clickable name from DS primitives — a DS `Pressable` (or Next `Link`) around the name, or a
  small `href`/`onClick` affordance on `MetaCell`. Do NOT use a raw `<a>`/`<div onClick>` with inline
  style; if `MetaCell` needs an optional `onClick`/`href` prop, add it minimally and keep its other
  usages working (MetaCell is local to RunDetail — grep to confirm). Keep it visually a subtle link
  (underline-on-hover / accent), not a heavy button. Keep the existing tone/label.
- Accessibility: the clickable name must be a real button/link (role + accessible name), keyboard
  focusable. Add a `data-testid` (e.g. reuse/extend the header) so the test can select it.

### B — remove the "Otevřít pipeline" button from the pipeline stage timeline

`apps/web/features/runs/components/PipelineStageTimeline.tsx` — **CAUTION: this file has uncommitted
operator WIP** (a `Panel`-wrapped "live log" around `StageLog`, and reordered imports). Touch ONLY the
`openPipeline` button and NOTHING else:
- Remove `openPipelineLink` (the `const openPipelineLink = owner ? (<Pressable … router.push(\`/pipelines/${owner}\`) …>{t("openPipeline")}</Pressable>) : null` around line ~341–363) and BOTH of its
  render sites (~line 363 and ~537).
- Remove now-unused imports/vars ONLY if they become genuinely unused AFTER the removal (e.g. `useRouter`
  may still be used elsewhere — check; `t("openPipeline")` usage goes away but keep the `openPipeline`
  i18n key in the catalogs, harmless). Do NOT reorder or restyle anything else — leave the operator's
  Panel/live-log WIP and import order exactly as they are.
- The `openPipeline` i18n key in `apps/web/i18n/messages/{cs,en}.json` can stay (unused keys are harmless)
  — do NOT churn the catalogs.

The pipeline is now reachable by clicking the pipeline name in the run header (change A) — so removing the
timeline button loses no capability.

## Tests
- `RunDetail.test.tsx`: the header worker name (agent name for agent runs; pipeline name for pipeline
  runs) is a link/button that navigates to `/agents/:id` / `/pipelines/:id` (assert the href or that a
  router push mock is called with the right path — check how the test already mocks `next/navigation`
  `useRouter`; RunDetail tests may already stub it). Keep the existing header assertions.
- `PipelineStageTimeline.test.tsx`: remove/adjust the assertion for the "Otevřít pipeline" button (it no
  longer renders). Keep the rest. If the operator's WIP already changed this test, reconcile minimally —
  only the openPipeline assertion.

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `npx eslint apps/web/features/runs` clean.
- `rtk proxy npx vitest run apps/web/features/runs` green modulo the KNOWN pre-existing reds (RunDetail
  cost-cell cs-locale; TaskCard ×2) — confirm via `git stash`, don't chase. NOTE: because
  PipelineStageTimeline has operator WIP, a `git stash` comparison there may be noisy — focus the
  pre-existing-red check on RunDetail/TaskCard.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` in apps/web.
- PipelineStageTimeline.tsx: SURGICAL — only the openPipeline button; preserve ALL operator WIP.
- Do NOT touch `.zibby/data/**`, `RunLogStream.tsx`, `machine.*`, `design/*`, chat internals, CommandLine,
  EntityHero, MenuButton. Build on top of phases 60/61/62 (don't revert the hero/kebab/meta-strip work).
- Only edit `RunDetail.tsx` (+ test), `PipelineStageTimeline.tsx` (+ test, surgically), and — only if
  needed for the clickable name — the local `MetaCell` (keep it working).
