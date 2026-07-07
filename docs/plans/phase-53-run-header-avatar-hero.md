# Phase 53 — Run-detail header avatar rendered like EntityHero (stretched background), line 87

> TODO (line 87): _"stránka běhy a aktivita - avatar přiřazeného agenta nebo pipeliny by měl
> být dělaný stejně jako v HeroEntity komponentě - čili jako roztažené pozadí."_

## Context

Phase 48 put the assigned entity's avatar in the run-detail header as a right-aligned
`<IconTile glyph={glyph} src={avatar} size="lg" />`. The operator now wants it rendered like the DS
**`EntityHero`** component — the avatar as a STRETCHED BACKGROUND band (image `object-cover` filling a
band with a gradient scrim), not a small tile.

## Recon (implementer)

- **`libs/design-system/src/components/EntityHero/EntityHero.tsx`** — the reference: avatar `image`
  fills `absolute inset-0 object-cover` behind a `bg-gradient-to-t from-surface … to-transparent`
  scrim, with a glyph placeholder when no image, plus slotted title/actions. Read its full `EntityHeroProps`
  (image, glyph, fit, title/subtitle/action slots, testids) and how `apps/web/features/agents/DetailScreen.tsx`
  / `apps/web/features/pipelines/Screen.tsx` already consume it.
- **`apps/web/features/runs/components/RunDetail.tsx`** header (the `HudPanel` block from Phase 48):
  currently a horizontal `Stack` — left title/meta block, right actions/approval + the avatar IconTile.
  Decide how to fold the stretched-avatar treatment in WITHOUT losing the header's content (title,
  RunStateBadge, subtitle, meta line, actions/approval, Stop/Delete/Resume buttons).

## Approach

Prefer REUSING the DS `EntityHero` rather than re-implementing the stretched-bg + scrim:
- Render the run header as an `EntityHero` (or an EntityHero-styled band) whose background is the
  assigned entity's `avatar` (glyph fallback), with the existing header content placed in EntityHero's
  title/subtitle/action slots (title = headline + RunStateBadge, subtitle = subtitle/meta, actions =
  Stop/Delete/Resume or the approval meter). If `EntityHero`'s slot API can't carry all of the run
  header's content cleanly, instead replicate its stretched-bg+scrim treatment locally in the header
  (avatar `object-cover` absolute-fill + gradient scrim) while keeping the current content layout — but
  do NOT fork EntityHero's visual tokens; match them.
- Keep the glyph fallback (no avatar → EntityHero's glyph placeholder). Keep the `avatar?` prop plumbing
  from Phase 48 (`useRunAvatarMap`/`runAvatar`, passed from `Screen.tsx`).
- Preserve every header affordance: RunStateBadge, subtitle, meta line (`id · kind · agent X`), approval
  SeverityMeter/RiskBadge, Stop/Delete/Resume buttons, and their behaviors/testids.

## Files
- `apps/web/features/runs/components/RunDetail.tsx` (header → EntityHero-style stretched avatar bg)
- `apps/web/features/runs/components/RunDetail.test.tsx` (avatar-as-background present with `src`; glyph
  fallback; header content + actions still render — update the Phase-48 avatar assertions to the new
  structure, keeping the assertion set, migrating only selectors)
- possibly `libs/design-system/src/components/EntityHero/*` ONLY if a small prop is genuinely missing to
  host the run header (add minimally, with story + test) — prefer using it as-is.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/runs` (+ `libs/design-system/src/components/EntityHero` if touched). NEVER bare `pnpm lint`.
- `rtk proxy npx vitest run apps/web/features/runs` (+ DS EntityHero if touched) green modulo the known
  pre-existing reds (RunDetail cost-cell cs-locale, some TaskCard/PipelineCard) — confirm via `git stash`.
- Manual: run detail header shows the assigned entity's avatar as a stretched background band with the
  title/state/actions legible over the scrim; glyph fallback when no avatar.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` (DS primitives; EntityHero already owns
  the object-cover/gradient). Reuse EntityHero — don't fork its look. Don't touch operator WIP
  (SummaryWidget, machine.*, design/*, `apps/web/features/chat/**`, `RunLogStream.tsx`). Do NOT edit
  `PipelineStageTimeline.tsx` or other runs files beyond RunDetail + its test.
