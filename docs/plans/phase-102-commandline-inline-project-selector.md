# Phase 102 — Retire the global project selector; select project inline in CommandLine

> TODO ("Další nalezené věci"):
> _"Odstraníme globální selector projektu jak v HUD tak v Chat UI - projekt se bude vybírat přes
> inline selector v CommandLine komponentě."_

## Recon (verified)

- Switcher: `apps/web/features/projects/components/ProjectSwitcher.tsx` — single-select DS
  `Dropdown` over project ids + `NO_PROJECT = ""` ("Bez projektu"); reads `useActiveProject()` +
  `useProjectsQuery()`. Testid `ProjectSwitcherTestId.Root = "project-switcher"`.
- Rendered in exactly two places:
  1. **HUD topbar** via slot chain: `AppShell.tsx:80` `projectSlot={<ProjectSwitcher/>}` →
     `MainLayout.tsx` (l.39/56/89 threads `projectSlot`) → `TopBar.tsx` (l.19/31/46 renders it).
  2. **Chat** header: `ChatScreen.tsx:393` `<ProjectSwitcher/>`.
- Global state: `apps/web/features/projects/context/ProjectProvider.tsx` — React context
  `{ activeProjectId, setActiveProject }`, persisted in the `activeProject` cookie (~1yr), unknown
  -project guard. Hook `useActiveProject()`. Mounted in `AppShell`. Re-exported from
  `features/projects/index.ts`.
- CommandLine: `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` — ALREADY
  project-aware: imports `useActiveProject, useProjectsQuery` (l.30), reads
  `projects`/`activeProjectId` (l.468–469), derives `selectedProject` and folds its `path` into
  the task's detected `paths` (l.549–557). Inline controls are absolutely positioned inside the
  input box: attach `+` bottom-left (l.1051–1062, `CONTROLS_INSET`), Run/Send bottom-right
  (l.1064–1090), a reserved bottom strip (`CONTROLS_RESERVED_BOTTOM`, l.370). `@`-mention system
  (l.1095–1170) is the model for an inline picker. Optional chrome header row (l.1216–1238) has
  `header`/`headerEnd` slots.

## Goal

The project is chosen **inline in the CommandLine** (a compact project chip/selector in the
control row), everywhere the CommandLine appears (HUD overview command bar + Chat composer). The
standalone `ProjectSwitcher` disappears from the HUD topbar and the chat header. The selection
still drives the same global active-project state so the rest of the app (scoping, task dispatch)
is unaffected.

## Approach

1. **Keep `ProjectProvider`/`useActiveProject` as the source of truth** — do NOT rip out the
   context (task dispatch, run scoping, ChatTasksPanel all depend on it). We are moving the
   *control surface* into CommandLine, not changing where the state lives.
2. **Add an inline project selector to CommandLine.** In the bottom control row (beside the
   attach `+`), add a compact project selector built from the DS `Dropdown` (the same primitive
   `ProjectSwitcher` uses) rendered as a small chip/`DropDownButton`-style trigger that fits the
   Velin control aesthetic (see phases 31/51/59 for the CommandLine visual language). It reads
   `activeProjectId` + `projects` (already in scope) and calls `setActiveProject` on change (pull
   `setActiveProject` from `useActiveProject()` — currently only `activeProjectId` is read).
   Include the `NO_PROJECT`/"Bez projektu" option. Keep the label compact (project name, truncate);
   show a folder/branch glyph. Ensure it participates in the reserved bottom strip layout
   (`CONTROLS_RESERVED_BOTTOM`) so it doesn't overlap the textarea text.
   - Give it a testid (e.g. `CommandLineTestId.ProjectSelector`) per DS testid conventions.
   - Reuse `ProjectSwitcher`'s option-building logic if cleanly extractable (e.g. factor a small
     `useProjectOptions()` or a presentational `ProjectSelect` that both could share) — otherwise
     inline it; avoid duplicating the unknown-project guard.
3. **Remove the global switcher from both hosts.**
   - HUD: drop `projectSlot={<ProjectSwitcher/>}` in `AppShell.tsx:80` (and the import). Leave the
     `projectSlot` prop plumbing in MainLayout/TopBar in place but unused, OR remove it cleanly if
     it has no other consumer (grep first; prefer removing dead plumbing if it's only this).
   - Chat: remove `<ProjectSwitcher/>` at `ChatScreen.tsx:393` and its import.
4. **CommandLine presence check.** Confirm the CommandLine is actually mounted on the HUD overview
   (phase-40 overview command bar) and in the chat composer — if a surface that previously relied
   on the topbar switcher has NO CommandLine, add the inline selector there or keep a scoped
   fallback. (Overview command bar = `apps/web/features/overview` / `tasks/CommandLine`; chat
   composer already embeds CommandLine.) Do not leave any surface with no way to change project.

## Files

- `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (inline selector in control row)
- possibly a new small `apps/web/features/projects/components/ProjectSelect.tsx` (shared
  presentational select) if extraction is clean; else reuse `ProjectSwitcher` internals
- `apps/web/components/layout/AppShell/AppShell.tsx` (remove projectSlot usage + import)
- `apps/web/components/layout/MainLayout/MainLayout.tsx` + `TopBar/TopBar.tsx` (only if removing
  the now-dead `projectSlot` plumbing cleanly)
- `apps/web/features/chat/components/ChatScreen.tsx` (remove ProjectSwitcher)
- Tests: `CommandLine.test.tsx` (inline selector renders, changing it calls setActiveProject),
  `ChatScreen`/`AppShell`/`TopBar` tests that asserted the switcher's presence → update to its
  absence; `ProjectSwitcher.test.tsx` stays (component may still exist, just unmounted from hosts —
  keep it or delete if fully unused after grep).

## Verification

- `pnpm check:types` clean; scoped lint.
- `pnpm exec vitest run apps/web/features/tasks apps/web/features/chat apps/web/features/projects apps/web/components/layout`
  green.
- Manual/Playwright: HUD topbar no longer shows the project switcher; the CommandLine control row
  has a project chip; changing it updates scoping (e.g. ChatTasksPanel list) exactly as the old
  switcher did; chat header no longer shows the switcher but the composer does.

## Constraints

- Don't remove the ProjectProvider/context — only relocate the control. One interaction grammar:
  the inline selector is a labelled control in a consistent spot in the control row. No `any`, no
  forwardRef, DS primitives, no raw inline DOM style. Keep the diff tight and the cookie-backed
  persistence behaviour intact.
