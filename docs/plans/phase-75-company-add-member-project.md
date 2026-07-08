# Phase 75 — Company detail: link an existing project or create a new linked one

> Completes TODO item 3: _"Stránka detailu firmy — měl bych být schopný v sekci projektů
> přidat již existující projekt přes tlačítko „+" nebo vytvořit nový projekt, který bude
> rovnou propojený s firmou."_

## Current state

`apps/web/features/companies/DetailScreen.tsx` already renders a **read-only** "Projekty firmy"
panel (`memberProjectsPanel`, Phase 72): the reverse lookup over `useProjectsQuery()` for
projects whose `companyId === id`, shown as clickable `Tag`s. There is no way to ADD a project
to the company from here. Linking exists only from the other side — `ProjectCompanyPanel` on the
project detail screen sets a project's `companyId` via `useUpdateProjectMutation`.

Project creation is `ProfileScreen` (`apps/web/features/projects/ProfileScreen.tsx`) at
`/projects/new`; on save it calls `createProject.mutate({ body: { ...body, id: newId } })`. It
already imports `useSearchParams`. There is no company pre-link on create today.

## Deliverables

### 1 — Create-new-project pre-linked to the company

In `ProfileScreen.tsx` `saveBasics()` create branch, read an optional `companyId` from the URL
and include it in the create body:

```ts
const linkCompanyId = searchParams.get("companyId") || undefined;
createProject.mutate(
  { body: { ...body, id: newId, ...(linkCompanyId ? { companyId: linkCompanyId } : {}) } },
  { onSuccess: () => router.replace(`/projects/${newId}`) },
);
```

`companyId` is already an optional field on `CreateProjectSchema` (`ProjectSchema`) — no contract
change. So navigating to `/projects/new?companyId=<id>` creates a project already linked. Add a
small, honest affordance in new-mode so the operator sees the pending link: when `isNew` and
`linkCompanyId` is present, render a `Tag`/note near the basics panel header — e.g.
`t("newProjectLinkedTo", { company: <name> })` — resolving the company name via
`useCompaniesQuery()` (it's cheap and already used elsewhere). Keep it subtle; don't block create
if the company id is unknown (dangling id resolves as "no company" downstream anyway).

### 2 — "Add existing project" + "Create new project" actions on the company panel

In `DetailScreen.tsx`, give the `memberProjectsPanel` an `action` (HudPanel already supports an
`action` slot — see `teamPanel`). Use a DS `DropDownButton` (`libs/design-system/.../DropDownButton`)
with two items — or, if a dropdown is heavier than needed, two small `Button`s side by side.
One-interaction-grammar: a single `+`-triggered control is cleaner. Items:

- **Přidat existující projekt** → opens a new `LinkProjectDialog` (below).
- **Vytvořit nový projekt** → `router.push(\`/projects/new?companyId=${id}\`)` (reuses part 1).

### 3 — `LinkProjectDialog` (new component)

`apps/web/features/companies/components/LinkProjectDialog.tsx` (+ `.test.tsx`). A DS `Dialog`
(see `apps/web/components/CategoryDialog/CategoryDialog.tsx` and
`apps/web/features/chains/components/NewChainDialog.tsx` for the dialog+select pattern):

- Props: `{ companyId, onClose }`. Reads `useProjectsQuery()`.
- **Candidates** = projects whose `companyId !== companyId` (i.e. unlinked or linked to a
  different company). If a candidate is linked elsewhere, still allow it but that's an edge case
  — keep it simple: list every project not already in this company. If there are zero candidates,
  show an empty state (`t("...linkDialog.noCandidates")`) and only a close button.
- A DS `SelectField` to choose one candidate (value = project id, label = project name); a
  primary "Propojit" button (disabled until a selection) calls
  `useUpdateProjectMutation().mutate({ params: { id: selectedProjectId }, body: { companyId } }, { onSuccess: onClose })`.
  The update-project mutation hook already invalidates the projects list query (confirm in
  `useUpdateProjectMutation.ts`), so the member panel refreshes automatically — no manual refetch.
- Dialogs are for creating/confirming only (grammar): this one confirms a link. Wire `data-testid`s
  and give the select an accessible label. i18n via the `companies.memberProjects.linkDialog.*` keys.

### 4 — i18n

Add to BOTH `apps/web/i18n/messages/cs.json` (primary) and `en.json`, under
`companies.memberProjects`:
- `addExisting` ("Přidat existující projekt" / "Add existing project")
- `createNew` ("Vytvořit nový projekt" / "Create new project")
- `add` (the `+` button aria/label, e.g. "Přidat projekt" / "Add project")
- `linkDialog`: `{ title, subtitle, selectLabel, placeholder, confirm, cancel(optional, reuse common.cancel), noCandidates }`
And under `projects` (or `projects.profile`): `newProjectLinkedTo` ("Nový projekt bude propojen s firmou {company}" / "New project will be linked to {company}").

## Files

- `apps/web/features/projects/ProfileScreen.tsx` (create body pre-link + new-mode note)
- `apps/web/features/companies/DetailScreen.tsx` (panel action + dialog wiring + state)
- `apps/web/features/companies/components/LinkProjectDialog.tsx` (new) + `.test.tsx`
- `apps/web/features/companies/components/index.ts` if a barrel exists (export)
- `apps/web/i18n/messages/cs.json` + `en.json`

## Tests

- `LinkProjectDialog`: lists only non-member projects; selecting one + confirm calls the update
  mutation with `{ params: { id }, body: { companyId } }`; zero candidates → noCandidates empty
  state, no select. (Mock `useProjectsQuery` / `useUpdateProjectMutation` per the existing test
  patterns in the companies/projects features.)
- `DetailScreen` (extend `DetailScreen.test.tsx`): the member panel shows the add control;
  clicking "Vytvořit nový projekt" navigates to `/projects/new?companyId=<id>` (assert
  `router.push`); the add-existing action opens the dialog.
- `ProfileScreen` (extend `ProfileScreen.test.tsx`): in new mode with `?companyId=acme`, saving
  basics calls `createProject.mutate` with `companyId: "acme"` in the body.

## Verification (run, paste real output; `rtk` is NOT available — use plain npx)

- `npx tsc -p apps/web/tsconfig.json --noEmit` — clean.
- `npx eslint <touched files>` — clean.
- `npx vitest run apps/web/features/companies apps/web/features/projects` — green modulo
  documented pre-existing reds (TaskCard ×2, PipelineCard last-run, RunDetail cost-cell — none in
  these dirs, so effectively fully green). Any NEW red is yours.

## Constraints

- Contract-first: no schema change needed (`companyId` already optional on create/update). If you
  find you need one, stop and reconsider — you shouldn't.
- DS-composed only (Dialog, SelectField, DropDownButton, Button, Tag, HudPanel). No raw `<img>`,
  no inline `style` on DOM in apps/web. React 19 (no forwardRef). No `any`. cs is the primary
  locale; keep en in sync. Follow the TanStack Query conventions (mutation invalidation lives in
  the hook).
