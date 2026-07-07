# Phase 72 (final) — Project ↔ Company: selector + effective-data display

> Completes TODO item 12 (Company), scope line: _"apps/web/features/projects/: detail stránky
> doplnit o výběr/zobrazení firmy a effective (sloučená) data, ne jen syrová projektová."_
> Builds on committed phases 68 (contracts), 69 (companies api), 70 (ResolvedProjectService), 71 (web
> companies feature).

## Why an API addition is needed

Phase 70 rewired INTERNAL consumers through `ResolvedProjectService` and made
`GET /integrations?projectId` return the effective (merged) integration set — but there is NO endpoint
that returns a project's effective **people** and **budget**. The web project detail currently shows the
project's own raw `identity.people` / `budget`. To DISPLAY effective merged data, expose the resolved
context.

## 1 — Contract: a resolved-project-context schema + route

`libs/contracts/src/projects/`:
- Add `ResolvedProjectContextSchema` = `{ people: z.array(ProjectPersonSchema), budget: ProjectBudgetSchema.optional(), integrations: z.array(IntegrationSchema), companyId: z.string().optional(), companyName: z.string().optional() }` (the effective roster + effective budget + effective integrations, plus which company they came from for the UI). Adjust field names to match what `ResolvedProjectService.resolve()` already returns (grep its return shape from phase 70 and mirror it — don't invent a divergent shape).
- Add a route to `projects.contract.ts`: `getResolvedProject: GET /projects/:id/resolved` → `200: ResolvedProjectContextSchema, 404: ErrorSchema`. Declare it so it doesn't collide with `/projects/:id` (a distinct suffix `/resolved`, fine). Export the schema from the barrel.
- Schema round-trip test.

## 2 — API: implement the route

`apps/api/src/projects/projects.controller.ts` — implement `getResolvedProject`: load the project
(`ProjectsStorageService.get` → 404 if missing), then return `ResolvedProjectService.resolve(project)`
(injected — it's already a provider from phase 70's module; wire it into the projects controller/module,
minding the existing `forwardRef` cycle — if injecting it into `ProjectsModule` reintroduces the
`IntegrationsModule` cycle, inject via the same `forwardRef`/`ResolvedProjectModule` seam phase 70
established). Shape the response to `ResolvedProjectContextSchema`. Add a controller/e2e test: a project
with a company returns merged people/budget/integrations; a company-less project returns its own; 404 for
unknown id.

## 3 — Web: company selector + effective-data display

`apps/web/features/projects/` (project detail — grep the detail screen, likely `ProfileScreen.tsx` /
`DetailScreen.tsx`):
- **Company selector**: a control to set/clear the project's `companyId` — a DS `SelectField` populated
  from `useCompaniesQuery()` (phase 71), with a "no company" option. On change, call the existing
  `useUpdateProjectMutation` with `{ companyId }` (or clear). Place it consistently with the rest of the
  project detail (one-interaction-grammar). Add i18n labels (cs primary).
- **Effective data display**: add a `useResolvedProjectQuery(id)` hook (features/projects/queries, mirror
  the other query hooks, `selectApiResponseBody`, query-key export) hitting `GET /projects/:id/resolved`.
  On the project detail, show the EFFECTIVE (merged) people / budget / integrations, making the
  distinction from the project's own raw values legible (e.g. a "from company X" note, or an
  effective-vs-own toggle/section). Keep it simple and honest: when the project has no company, effective
  == own (don't imply a merge that didn't happen). The member-projects placeholder left in phase 71's
  company DetailScreen can also be filled now if cheap (list projects whose companyId == this company via
  `useProjectsQuery` filtered) — optional; if you do it, keep it a small addition.
- Tests: the selector sets companyId via the mutation; the effective panel renders merged data from the
  resolved query (mock it); company-less project shows own data.

## Verification (run, paste real output)
- `npx tsc -p libs/contracts/tsconfig.json --noEmit` / `apps/api` (only the 2 pre-existing machine errors) /
  `apps/web` — clean.
- `npx eslint` on touched dirs — clean.
- `rtk proxy npx vitest run libs/contracts apps/api/src/projects apps/web/features/projects apps/web/features/companies` — green modulo documented pre-existing reds (RunDetail cost-cell; TaskCard ×2; PipelineCard last-run; chat KNOWN GAP; apps/api self-knowledge drift from the operator's `_categories.json`; pipelines.e2e ×2). Confirm any NEW red is yours and fix it.

## Constraints
- Contract-first (contract → api → web). React 19 (NO forwardRef in components), no `any`, DS-composed,
  no raw inline DOM `style` in apps/web, TanStack Query conventions. Do NOT run `git stash`. Do NOT git
  commit. Company-less projects must behave exactly as before. Do NOT touch `.zibby/data/**`, `machine.*`,
  run-detail/chat files, `design/*`. The pre-commit drift gate about `_categories.json` — ignore.
