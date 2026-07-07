# Company entity — master plan (TODO item 12), phases 68–72

> TODO: introduce a **Company** (firma) super-entity above Project. The operator's brainstorm decisions
> (TODO.md, "Rozhodnutí z brainstormingu") are BINDING. This master plan breaks the work into 5
> contract-first phases and fills the gaps the operator flagged: **error handling, testing, migration.**
> Each phase = its own subagent + commit (the operator confirmed multiple commits are fine).

## Binding decisions (from the brainstorm — do not reopen)
1. Company is a full entity with its own detail page `/companies/:id` — not just a Project attribute.
2. `companyId` on Project is OPTIONAL — standalone projects (no company) must keep working exactly as today.
3. Override semantics = merge/augment, NOT full replace:
   - **people**: company has a canonical roster; a project matches/overrides company people BY PERSON `id`
     (which ProjectPerson lacks today — add it), and may add its own people.
   - **budget**: company has a default `ProjectBudgetSchema`; project inherits fields it didn't set,
     overrides fields it did (FIELD-LEVEL merge, not all-or-nothing).
   - **integrations**: an Integration gains optional `companyId`, mutually exclusive with `projectId`
     (belongs to a company OR a project). A project's effective integrations = company's + project's, merged
     by `kind`: same-kind → project wins; different kinds → union.
4. Merge is computed AT READ TIME in the service layer (same idiom as the computed `hasSecrets` on Project)
   — company data is never copied into projects; editing the company reflects live in all linked projects.

## Cross-cutting decisions (filling the flagged gaps)

### Migration / person id (decision: OPTIONAL id + read-time backfill — NO destructive migration)
Adding a REQUIRED `id` to `ProjectPersonSchema` would make every existing person in `_projects.json`
fail validation, and `ProjectsStorageService.list()` DROPS schema-invalid entries → silent people loss.
So: **`ProjectPerson.id` is added as OPTIONAL** in the schema (existing data still validates), and the
storage layer **backfills a stable id where missing** (deterministic: slugify(name) + a dedupe suffix on
collision), persisting it on the next write. The merge matches by `id` when both sides have one, falling
back to case-insensitive `name` match when a side lacks an id (older data mid-backfill). This is safe,
reversible, and loses no data. Document the backfill rule in code.

### Error handling
- Companies storage mirrors projects: `CompanyNotFoundError` (404) / `CompanyConflictError` (409, dup id),
  atomic write, schema-invalid records dropped from `list()` (not a hard failure), corrupt manifest → `[]`.
- Deleting a company that still has linked projects: DECISION — **allow delete, projects keep their now-
  dangling `companyId`** and the resolver treats an unknown `companyId` as "no company" (merge falls back to
  raw project data) rather than 500ing. (Simpler than cascade; a dangling id is harmless at read time.)
  The web can warn "N projects reference this company" but the API doesn't block. Add a test for the
  unknown-`companyId` resolve path.
- Integration "exactly one owner": a zod `.superRefine` on Integration (and Create) enforcing exactly one
  of `projectId`/`companyId` is set → a clear validation error (422) otherwise. Test both violations
  (neither set, both set).

### Testing strategy
- Contracts: schema unit tests (round-trip company; project with/without companyId; ProjectPerson with/
  without id; Integration owner refinement both-ways).
- API: companies e2e (CRUD, 404/409) mirroring the projects/health e2e; storage service unit tests
  (backfill, atomic write, drop-invalid); resolver unit tests (each merge rule + dangling companyId).
- Web: query/mutation + detail-page component tests mirroring projects; a projects-detail test for the
  company selector + effective-data display.

## Phase breakdown

### Phase 68 — Contracts (foundation, contract-first)
`libs/contracts/src/companies/company.schema.ts`:
- `CompanyIdSchema` (reuse the `ProjectIdSchema`/`AgentIdSchema` rules — filename-safe id).
- `CompanySchema`: `id`, `name`, `desc?`, `people?: ProjectPersonSchema[]` (canonical roster),
  `budget?: ProjectBudgetSchema` (default budget). Keep it a superset-friendly, `.strict()`-where-sensible
  shape mirroring Project's structure. `CreateCompanySchema` / `UpdateCompanySchema` (omit id on update,
  partial) mirroring the project ones.
`libs/contracts/src/companies/companies.contract.ts`: `companiesContract` = CRUD (`POST /companies`,
`GET /companies`, `GET /companies/search?q`, `GET /companies/:id`, `PATCH /companies/:id`,
`DELETE /companies/:id`) — mirror `projects.contract.ts` verbatim in shape (search declared before `:id`).
- `ProjectPersonSchema`: add `id: z.string().min(1).optional()` (see migration decision).
- `ProjectSchema`: add `companyId: z.string().optional()`.
- `IntegrationSchema` + `CreateIntegrationSchema`: make `projectId` OPTIONAL, add `companyId: z.string().min(1).optional()`, add a `.superRefine` enforcing exactly one of the two is set; delete/rewrite the stale
  "one project = one company" comment on the field.
- Barrel exports in `libs/contracts/src/index.ts` (and any per-dir index) for the new company schema/
  contract. Register `companiesContract` wherever the root contract aggregates sub-contracts (grep how
  `projectsContract` is composed into the app contract).
- Schema tests as above.
⚠️ Making `Integration.projectId` optional is a TYPE ripple — every `.projectId` consumer in apps/api/apps/web
now sees `string | undefined`. Phase 68 only changes the contract + fixes resulting *type* errors minimally
(e.g. guards); the real per-owner behavior lands in phase 70. Run a full `tsc` and fix all fallout.

### Phase 69 — API companies module + person-id backfill
- `apps/api/src/companies/`: `companies.module.ts`, `companies.controller.ts` (@ts-rest/nest against
  `companiesContract`), `companies.storage.service.ts` (atomic `_companies.json` in `dataDir("companies")`,
  mirror `ProjectsStorageService`), `companies.errors.ts`. Wire the module into the app module + the
  aggregated ts-rest router. e2e mirroring projects/health.
- Person-id backfill in `ProjectsStorageService` (+ companies storage): on `list()`, assign a stable id to
  any person missing one; persist on next write. Unit test the backfill + collision dedupe.

### Phase 70 — Resolved project context service (the merge)
- A service/util (e.g. `apps/api/src/projects/resolved-project.service.ts`) computing a project's EFFECTIVE
  people / budget / integrations by merging its company (if `companyId` resolves) per the rules above.
- Find every read site of raw project people/budget/integrations (grep: budget enforcement in the scheduler/
  budget ledger, people/VIP in triage, integrations listing/among channel adapters) and route them through
  the resolver. Where a full sweep is too broad for one phase, do the highest-value sites (budget +
  integrations for channel/dispatch) and LOG/note any deferred read sites explicitly — no silent partial.
- Unit tests for each merge rule + the dangling-`companyId` fallback.

### Phase 71 — Web companies feature
- `apps/web/features/companies/`: `queries/`+`mutations/` (mirror projects hooks, `selectApiResponseBody`,
  query-key exports), `/companies/:id` detail page (roster/budget/integrations editing + list of member
  projects), a companies list page + nav entry. Component tests mirroring projects.

### Phase 72 — Web projects ↔ company
- Project detail: a company selector (set/clear `companyId`) and a view of EFFECTIVE (merged) people/budget/
  integrations vs the project's own raw values (make the distinction legible). Tests.

## Global constraints (every phase)
- Contract-first: `libs/contracts` changes land first, api/web consume. React 19 (NO forwardRef), no `any`,
  no raw inline DOM `style` in apps/web. Do NOT run `git stash` (shared tree). Do NOT git commit — the
  caller commits. Standalone (company-less) projects MUST behave exactly as today at every step. Do NOT
  touch unrelated operator WIP (`.zibby/data/**`, `PipelineStageTimeline.tsx`, run-detail files beyond what
  a phase needs, chat internals, `machine.*`, `design/*`). The pre-commit self-knowledge drift gate may
  complain about `.zibby/data/agents/_categories.json` — ignore it.
- Verify each phase: `npx tsc -p apps/web/tsconfig.json --noEmit` + the api/contracts typecheck, scoped
  eslint, and `rtk proxy npx vitest run <touched dirs>` — green modulo documented pre-existing reds
  (RunDetail cost-cell; TaskCard ×2; apps/api pipelines.e2e ×2 per project memory). Paste real output.
