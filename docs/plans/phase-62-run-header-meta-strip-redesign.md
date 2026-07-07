# Phase 62 — Run-detail header: rearrange the bottom stats/meta row per the design

> TODO (line 11): _"Stránka Běhy a aktivita - Detail běhu - header - přeskupíme spodní řádek
> kde jsou statistiky běhu (jak dlouho běžel, kdy se spustil, …) podívej se do design složky
> a implementuj podle toho."_

## Reference

`design/Z.I.B.B.Y/zibby/task-detail.jsx` — the **"Meta strip"** (lines ~338–352). In the design the run
stats are a **horizontal row of labeled cells** sitting BELOW the title block, separated from it by a top
border, with **thin vertical dividers between cells**:
- The strip: `marginTop, paddingTop, borderTop: 1px solid line` — a hairline separating it from the header
  content above; `display:flex; flex-wrap: wrap`.
- Each cell: a tiny **uppercase mono label** (`~8px`, letter-spaced, `inkFaint`) on top, a **bold value**
  (`~14px`, `700`) below it; cells separated by `paddingRight + marginRight + borderRight: 1px solid line`
  (no divider after the last).
- Design's example cells: `cena` ($spent / $budget), `trvání` (elapsed), `fáze` (N / M done). Our run
  header has richer stats (project, started/scheduled, pipeline/target, task+outcome, cost, duration,
  approval requested/via) — keep ALL the current stats, just RESTYLE the row to this labeled-cell +
  divider treatment.

## Current state

`RunDetail.tsx` lines ~535–584: a `Stack wrap direction="row" gap="300"` of `MetaCell` components. Each
`MetaCell` already renders a label + value (check its current markup). The row today relies on `gap` for
separation and sits directly under the title block without the hairline top border or inter-cell dividers.

## Change

Restyle the meta row to match the design's meta strip, using DS primitives only:
- Add a **top hairline** separating the meta strip from the header content above it — a DS `Divider`
  (horizontal) or the header block's border token; do not use a raw `<div>` with inline border.
- Put **vertical dividers between cells** — DS `Divider orientation="vertical"` between `MetaCell`s, or
  bake a leading/trailing divider into `MetaCell` via a prop. Prefer inserting `Divider` between items in
  the `Stack` (no divider after the last, none before the first). Because the row `wrap`s, a vertical
  divider on a wrapped line is acceptable as long as it reads cleanly; if wrapping makes dividers look
  wrong, gate them or switch to a `Grid`/row that keeps the labeled-cell rhythm — decide explicitly.
- Ensure the **label/value typography** matches the design intent (small uppercase mono label, bold
  value). `MetaCell` likely already does this — verify and nudge to match (don't fork tokens; use existing
  `Typography` types/sizes). If `MetaCell` needs a tweak (e.g. a `divider` prop, or tighter label), make it
  minimally and keep its other consumers working (grep for `MetaCell` usage — it appears local to
  RunDetail; confirm).
- Keep every existing stat and its conditional rendering (project vs AssignProjectControl, started/
  scheduled, pipeline/target, task+outcome, cost, duration, approval requested/via). This is a LAYOUT/
  STYLE change, not a data change.

Do NOT change the title/state/description block or the actions (phase 61 owns the actions). Only the
bottom meta strip.

## Tests
- `RunDetail.test.tsx`: the meta cells still render their labels + values (keep those assertions). If you
  add dividers/top border, assert their presence is optional — the key assertions are that each stat's
  label+value is present. Migrate selectors only if markup changed; keep the assertion set.

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `npx eslint apps/web/features/runs` (+ `libs/design-system/...MetaCell/Divider` if a DS file is touched)
  clean.
- `rtk proxy npx vitest run apps/web/features/runs` green modulo the KNOWN pre-existing reds (RunDetail
  cost-cell cs-locale; TaskCard x2) — confirm via `git stash`, don't chase.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` in apps/web — the hairline/dividers must
  be DS `Divider`/primitives (NOT a raw `<div style={{borderTop}}>`). A genuinely-dynamic value uses a DS
  `style` passthrough.
- Do NOT touch operator WIP: `PipelineStageTimeline.tsx`, `.zibby/data/**`, `RunLogStream.tsx`,
  `machine.*`, `design/*`, chat internals.
- Only edit `RunDetail.tsx` (+ its test), and — only if genuinely needed for the divider/label — the local
  `MetaCell` (keep it working) or add a tiny DS `Divider` usage. Build on top of phase 61's kebab change
  (don't revert it).
