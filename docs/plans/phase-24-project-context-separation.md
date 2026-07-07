# Phase 24 — Fully separated project contexts

> TODO: _"úplně oddělené kontexty pro projekty. … přepínátko projektů v top baru …
> vždy vidím jen globální informace (agenty, skilly, pipeliny, paměť) a
> project-specific věci jako běhy tásků. Nechci vidět běhy z jiných projektů.
> Selector projektu v topBaru bude jediným selectorem. Stejný selector z New task
> dialogu odstraníme a hodnotu vezmeme ze selektoru v topBaru. Vždy musí být
> vyplněn některý projekt. Neexistuje 'všechny projekty'. Ale můžu mít tasky bez
> projektu (výzkumy) → přidáme 'bez projektu' a u takových běhů chci možnost
> zařadit je do projektu."_

## Goal

Make the **top-bar project selector the single, always-set scope** for the app.
Global entities (agents, skills, pipelines, memory) always show; project-specific
data (task runs, approvals) show only for the selected project. Remove the "all
projects" concept. Add a first-class **"bez projektu"** (no-project) selection for
project-less work (e.g. research). Remove the project field from the New Task dialog
and source it from the top bar. Allow a project-less run to be **assigned into a
project later**.

## Current state (recon) — most scaffolding already exists ("Fáze 11")

- `apps/web/features/projects/context/ProjectProvider.tsx` — `useActiveProject()` →
  `{ activeProjectId: string | null, setActiveProject }`. **`null` currently means
  "Všechny projekty" (ALL).** Persisted in cookie `activeProject` (`ACTIVE_PROJECT_COOKIE`,
  ~1yr, SameSite=Lax). Unknown-project guard reads deleted cookie as `null`.
- `apps/web/features/projects/components/ProjectSwitcher.tsx` — DS `Dropdown`; options
  `[{ "" → t("switcherAll") }, ...projects]`; `ALL_PROJECTS = ""` sentinel (:16). Mounted
  via `AppShell.tsx:60` `projectSlot` → MainLayout → TopBar.
- Filtering sites that special-case `activeProjectId === null` (= ALL today):
  - `apps/web/features/runs/Screen.tsx:54-56` — `null ? allRuns : filter by projectId`.
    Also has its OWN redundant `?project=` dropdown (`:77,:92,:160-173`).
  - `apps/web/features/memory/Screen.tsx:52-64`.
  - `apps/web/features/overview/components/ApprovalsPanel.tsx:51-58`.
  - `apps/web/features/projects/components/ProjectScopeChip.tsx` — "scoped to X" tag,
    hidden when `null`.
- Project model: `libs/contracts/src/projects/project.schema.ts` — `id` doubles as slug
  (no separate slug), `name`, `path`, `logo` (optional data-URI, :150) already exists.
- Runs carry `projectId` — `libs/contracts/src/tasks/task-run.schema.ts:123` (optional).
- New Task dialog: `apps/web/features/tasks/components/NewTaskDialog.tsx` — project
  `SelectField` :247-255, state `projectId` :79-80, options :217-220. **The selected
  project is NOT sent as projectId** — its only effect is folding `selectedProject.path`
  into the task's `paths` (:92-105). Create body (`useTaskSubmit.ts:98-107`) has no
  projectId. `CreateTaskInputSchema` (`task.schema.ts:377-401`) has no projectId;
  attribution is **server-derived via `matchProject` from paths**, setting
  `ScheduledTask.projectId` before dispatch.
- No task/run → project reassignment endpoint exists today.

## Design decisions

1. **Sentinel re-semantic.** Drop "all projects". Represent scope as
   `activeProjectId: string | null` where **`null` = "bez projektu" (no-project)**, and
   a non-null string = that project. The selector is always populated (either a real
   project or "bez projektu"). Default on first load / unknown-cookie = `null`
   ("bez projektu") — safe, shows only global + unattributed runs.
   - Keep the cookie mechanism; the stored value is the project id, and empty/absent →
     `null` = no-project.
2. **Scoping semantics** (replace every `=== null ? all : byId`):
   - real project selected → show items with `projectId === activeProjectId`.
   - "bez projektu" selected → show items with **no** projectId (`!item.projectId`).
   - There is no "show everything" branch anymore.
3. **New Task project = top-bar scope.** Remove the dialog's project field; when a real
   project is active, keep folding its `path` into `paths` (server then infers
   `projectId`) — reuse the existing mechanism, just source the project from
   `useActiveProject()` + `useProjectsQuery()` instead of the local SelectField. When
   "bez projektu", fold nothing (task stays unattributed).
4. **Reassignment (project-less → project).** Add an explicit set-project path:
   - Contract: new endpoint on the tasks contract, e.g.
     `PATCH /api/tasks/runs/:id/project` body `{ projectId: string | null }`.
   - API: implement in the tasks controller/service — persist `projectId` on the run
     (and its scheduled-task record) in the file store; Law-4 safe (operator action,
     not inbound-content-driven).
   - Web: a small "Zařadit do projektu" affordance on a run's detail (`RunDetail`) shown
     when the run has no projectId — a `SelectField` of projects → `useAssignRunProjectMutation`
     invalidating the runs query. (Follows the app's mutation conventions.)

## Work breakdown (can be split across subagents)

**A. Context + switcher re-semantic** (frontend)
- `ProjectProvider.tsx`: keep the shape but update doc/semantics; ensure default is
  `null`=no-project; keep unknown-cookie guard.
- `ProjectSwitcher.tsx`: replace the `ALL_PROJECTS`/`switcherAll` option with a
  `switcherNoProject` ("Bez projektu") option mapped to `null`; real projects below.
  Give the Dropdown a sensible size (it already uses the DS Dropdown — note phase 10 gave
  Dropdown a `size` prop; use it if the top bar needs sizing parity).
- i18n: replace `switcherAll` usage with `switcherNoProject` in `cs.json`/`en.json`
  (keep `switcherAll` key removal or repurpose — verify no other consumer).

**B. Scoping sites** (frontend) — update all four to the new semantics:
- `runs/Screen.tsx`: new filter (real → byId, null → unattributed). **Remove** the
  in-screen `?project=` dropdown (`:77,:92,:160-173`) — top bar is the single selector.
- `memory/Screen.tsx:52-64`, `overview/components/ApprovalsPanel.tsx:51-58`,
  `projects/components/ProjectScopeChip.tsx` (show "Bez projektu" chip too, or hide only
  as appropriate — decide: showing an explicit "Bez projektu" scope chip is clearer).

**C. New Task dialog** (frontend)
- `NewTaskDialog.tsx`: remove the project `SelectField` (:247-255) + `projectId` state;
  read active project from context; fold its `path` into `paths` when real. Keep the
  rest of the dialog behavior. Update any tests that assert the project field.

**D. Reassignment** (contract → api → web) — the one genuinely new capability:
- `libs/contracts` tasks contract + schema: add the PATCH endpoint + input/response.
- `apps/api` tasks module: implement, persist projectId to the run/scheduled-task files,
  add an e2e mirroring the reference resource flow.
- `apps/web`: `useAssignRunProjectMutation` + a "Zařadit do projektu" control in
  `RunDetail` for unattributed runs; invalidate runs query.

## Files touched (primary)
- `apps/web/features/projects/context/ProjectProvider.tsx`
- `apps/web/features/projects/components/ProjectSwitcher.tsx`
- `apps/web/features/runs/Screen.tsx`
- `apps/web/features/memory/Screen.tsx`
- `apps/web/features/overview/components/ApprovalsPanel.tsx`
- `apps/web/features/projects/components/ProjectScopeChip.tsx`
- `apps/web/features/tasks/components/NewTaskDialog.tsx` (+ `useTaskSubmit.ts`)
- `apps/web/i18n/messages/{cs,en}.json`
- `libs/contracts/src/tasks/*` (reassignment endpoint) + `apps/api/src/tasks/*` + e2e
- `apps/web/features/runs/{mutations,components}/*` (assign mutation + RunDetail control)

## Verification
- `pnpm lint` (scoped to changed files — repo-wide has pre-existing design/ mockup
  errors), `pnpm typecheck`, `pnpm test` (+ `pnpm api:test` / e2e for D), all green
  modulo the known pre-existing Czech-locale test failures (confirm via `git stash`).
- Manual: selector always shows a value; picking a project hides other projects' runs;
  "Bez projektu" shows only unattributed runs; global screens (agents/skills/pipelines/
  memory) unaffected by selection except memory scoping as designed; New Task dialog has
  no project field and attributes to the active project; an unattributed run can be
  assigned into a project from its detail and then appears under that project.

## Sequencing note
Parts A+B+C are tightly coupled (same semantic change) → one coherent frontend subagent.
Part D (contract/api/web reassignment) is separable → a second subagent (backend-leaning)
can run after A–C land, or in parallel via worktree isolation since it touches different
files (contracts/api + new web mutation) apart from a small RunDetail addition.

## Depends-on / enables
- Enables Phase 25 (system logo swaps to the selected project's `logo`; the "no project"
  case falls back to the z.i.b.b.y brand).
- Overlaps NewTaskDialog with the later CommandLine phase — do this first; the CommandLine
  redesign then inherits "project from top bar".
