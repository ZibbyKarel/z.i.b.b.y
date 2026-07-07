# Phase 44 — Show active/running tasks on the left of the chat page

> TODO (line 67): _"na stránce chatu nevidím běžící tasky pokud byly spuštěny z HUD UI.
> Měl bych vidět na levé straně aktivní tasky."_

## Goal

On the fullscreen chat page, show the currently ACTIVE/RUNNING tasks in a left-side
panel, so the operator sees what's running (incl. tasks launched from the HUD) while
chatting. This is distinct from the activity LOG (removed in Phase 39) — it's a live list
of running/active runs, like velin-b's left "Běží" rail.

## Recon (implementer)

- `apps/web/features/chat/components/ChatScreen.tsx` — the fullscreen layout (Phase 27):
  top bar, the `CosmicScene` backdrop, a centered transcript (`max-w-[720px]`), the
  `CommandLine` composer at the bottom (Phase 38). Determine how to add a LEFT column /
  panel without breaking the scene + transcript centering (the scene is `absolute inset-0`;
  the left panel sits above it, `z`-stacked, like the top bar/composer).
- Running-tasks data: `apps/web/features/runs/queries/useRunsQuery.ts` (the `/tasks/runs`
  feed, SSE-invalidated) — filter to active/running (statuses `running` + likely
  `awaiting-approval`/`queued`? decide: "aktivní tasky" = running now; keep it to
  running/waiting). It's scoped by the active project (Phase 24) — the chat shares that
  scope (Phase 33 added the switcher to the chat top bar), so reuse the same scoping.
- A compact running-task row already exists in spirit: velin-b `VbRail`'s "Běží" panel
  (agent name + % + prompt + meter) and the runs `TaskCard`. Reuse a compact presentation
  (glyph/avatar + title + state + progress) — ideally a small dedicated component, or a
  slimmed reuse of an existing runs card.

## Approach

- Add a left-side panel to `ChatScreen` (a `z`-raised column pinned to the left, sized so it
  doesn't crowd the centered transcript — e.g. a fixed-width rail on the left, the transcript
  stays centered in the remaining space). Title it (e.g. "Běží" / active tasks), list the
  active runs from `useRunsQuery` filtered to running/active + scoped to the active project.
  Each row: entity glyph/avatar + task title + state chip + progress (reuse `runStateTone`,
  glow only when live — consistent with Phase 29/36). Clicking a row navigates to
  `/runs?run=<id>` (leaves chat to the HUD run detail) — or opens it; keep it simple: link to
  /runs.
- Empty state: when nothing is running, show a quiet "nic neběží" placeholder or hide the
  panel (decide — a slim always-present rail with an empty hint reads better than layout
  shift).
- Keep the scene + transcript + composer intact; the left panel is additive, `z`-stacked
  above the scene like the other chat chrome.

## Files (expected)
- `apps/web/features/chat/components/ChatScreen.tsx` (add the left panel to the layout)
- a new compact running-task row component under `features/chat/components/` (or reuse a
  runs component)
- i18n for the panel title / empty state (cs default + en)
- tests: assert the panel lists running runs and links to /runs; empty state

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/chat` — never bare),
  `pnpm test` green modulo known pre-existing failures (confirm via `git stash`).
- Manual: launch a task from the HUD, open `/chat` → the running task appears in the left
  panel; it updates live (SSE); it respects the active-project scope; clicking goes to /runs.

## Constraints
- No forwardRef, no `any`, no inline DOM `style` (DS primitives/props; the scene canvas is
  the one dynamic-draw surface). Reuse `runStateTone` (single state map). Glow only when
  live. Don't touch operator WIP (SummaryWidget, machine.*, design/*).
