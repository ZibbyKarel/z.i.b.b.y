# Phase 77 — Web UX for the per-machine clone lifecycle

> Continues TODO item 4: the **web** side of point **1** (Settings clone-root field) and point
> **2** (missing-clone detection banner + clone action + `gitRemote` field). Consumes the
> contracts/endpoints added in phase 76: `gitRemote` on `Project`; `GET /machine/config` +
> `PUT /machine/config`; `GET /projects/:id/local-state`; `POST /projects/:id/clone`.

> Depends on phase 76 being merged/committed on the branch. Read the phase-76 plan +
> the actual committed contracts before starting.

## 1 — Machine config (clone root) in Settings

New web feature `apps/web/features/machine/` (mirror `features/system/` structure):
- `queries/useMachineConfigQuery.ts` — `apiClient.machine.getMachineConfig.useQuery`, key
  `["machine-config"]`, `select: selectApiResponseBody`; export `getMachineConfigQueryKey`.
- `mutations/useUpdateMachineConfigMutation.ts` — `apiClient.machine.updateMachineConfig`,
  `onSuccess` invalidates the config key (and the projects local-state family, key prefix
  `["project-local-state"]`, since changing the root changes resolution).
- barrels + `index.ts`.

Settings UI: add `apps/web/features/settings/components/MachineSection.tsx` (mirror
`SystemSection.tsx`'s load→seed→save-whole-doc pattern). One `TextInputField` for `cloneRoot`
(the per-machine root ZIBBY clones projects into; default is the parent of the ZIBBY install —
show that as the placeholder/hint), a Save button, a `MachineSectionTestId` enum. Mount it in
`settings/Screen.tsx` — add a section under the appropriate tab (System, or a new "Stroj" tab if
that reads better; match the existing tab grammar). i18n keys under `settings.machine.*`
(`title`, `cloneRootLabel`, `cloneRootHint`, `save`) in cs.json (primary) + en.json.

## 2 — `gitRemote` field on the project basics editor

`apps/web/features/projects/components/ProjectBasicsPanel.tsx`:
- Add `gitRemote?: string` to `ProjectBasicsBody`.
- Add a `TextInputField name="gitRemote"` (optional) near `path` — label `t("fields.gitRemote")`,
  hint `t("fields.gitRemoteHint")` ("Git remote URL — odkud ZIBBY projekt naklonuje na dalším
  stroji"), placeholder e.g. `git@github.com:org/repo.git`. Seed from `project?.gitRemote ?? ""`.
- Include it in `onSave` (trim → `undefined` when empty).
- i18n: add `projects.fields.gitRemote` + `gitRemoteHint` (+ placeholder) to cs + en.
- Extend `ProjectBasicsPanel.test.tsx`: the field seeds from the project and is submitted.

## 3 — Local-state query + clone mutation (projects)

`apps/web/features/projects/`:
- `queries/useProjectLocalStateQuery.ts` — `apiClient.projects.getProjectLocalState.useQuery`,
  key `["project-local-state", id]` (add to `queries/keys.ts` if that's where keys live), enabled
  when `id` present, `select: selectApiResponseBody`. Export `getProjectLocalStateQueryKey(id)`.
- `mutations/useCloneProjectMutation.ts` — `apiClient.projects.cloneProject`; `onSuccess`
  invalidates `["project-local-state", id]` and the projects list key. Return the mutation
  directly (no wrapping — TanStack convention).
- re-export from the queries/mutations barrels.

## 4 — Missing-clone banner + clone action on the project detail

`apps/web/features/projects/ProfileScreen.tsx` (the project detail, non-new mode):
- Call `useProjectLocalStateQuery(id)`.
- When `data && !data.present`: render a prominent WARNING banner at the top of the detail body
  (use a DS primitive that reads as a warning — e.g. `HudPanel` with a warn tone / `Callout` /
  `StatusDot` — grep the DS for the established "warning banner" pattern; do NOT invent inline
  styles). Copy: `t("localState.missingTitle")` + `t("localState.missingBody", { target: data.resolvedPath ?? cloneTarget })`
  explaining the canonical `path` doesn't exist on this machine, and it will be cloned into
  `<cloneRoot>/<id>`. Include a **"Klonovat"** button:
  - Enabled only when `project.gitRemote` is set; otherwise disable it and show a hint
    (`t("localState.needRemote")`) pointing the operator to set the git remote in basics.
  - On click → `useCloneProjectMutation().mutate({ params: { id } })`; show `.isPending`; on
    success the banner disappears (local-state invalidation refetches `present:true`).
- When `data?.present`: optionally a subtle confirmation (e.g. a small `Tag` "lokálně: cloneRoot"
  when `source === "cloneRoot"`, so the operator knows it's the clone not the canonical path).
  Keep it minimal.
- i18n: `projects.localState.{missingTitle,missingBody,needRemote,cloneButton,clonedFromCloneRoot,cloning}`
  in cs + en.
- Extend `ProfileScreen.test.tsx`: mock local-state `present:false` → banner + clone button
  visible; button disabled without gitRemote; clicking with gitRemote calls the clone mutation;
  `present:true` → no banner.

## 5 — Backend addendum: clone-if-missing in the run dispatch path (completes point 4)

Phase 76 deferred this. TODO point 4 requires: _"Pokud lokální klon vůbec neexistuje, nejdřív ho
naklonovat a pak pokračovat."_ Thread `ProjectLocalService` into the run-dispatch path so a run
against a project whose local clone is absent resolves/clones before `createWorktree`:
- Grep the callers of `WorkspaceService.createWorktree(` (per phase 76: `agent-runner.service.ts`,
  `goal-runner.service.ts`, `pipeline-runner.service.ts`) and the point where each decides
  `isGitRepo(project.path)`.
- Before creating the worktree: `const state = await projectLocal.resolve(project)`. If
  `!state.present && project.gitRemote` → `await projectLocal.clone(project)` then re-resolve;
  use `state.resolvedPath` as the `projectPath` passed to `createWorktree`. If `!state.present &&
  !project.gitRemote` → fail the run with a clear message (surfaced to the operator: set a git
  remote or clone manually). If `state.present` → use `state.resolvedPath` (which may be the
  cloneRoot copy, not `project.path`).
- Keep it minimal and shared: if the three runners already funnel through one helper, change it
  once; otherwise a small shared helper (e.g. on `ProjectLocalService.resolveForRun(project)`
  returning the path or throwing) invoked by each. Inject `ProjectLocalService` where needed
  (its module is a leaf — no cycle, per phase 76).
- Tests: a run against an absent-clone project with `gitRemote` triggers `clone` then uses the
  cloned path; without `gitRemote` fails clearly; present project uses `resolvedPath`.

This is backend work in the same phase as the web clone UX — do it in the same commit or a second
commit on the branch; either is fine.

## Note on ProjectCard

Do NOT add a per-card local-state query (it would be N requests on the projects list). Keep the
detection on the detail screen. If a lightweight card indicator is desired later, it needs a
batch endpoint — out of scope here. Mention this decision in your report.

## Files

- `apps/web/features/machine/` (new: queries, mutations, index)
- `apps/web/features/settings/components/MachineSection.tsx` + `settings/Screen.tsx`
- `apps/web/features/projects/components/ProjectBasicsPanel.tsx` (+ test)
- `apps/web/features/projects/queries/useProjectLocalStateQuery.ts`, `queries/keys.ts`, barrels
- `apps/web/features/projects/mutations/useCloneProjectMutation.ts`, barrel
- `apps/web/features/projects/ProfileScreen.tsx` (+ test)
- `apps/web/i18n/messages/cs.json` + `en.json`

## Verification (run, paste real output; `rtk` unavailable → plain npx)

- `npx tsc -p apps/web/tsconfig.json --noEmit` — clean.
- `npx eslint <touched files>` — clean.
- `npx vitest run apps/web/features/projects apps/web/features/settings apps/web/features/machine`
  — green modulo documented pre-existing reds (none in these dirs → aim fully green). Any NEW
  red is yours.

## Constraints

- Consumes phase-76 contracts only — NO contract changes here (if a field is missing, phase 76 is
  the place; flag it, don't patch the contract from the web).
- DS-composed only; no raw `<img>`/inline `style` in apps/web; React 19 (no forwardRef); no `any`.
- TanStack Query conventions: one hook per file, return the query/mutation directly,
  `selectApiResponseBody`, invalidation in the mutation hook, exported query-key helpers.
- cs is primary; keep en in sync.
