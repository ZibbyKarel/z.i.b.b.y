# Phase 100 — Chat task card opens run detail INLINE, not a redirect to /runs

> TODO ("Další nalezené věci"):
> _"Chat UI - kliknutí na kartu tasku nalevo by mělo otevřít detail tasku přímo hned vedle karty
> nikoliv přesměrovat na stránku '/runs'."_

## Recon (verified)

- Left panel: `apps/web/features/chat/components/ChatTasksPanel.tsx` — lists EVERY run in the
  active-project scope (phase 57), scoped/sorted live-first, maps each to a `ChatTaskRow`. It
  ALREADY has an accordion: a per-row chevron (`ChatTaskRowTestId.Expand`) toggles `expandedRunId`
  and renders, below the row, a per-kind inline view (`ChainStepsPanel` / `PipelineStageTimeline`
  / `RunLogStream`) for `EXPANDABLE_KINDS = {agent,pipeline,chain}` (l.42, l.116–168).
- The card: `apps/web/features/chat/components/ChatTaskRow.tsx` — the WHOLE row is a Next
  `<Link href={`/runs?run=${run.runId}`}>` (testid `ChatTaskRowTestId.Link`). **This link is the
  redirect to remove.**
- Reusable detail body: `apps/web/features/runs/components/RunDetail.tsx` — full run detail
  (header/hero, approval + PR gate, parked panel, log stream, stage timeline, chain steps,
  cost/duration, stop/delete/resume). Props `{ run, glyph, avatar, now, onStop, onDelete,
  onResume, ... }`, no router dependency — mountable inline. `apps/web/features/runs/Screen.tsx`
  (l.115, l.279–289) shows the reference wiring: `selId` state ← url, resolves the `RunView`,
  renders `<RunDetail>`.
- Layout: `ChatScreen.tsx` (l.443–454) mounts the panel in a fixed **300px** left gutter
  (`w-[300px]`, `hidden lg:flex`, `pointer-events-none` wrapper + `pointer-events-auto` inner).

## Goal

Clicking a task card selects it and opens its detail **inline, beside the card** (to the right of
the left gutter), instead of navigating away. Keeps the chat scene mounted; no route change.

## Approach

1. **Selection state.** Lift a `selectedRunId` into `ChatTasksPanel` (or `ChatScreen` if the
   detail must sit outside the 300px gutter — preferred, see 3). Clicking a `ChatTaskRow` sets
   `selectedRunId = run.runId` (toggles off if the same row is clicked again). Keep the existing
   chevron-accordion OR fold it into the same selection — prefer a single interaction: the whole
   card click selects + opens the side detail; drop the separate expand chevron to avoid two
   competing affordances (or keep the chevron purely as the selected indicator). Decide and keep
   ONE affordance per the project's "one interaction grammar" rule.
2. **Replace the redirect.** In `ChatTaskRow.tsx` replace the `<Link href="/runs?run=...">`
   wrapper with a clickable element that calls an `onSelect(run.runId)` prop (mirror the
   runs-page `TaskCard.tsx` which already uses `onClick={()=>onSelect(run.runId)}`). Preserve
   accessibility: keep the accessible name (`openAria`), make it a real button/role, keep the
   `data-testid`. Remove the now-unused `Route`/`Link` import if orphaned.
3. **Inline detail placement (beside the card).** Render the selected run's detail in a panel
   immediately to the RIGHT of the 300px task gutter (e.g. a second column at
   `left-[316px]`-ish, width ~`w-[420px]`, same `inset-y` band, `z` at/above the gutter but below
   the composer, with a `pointer-events-auto` inner). Resolve the `RunView` from the already-loaded
   `useRunsQuery` data by id and feed it to `RunDetail` (reuse Screen.tsx's resolution + the
   `onStop/onDelete/onResume` mutation wiring; extract/share if it reduces duplication). Provide a
   close affordance (X or click-away / re-click) that clears `selectedRunId`. Hidden below `lg`
   like the gutter (mobile deep-links can still fall back to /runs — keep a small "open full page"
   link inside the detail header if cheap).
4. Keep the panel's existing live-first sorting and project scoping untouched.

## Files

- `apps/web/features/chat/components/ChatTaskRow.tsx` (Link → onSelect button)
- `apps/web/features/chat/components/ChatTasksPanel.tsx` (selection state, pass onSelect, maybe
  retire the separate expand chevron)
- `apps/web/features/chat/components/ChatScreen.tsx` (mount the inline detail column beside the
  gutter) — coordinate with the z-index layering established in Phase 99 (drawer at z-30; the task
  detail column should not fight the subsystem drawer — they are on opposite sides, left vs right).
- Possibly a small shared helper to resolve a `RunView` + build the RunDetail action handlers,
  factored out of `runs/Screen.tsx` if it avoids duplication (only if clean).
- Tests: `ChatTaskRow.test.tsx` (asserts click calls onSelect, no longer a link to /runs),
  `ChatTasksPanel.test.tsx` (selecting a row renders the inline detail), any ChatScreen test.

## Verification

- `pnpm check:types` clean; scoped lint.
- `pnpm exec vitest run apps/web/features/chat apps/web/features/runs` green.
- Manual/Playwright: in chat, click a running task card → detail opens beside it, no URL change to
  /runs; a second click / X closes it; stop/resume/delete actions in the inline detail work.

## Constraints

- One interaction grammar: a card click navigates to its detail — here "navigation" is the inline
  side panel, not a route push. Don't leave two overlapping open affordances.
- Reuse `RunDetail` rather than reinventing the body. No `any`, no forwardRef, DS primitives, no
  raw inline DOM style. Keep SSE/polling behaviour of the reused components intact.
