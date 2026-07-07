# Phase 34 — Inline pipeline editing in the detail view; agents palette behind a "+"

> TODO (line 49): _"editační dialog pro pipeline mi přijde zbytečný. Můžeme ho zrušit
> a jeho obsah zobrazit v rámci detail view pipeliny (jen sidepanel s agenty zrušíme a
> zobrazíme ho jen když uživatel klikne na nové tlačítko + se záměrem přidat agenta.
> Po přidání agenta se side panel zase zavře, případně bude mít uživatel možnost
> zavřít ho manuálně)."_

## Goal

Remove the pipeline EDIT dialog; edit the pipeline's graph **inline in the detail view**.
The agents palette (sidepanel) is hidden by default and shown only when the user clicks a
new **"+" (add agent)** button; after an agent is added it auto-closes (and the user can
also close it manually). Keep the CREATE flow working.

## Current state (recon)

- `/pipelines` and `/pipelines/[id]` both render `apps/web/features/pipelines/Screen.tsx`
  (list = left column, detail = right column when `selected`).
- Edit dialog: `features/pipelines/components/PipelineDialog/PipelineDialog.tsx` — a shared
  `Dialog` for BOTH create and edit (`mode` prop). Edit is opened by the detail's "Edit"
  ghost button (`Screen.tsx:195-202`), dialog rendered at `Screen.tsx:301-316`, saved via
  `updatePipeline.mutate`.
- Detail view ALREADY renders a **read-only** `PipelineCanvas` (`Screen.tsx:249-265`,
  `detailGraph = phasesToGraph(...)`). `PipelineCanvas` fully supports editable vs
  read-only via its `readOnly` prop + `setGraph`/`onAddAgent`.
- `AgentPalette.tsx` (232px) is UNCONDITIONALLY mounted as the first child of the dialog
  split pane (`PipelineDialog.tsx:190`). Adding an agent: palette row click `onAdd(id)` or
  drag → both converge on `addAgent` (`PipelineDialog.tsx:59`, the sole node-append).
- Graph helpers: `pipeline-graph.ts` (`phasesToGraph`, `graphToPhases`, `makeNode`,
  `validateGraph`). Edits persist as `phases[]` via `updatePipeline` (PATCH, only-changed).
- Create: `NewPipelineDialog.tsx` (thin wrapper → `PipelineDialog mode="create"`), opened
  by "Add pipeline" (`Screen.tsx:87`) + empty-state. No `/pipelines/new` route.
- Tests: `PipelineDialog.test.tsx` (edit + create), `NewPipelineDialog.test.tsx`,
  `PipelineCanvas.readonly.test.tsx`, `Screen.test.tsx`, `pipeline-graph.test.ts`.

## Approach

### 1. Inline edit into the detail column
- In `Screen.tsx`, hold an `editing: boolean` (or `editGraph` state) for the detail
  pipeline. The detail's `PipelineCanvas` (`Screen.tsx:256`) switches between:
  - **read mode** (`readOnly`, `setGraph`/`onAddAgent` = noop) — today's behavior; and
  - **edit mode** — `readOnly={false}`, `setGraph` wired to a local `editGraph` state
    (seeded from `phasesToGraph(selected.phases)`), `onAddAgent` wired to an `addAgent`
    that appends via `makeNode` (lift the exact logic from `PipelineDialog.addAgent`).
- The top-right "Edit" button (`Screen.tsx:195-202`) now TOGGLES edit mode on the inline
  canvas instead of opening the dialog. In edit mode show **Save** + **Cancel** (top-right
  grammar). Save = `graphToPhases(editGraph)` → diff → `updatePipeline.mutate` (reuse the
  PATCH-only-changed logic from `PipelineDialog.submit`, `:73-97`); Cancel discards
  `editGraph`. Name/description editing that the dialog offered: keep it available in edit
  mode (inline name/desc fields in the detail metadata panel, or a small edit affordance) —
  don't lose the ability to rename on edit.
- Remove the edit-dialog render (`Screen.tsx:301-316`) and the `editing`-opens-dialog path.

### 2. Agents palette behind a "+"
- In edit mode, the `AgentPalette` is hidden by default. Add a **"+" add-agent button**
  (clearly labelled intent, e.g. "Přidat agenta") near the canvas; clicking it opens the
  palette (a `showPalette` boolean). After `addAgent` runs, set `showPalette = false`
  (auto-close), and give the palette its own close control for manual dismissal.
- Reuse `AgentPalette.tsx` as-is (it already emits `onAdd`/drag); just gate its mounting on
  `showPalette` and add the auto-close in the `addAgent` handler.

### 3. Keep CREATE working
- Leave the CREATE path (`NewPipelineDialog` → `PipelineDialog mode="create"`) intact — the
  user only called the EDIT dialog unnecessary. `PipelineDialog` stays (create-only now).
  For consistency you MAY also gate the palette behind a "+" inside the create dialog, but
  that's optional — do it only if it's low-risk; otherwise leave create's palette as-is and
  say so. (Do NOT delete `PipelineDialog` — create still uses it.)

## Files touched
- `apps/web/features/pipelines/Screen.tsx` (inline edit state, canvas edit mode, Save/Cancel,
  "+"-gated palette, remove edit-dialog render)
- `apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx` (only if a small
  affordance is needed; it already supports editable)
- reuse `AgentPalette.tsx` (gate mounting; maybe add a close button)
- `PipelineDialog.tsx` — keep for create; if `addAgent`/palette logic is shared, extract the
  reusable bits rather than duplicate.
- Tests: move/rewrite `PipelineDialog.test.tsx` edit cases into `Screen.test.tsx` (inline
  edit: toggle edit → add agent via "+" → save → PATCH); keep create + readonly + graph tests.

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/pipelines` — never bare
  `pnpm lint`), `pnpm test` green modulo known pre-existing failures (confirm via `git stash`;
  NOTE the operator's 2 pre-existing `machine.service.ts` typecheck errors are WIP, not ours).
- Manual: open a pipeline detail → Edit toggles the canvas editable inline (no dialog) →
  "+" opens the agents palette → adding an agent closes it → Save PATCHes the phases;
  Cancel reverts; create (Add pipeline) still works.

## Constraints
- No forwardRef, no `any`, export props, no inline DOM `style` (DS primitives/props). Follow
  the app's top-right edit grammar + "dialogs are for creating/confirming only" (this moves
  edit OUT of a dialog, consistent with that grammar). Don't touch the operator's WIP
  (machine.*, SummaryWidget, design/*).
