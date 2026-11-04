# TODO 39 — Show pins on the dashboard

Raw item text (operator, Czech):

> Postranní panel jsme smazali, takže připnuté stránky a workflow (pins.json) se nikde nezobrazují. Vymyslet nové místo, kde je zobrazit (např. widget nebo lišta v dashboardu), a rozhodnout, jestli se pin workflow a rychlá akce sloučí.

## Findings

- The bridge dashboard already has a `pins` widget (`apps/web/features/bridge/widgets/PinsWidget.tsx`),
  but it renders only `kind: "page"` pins. Entity pins (`kind: "workflow"` / `"agent"`) are dropped,
  so a pinned workflow (e.g. `coloring-book-random` in the live `pins.json`) shows up nowhere.
- `PinnedRail` (the old side-rail body) has no consumer since the side rail was removed.
- A pinned workflow is a **bookmark**: clicking it navigates to `/work/workflows/<id>`.
  A quick action is a **one-click enqueue**: a stored `text` + optional target, Run calls `createTask`.

## Scope

1. The Pins widget shows every pin in pin order: page pins (operator label → their href),
   workflow pins (live name from the workflows catalog → `/work/workflows/<id>`) and agent pins
   (live name from the agents catalog → `/workforce/agents/<id>`). Unknown/deleted ids fall back to the id.
2. Each row carries a small kind tag (page / workflow / agent).
3. Rename the widget label from "Pinned pages" to "Pinned" (it is no longer pages-only).
4. No data migration; `pins.json` is untouched.

## Ruling: pinned workflow vs. quick action — do not merge

They overlap only in that both point at a workflow. A pin navigates (bookmark, no side effect);
a quick action enqueues a run with a stored prompt (Tier-1 work with a side effect). Merging would
either give a bookmark a run side effect or force a prompt onto every pin, and would need a
`pins.json` → `quick-actions` migration. Recommendation: keep both; when the operator wants to
_run_ a pinned workflow in one click, they add a quick action targeting it (the Quick actions
widget already supports workflow targets). Revisit if the operator ends up pinning workflows
only to run them.
