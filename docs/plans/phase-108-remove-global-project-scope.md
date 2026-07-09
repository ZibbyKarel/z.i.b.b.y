# Phase 108 — Remove the global project view-scope; always show all projects

> Operator decision: the app-wide sticky "active project" scope (Phase 24) was a
> **design mistake**. ZIBBY should **always show information from all projects at
> once** (running tasks, runs, approvals, memory…). The project selector in
> `CommandLine` stays as the *only* project control, and it does exactly one
> thing: **assigns the launched task's project** — it never re-scopes any view.
>
> Web-only (`apps/web`). No contract/API change. This deletes the global
> `ProjectProvider`/`useActiveProject` scope and reverts every screen that
> filtered by it back to "show all", restoring per-project drill-down via an
> explicit URL query param (the pre-Phase-24 mechanism) instead of a sticky
> global scope.

---

## Background (verified consumer map)

`useActiveProject()` / `activeProjectId` is consumed in these non-test files:

**A. Filter view data by the global scope → revert to "show all":**
- `features/runs/Screen.tsx` — `allRuns.filter(r => r.projectId === activeProjectId)`.
- `features/memory/Screen.tsx` — `filterGraphByProject(graph, activeProjectId)` + `searchHits` project filter.
- `features/overview/components/ApprovalsPanel.tsx` — approvals filtered by project.
- `features/chat/components/ChatTasksPanel.tsx` — chat task runs filtered by project.

**B. Chrome that displays the active scope → drop / show-all:**
- `components/layout/BrandLogo/BrandLogo.tsx` — swaps the sidebar brand to the active project's logo/name.
- `features/projects/components/ProjectScopeChip.tsx` — "scoped to X" tag in the runs/memory/approvals headers.
- `features/subsystems/components/SubsystemDrawer/GatesTab.tsx` (`AutopilotSummary`) — shows the active project's autonomy dial.

**C. Writers that arm the scope before navigating → drop, use URL param:**
- `features/projects/components/ProjectCard.tsx` — stat deep-links `onClick={() => setActiveProject(id)}` then `/runs?filter=…`.
- `features/projects/components/ProjectRunSummary.tsx` — same pattern.

**D. The context + dead switcher:**
- `features/projects/context/ProjectProvider.tsx` — the store + `activeProject` cookie.
- `features/projects/components/ProjectSwitcher.tsx` — retired in Phase 102, still exported but mounted nowhere.
- Mounted in `components/layout/AppShell/AppShell.tsx` (L92–104).
- Exported from `features/projects/index.ts`.

**E. Task dispatch (already per-task after Phase 107, needs the global seed removed):**
- `features/tasks/components/CommandLine/CommandLine.tsx` — seeds its local `taskProjectId` from the global `activeProjectId`.
- `features/tasks/components/NewTaskDialog.tsx` — folds the global active project's `path` into its classify-preview `paths`.

Key historical note (from `ProjectRunSummary`'s own comment): **before Phase 24 the
runs feed read a `?project=` query param.** Phase 24 replaced it with the sticky
scope. This phase restores the URL-param mechanism for drill-down.

---

## The change

### 1. Runs screen — show all; optional URL-param drill-down
`features/runs/Screen.tsx`:
- Remove `useActiveProject` + the `activeProjectId` filter. Default: **all runs**.
- Read an optional `project` query param via `useSearchParams()`. When present,
  filter `allRuns` to `r.projectId === project`; when absent, show all.
- Replace `<ProjectScopeChip />` in the header with: nothing when unfiltered; a
  small **clearable** filter tag (project name + an ✕ that navigates back to
  `/runs`) when the param is present, so a filtered-empty list is never confusing.
  Reuse a DS `Tag`/`Button`; keep it a domain composite in the runs feature.

### 2. Project drill-down deep-links → URL param, no scope arming
`features/projects/components/ProjectCard.tsx` and
`features/projects/components/ProjectRunSummary.tsx`:
- Drop `useActiveProject`/`setActiveProject` entirely.
- Each stat `Link` href now carries the project: `/runs?project=${projectId}` and
  `/runs?project=${projectId}&filter=${groupFilterParam(g)}` (and the total →
  `/runs?project=${projectId}`). Remove the `onClick` scope-arming.
- Keep every `as Route` cast (typed-routes convention).

### 3. Memory / Approvals / ChatTasksPanel — always all
- `features/memory/Screen.tsx`: drop `useActiveProject`; stop wrapping the graph in
  `filterGraphByProject` (keep `filterGraphByTier`); drop the `searchHits` project
  predicate; remove `<ProjectScopeChip />`. Keep `filterGraphByProject` the pure
  util in place (it may still be imported elsewhere — grep; only remove the call).
- `features/overview/components/ApprovalsPanel.tsx`: drop `useActiveProject` + the
  project filter (show all approvals); remove `<ProjectScopeChip />`.
- `features/chat/components/ChatTasksPanel.tsx`: drop `useActiveProject` + the
  project filter (show all task runs).

### 4. Sidebar brand — always the ZIBBY mark
`components/layout/BrandLogo/BrandLogo.tsx`: drop `useActiveProject`/`useProjectsQuery`;
always render the static `BrandIcon` + `BrandName` + tagline, `href="/overview"`.
(The per-project brand swap only made sense under a sticky scope.)

### 5. Gates tab autopilot dial — show every project (not "the active one")
`features/subsystems/components/SubsystemDrawer/GatesTab.tsx` (`AutopilotSummary`):
- Drop `useActiveProject`. Iterate ALL projects from `useProjectsQuery()` and render
  a compact per-project dial (name + `can_do_alone`/`always_ask` tags + the existing
  "edit" link to `/projects/${id}?tab=profile`). Only list projects that HAVE a
  policy; if none do, keep the existing empty state (`autopilotNoProject` →
  reuse/relabel to a "no project policies" message; add an i18n key if wording must
  change, in both `cs`/`en`). Keep all existing test-ids present (`AutopilotPanel`,
  and per-project rows may suffix the id).

### 6. CommandLine — per-task project, no global seed
`features/tasks/components/CommandLine/CommandLine.tsx`:
- Remove the `useActiveProject` import and the `activeProjectId` read.
- `taskProjectId` initial value becomes `initialProjectId ?? null` (default **no
  project**). Keep `initialProjectId`/`onProjectChange` and the local-state wiring
  from Phase 107 otherwise unchanged.

### 7. NewTaskDialog — drive preview paths off CommandLine's per-task project
`features/tasks/components/NewTaskDialog.tsx`:
- Remove `useActiveProject`. Hold local `const [taskProjectId, setTaskProjectId] =
  useState<string | null>(null)`; pass `onProjectChange={setTaskProjectId}` to
  `<CommandLine>`. Compute `selectedProject`/preview `paths` from `taskProjectId`
  (same shape as today, sourced locally). CommandLine still folds its own project
  path into the dispatched task independently — this only feeds the live preview.

### 8. Delete the global scope infrastructure
- Delete `features/projects/context/ProjectProvider.tsx` and its test
  `context/ProjectProvider.test.tsx`.
- Delete `features/projects/components/ProjectScopeChip.tsx` (+ any test) and
  `features/projects/components/ProjectSwitcher.tsx` (+ its test) — both now unused.
- `features/projects/index.ts`: remove the `ProjectProvider`/`useActiveProject`/
  `ACTIVE_PROJECT_COOKIE`, `ProjectSwitcher`, `ProjectScopeChip` exports.
- `components/layout/AppShell/AppShell.tsx`: remove the `<ProjectProvider>` wrapper
  (L92–104) and its import; keep the children it wrapped.
- Grep for any remaining `ACTIVE_PROJECT_COOKIE` reader (server layout / i18n) and
  remove — there should be none, but verify.

### 9. Tests
Update/rewrite every test that mocked `useActiveProject` or asserted scope
behaviour. Known touch points: `CommandLine.test.tsx`, `NewTaskDialog.test.tsx`,
`ChatTasksPanel.test.tsx`, `ChatScreen.test.tsx`, `runs/*.test`, `memory/*.test`,
`overview/ApprovalsPanel*.test`, `ProjectCard`/`ProjectRunSummary` tests,
`BrandLogo` test, `GatesTab` test. Delete tests for deleted components
(`ProjectProvider.test.tsx`, `ProjectSwitcher` test, `ProjectScopeChip` test).
New assertions to add:
- runs/memory/approvals/chat-tasks now render items from **multiple** projects
  simultaneously (was: only the scoped one).
- `ProjectCard`/`ProjectRunSummary` stat links carry `?project=<id>` and do **not**
  call any scope setter.
- runs `?project=<id>` filters; the clear-✕ returns to all.

---

## Sequencing & commits
All on `feat/todo-chat-ui-fixes` (same PR as Phase 107).
1. `docs(plans): phase 108 — remove global project scope` (this file).
2. `refactor(projects): always show all projects; drop global active-project scope`
   — items 1–9 in one coherent commit (deleting a shared context can't land in
   pieces without a broken intermediate build). Tick the relevant `TODO.md` note.

## Definition of done
- No remaining `useActiveProject`/`ProjectProvider`/`ProjectScopeChip`/
  `ProjectSwitcher`/`ACTIVE_PROJECT_COOKIE` references (grep clean).
- `pnpm check:lint` + web `tsc` clean for all changed files (repo has known
  pre-existing unrelated failures — leave them).
- `pnpm test` (web scope) green for all touched suites.
- Manual smoke: `/overview`, `/runs`, `/memory`, `/chat` render and show
  cross-project data; `/runs?project=<id>` filters.
- `graphify update .` + self-knowledge note refresh at the end (drift gate), then
  the PR (already open, #52) picks up the new commits.
