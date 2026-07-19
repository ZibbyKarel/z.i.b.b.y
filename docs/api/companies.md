# Companies (the super-entity above Project)

**Phase 68-72.** A company (firma) is the registry entity above `Project`: a
canonical people roster and a default budget shared by every project linked to
it. A linked project's EFFECTIVE people/budget/integrations are computed at
**read time** by merging the company's data with the project's own — the
company record is never copied into the project. That merge lives in the
`projects` module (`ResolvedProjectService` — see `docs/api/projects.md`);
this module only owns the company's own data.

## Pieces

| Piece      | File                                                  | Role                                                          |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| Contract   | `libs/contracts/src/companies/company.schema.ts`      | `CompanySchema`, `CreateCompanySchema`, `UpdateCompanySchema` |
| Contract   | `libs/contracts/src/companies/companies.contract.ts`  | `companiesContract` — CRUD + search, `/api/companies`         |
| Service    | `apps/api/src/companies/companies.storage.service.ts` | `CompaniesStorageService` — JSON-manifest CRUD                |
| Controller | `apps/api/src/companies/companies.controller.ts`      | implements `companiesContract`                                |
| Errors     | `apps/api/src/companies/companies.errors.ts`          | `CompanyNotFoundError`, `CompanyConflictError`                |
| Module     | `apps/api/src/companies/companies.module.ts`          | wires the manifest dir, exports the storage service           |

## Data model

`CompanySchema` (`libs/contracts/src/companies/company.schema.ts`):

```typescript
{
  id: string;           // filename-safe, reuses AgentIdSchema's rules
  name: string;
  desc?: string;
  people?: ProjectPerson[];   // canonical roster: team, clients, stakeholders
  budget?: ProjectBudget;     // default per-engagement budget
}
```

`people` and `budget` reuse the exact same `ProjectPersonSchema`/`ProjectBudgetSchema`
types a `Project` uses (`libs/contracts/src/projects/project.schema.ts`) — a company
is shaped like a project's operational profile one level up, so the merge in
`ResolvedProjectService` is a straightforward field-level/roster overlay, not a
type translation.

`CreateCompanySchema` is the full entity (`id` + `name` required). `UpdateCompanySchema`
omits `id` and makes every other field optional (a PATCH body).

## Storage

`CompaniesStorageService` is a byte-for-byte mirror of `ProjectsStorageService`
(Phase 69's "mirrors ProjectsStorageService verbatim"): a single JSON manifest
(`_companies.json`) in a configurable directory (`COMPANIES_DIR`, default
`apps/api/data/companies`), sorted by id, atomic writes (temp file + rename).
A fresh install starts empty; the manifest is created on the first `create`.

- `list()` drops schema-invalid entries rather than failing the whole listing
  (mirrors the agent/pipeline/project listings), and backfills missing
  `people[].id`s via the shared `backfillPersonIds` helper (same Phase 69
  migration decision `ProjectPersonSchema` documents).
- **Deleting a company that still has projects pointing at it is allowed — no
  cascade.** The dangling `companyId` resolves to "no company" at read time
  (`ResolvedProjectService.findCompany` catches the 404 and returns `null`).

## Endpoints (`/api/companies`)

```
POST   /companies            create a company
GET    /companies             list all companies
GET    /companies/search?q=   free-text search (id, name, desc) — declared
                               BEFORE getCompany so it isn't captured by :id
GET    /companies/:id         get one company
PATCH  /companies/:id         partial update
DELETE /companies/:id         delete (allowed with linked projects — no cascade)
```

`CompaniesController` mirrors `ProjectsController` in shape: `deleteCompany`
reads the company first (`storage.get(id)`) so a 404 surfaces before any side
effect, then deletes.

## Wired into the rest of the system

- **`projects` module** — `ResolvedProjectService` (`apps/api/src/projects/resolved-project.service.ts`)
  injects `CompaniesStorageService` to resolve a project's `companyId` into
  its effective people/budget/integrations at read time. See `docs/api/projects.md`.
- **Web** — `apps/web/features/companies/` is the data layer (`queries/`,
  `mutations/`), consumed by `DetailScreen.tsx` (company profile: basics panel,
  people roster editor, and a "member projects" reverse lookup — every project
  whose `companyId` points at this company, filtered client-side over the
  already-fetched project list) and `Screen.tsx` (the company list). The web
  index (`apps/web/features/companies/index.ts`) deliberately never re-exports
  the screens — only the query/mutation hooks — mirroring `features/projects`,
  so importing the data layer never drags in the view graph.

## Gotchas

- A company's `id` reuses `AgentIdSchema`'s validation (filename-safe, no path
  separators/traversal) — same rules as `Project.id` and `Agent.id`.
- `people`/`budget` merges are NOT implemented in this module — they live in
  `projects/resolved-project.helpers.ts` as pure, independently-unit-tested
  functions (`mergePeople`, `mergeBudget`, `mergeIntegrationsByKind`). This
  module only stores and serves the company's own raw data.
- No vault mirror: unlike `Project` (`ProjectVaultService` writes a grounding
  note per project), a company has no vault note of its own today.
