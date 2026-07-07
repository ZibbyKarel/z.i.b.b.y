# Phase 48 — Run detail header shows the assigned entity's AVATAR (right side), glyph fallback

> TODO (line 75): _"stránka běhy a aktivita - na detailu tasku v headeru bych místo
> klasického glyphu v levo nahoře zobrazil avatara (s fallbackem na glyph) přiřazeného
> agenta nebo pipeliny. Avatar by měl být vpravo."_

## Current state (recon done)

`apps/web/features/runs/components/RunDetail.tsx` header (≈ lines 433–463):
- Left: `<IconTile glyph={glyph} size="lg" />` then the title/badge/subtitle/meta block.
- Right cluster: EITHER the approval `SeverityMeter`+`RiskBadge` (when the run waits on the gate)
  OR the Stop/Delete action buttons (`isStoppableRun`, delete).
- `glyph` is a prop (`RunDetailProps.glyph: IconName`), resolved by the caller `Screen.tsx`
  (line 259) via `runGlyph(selected, glyphById)` where `glyphById = useRunGlyphMap()`.
- `useRunGlyphMap()` (`apps/web/features/runs/queries/useRunsQuery.ts:85`) builds
  `Map<string, IconName>` from the skills + agents catalogs keyed by entity id (owner).

There is NO avatar map yet. Agents carry `avatar` (`a.avatar`); pipelines carry `avatar`
(`apps/web/features/pipelines/queries/usePipelinesQuery.ts`). The run's `owner` id keys into these.
`IconTile` already supports `src` (avatar) with `glyph` fallback (used in PipelineStageTimeline:
`<IconTile glyph={glyph} src={agent?.avatar} .../>`).

## Goal

In the run-detail header, show the assigned agent/pipeline's AVATAR (fallback to the current glyph)
positioned on the RIGHT of the header instead of the classic top-left glyph tile.

## Approach

1. **Resolve the avatar.** Add `useRunAvatarMap(): Map<string, string>` in
   `apps/web/features/runs/queries/useRunsQuery.ts` (mirror `useRunGlyphMap`): source `avatar` from
   the agents catalog AND the pipelines catalog (add skills if they carry an avatar — check the
   schema; if not, skip), keyed by id. Re-export from `queries/index.ts`. Add a small resolver
   (e.g. `runAvatar(run, avatarById)` in `run.ts`, next to `runGlyph`) returning `string | undefined`.
2. **Pass it down.** In `Screen.tsx`, call `useRunAvatarMap()` and pass `avatar={runAvatar(selected, avatarById)}`
   to `<RunDetail>`. Add `avatar?: string` to `RunDetailProps`.
3. **Render on the right.** Remove the left `<IconTile glyph={glyph} size="lg" />`. Add a single
   `<IconTile glyph={glyph} src={avatar} size="lg" />` at the RIGHT end of the header row (glyph is the
   fallback when `avatar` is undefined). Keep the title/badge/subtitle/meta block filling the left/center.
   The existing right-side content (approval meter OR Stop/Delete actions) must remain functional —
   lay the header out so the avatar is the rightmost element and the actions/approval sit between the
   title block and the avatar (or a sensible arrangement that keeps everything visible and doesn't
   crowd on wrap — the header `Stack` already has `wrap` + `justify="between"`). Keep it a clean,
   single glyph→avatar swap, not a redesign.
4. Keep `glyph` prop (still the fallback). Don't change the meta line's `· agent X` text.

## Files
- `apps/web/features/runs/queries/useRunsQuery.ts` (+ `queries/index.ts`) — `useRunAvatarMap`.
- `apps/web/features/runs/run.ts` — `runAvatar(run, avatarById)` resolver (+ export).
- `apps/web/features/runs/components/RunDetail.tsx` — `avatar?: string` prop; move IconTile to right with `src`.
- `apps/web/features/runs/Screen.tsx` — resolve + pass `avatar`.
- Tests: `RunDetail.test.tsx` (header renders avatar `src` when provided, falls back to glyph when
  not, avatar is in the header's right region), and update `Screen.test.tsx` if it asserts the glyph
  position. testid-first.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/runs` (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run apps/web/features/runs` green (RunDetail cost-cell cs-locale + some
  TaskCard/PipelineCard reds are PRE-EXISTING — confirm via `git stash`, don't chase).
- Manual: open a run detail for an agent task and a pipeline task → the assigned entity's avatar
  shows top-right (glyph fallback when no avatar); actions/approval still work.

## Constraints
- No forwardRef, no `any`, no raw inline DOM `style` (DS `IconTile`/`Stack`/`Container` props only).
  Don't touch operator WIP (SummaryWidget, `apps/api/src/machine/*`, `libs/contracts/src/machine/*`,
  `design/*`, `apps/web/features/chat/**`).
