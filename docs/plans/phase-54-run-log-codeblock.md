# Phase 54 — Run log wrapped in the DS CodeBlock component (line 85)

> TODO (line 85): _"stránka běhy a aktivita - log běhu nesedí s designem. Měl by být obalen
> v CodeBlock componentě."_

## Context

The live run log is rendered by `apps/web/features/runs/components/RunLogStream.tsx` (imported into
`RunDetail.tsx` at the "output" section). The audit/design wants the log presented inside the DS
`CodeBlock` component (as the file-output already is — Phase 41 uses `<CodeBlock maxHeight="md" …>`),
so the run log matches the design's monospace framed block.

⚠️ At the time this plan was written, `RunLogStream.tsx` was operator WIP (a live CodeBlock
experiment). This phase runs ONLY after the operator has committed that file. RECON the committed
state first — the operator may have already partially wrapped it; build on what's there, don't revert.

## Goal

The run log stream renders inside the DS `CodeBlock` (monospace, framed, scrollable, `maxHeight`),
consistent with the file-output rendering, while preserving the live-tail behavior (SSE stream append,
autoscroll, the phase-06 collapsible tool/script sections if present).

## Recon (implementer)

- Read the COMMITTED `RunLogStream.tsx`: how it renders the streamed text today (raw `<pre>`? a custom
  container?), how it tails (the SSE `useRunLogStream`), and any collapsible-log affordance (Phase 06).
- Read DS `CodeBlock` (`libs/design-system/src/components/CodeBlock/`): props (`text`, `maxHeight`,
  language?, whether it forwards `data-testid` — memory: "CodeBlock doesn't forward data-testid", so
  keep testids on a wrapper), and whether it supports streaming/append or expects a full `text` string.
- Confirm how Phase 41's file output uses `CodeBlock` so the log matches that treatment.

## Approach

- Render the live log text through `CodeBlock` (feed it the accumulated stream text; `maxHeight` for the
  scroll region). If `CodeBlock` can't host the collapsible tool/script folding (Phase 06) or the
  autoscroll tail, keep those behaviors around/inside a CodeBlock-framed container rather than dropping
  them — the framed monospace look is the requirement, not losing live-tail/folding.
- Keep the SSE tail (DNA: a log is a live stream, not a poll) and autoscroll. Keep testids on a wrapper
  element (CodeBlock doesn't forward `data-testid`).
- Match the file-output `CodeBlock` usage (same `maxHeight`, framing) for visual consistency.

## Files
- `apps/web/features/runs/components/RunLogStream.tsx` (+ its test)
- possibly `RunDetail.tsx` only if the log's container framing moves there (prefer keeping it in RunLogStream).

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/runs` (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run apps/web/features/runs` green modulo known pre-existing reds (confirm via `git stash`).
- Manual: a running agent run's log shows in a CodeBlock frame, tails live, autoscrolls; collapsible
  tool/script sections (if present) still work.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` (DS props / CodeBlock). Preserve the SSE
  live-tail and any Phase-06 folding. Don't touch other operator WIP (SummaryWidget, machine.*, design/*,
  `apps/web/features/chat/**`).
