# Teams (the layer between Company and Project)

**Task 2 of the team-knowledge-base plan.** A team sits between `Company` and
`Project`: many teams per company, at most one company per team, and a
project optionally points at one team via `Project.teamId`. In v1 a team owns
no roster and no budget — those stay on `Company`/`Project`. What a team
uniquely owns is a **read-only knowledge base** (`knowledgeBase`), the seed
for team-scoped grounding that a later task wires up for actual reads.

## Pieces

| Piece      | File                                          | Role                                                                              |
| ---------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/teams/team.schema.ts`     | `TeamSchema`, `CreateTeamSchema`, `UpdateTeamSchema`, `KnowledgeBaseSourceSchema` |
| Contract   | `libs/contracts/src/teams/teams.contract.ts`  | `teamsContract` — CRUD + search, `/api/teams`                                     |
| Service    | `apps/api/src/teams/teams.storage.service.ts` | `TeamsStorageService` — JSON-manifest CRUD                                        |
| Controller | `apps/api/src/teams/teams.controller.ts`      | implements `teamsContract`                                                        |
| Errors     | `apps/api/src/teams/teams.errors.ts`          | `TeamNotFoundError`, `TeamConflictError`                                          |
| Module     | `apps/api/src/teams/teams.module.ts`          | wires the manifest dir, exports the storage service                               |

## Data model

`TeamSchema` (`libs/contracts/src/teams/team.schema.ts`):

```typescript
{
  id: string;                        // filename-safe, reuses AgentIdSchema's rules
  name: string;
  companyId?: string;                 // bare optional string — same dangling-ref
                                       // tolerance as Project.companyId, resolved
                                       // to "no company" at read time
  desc?: string;
  knowledgeBase?: KnowledgeBaseSource; // where the team's read-only KB lives
}
```

Deliberately **no `people` and no `budget`** — a team has no roster or budget
of its own in v1 (unlike `Company`), so `TeamsStorageService` has no
person-id-backfill step (`CompaniesStorageService`'s `backfillCompanyPersonIds`
has no analogue here).

`KnowledgeBaseSourceSchema` is a discriminated union on `kind`, with a single
member today (`kind: "vault"` — an absolute host path plus `readOnly: true`).
`readOnly` is a **literal `true`**, not a boolean: read-only is structural
(the system-wide Law 1 gate), not a setting an operator can weaken — nothing
in the system has a write tool for a knowledge base. The union exists from
day one so a future `kind: "confluence"` company-level source can be added
without disturbing `kind: "vault"`.

`CreateTeamSchema` is the full entity (`id` + `name` required).
`UpdateTeamSchema` is `TeamSchema.omit({ id: true }).partial()`, deliberately
**not** `.strict()` (matching `UpdateCompanySchema`'s shape), with `companyId`
and `knowledgeBase` re-widened to also accept `null` — the explicit "clear
this field" signal (mirrors `UpdateProjectSchema.companyId`). A JSON PATCH
body silently drops `undefined`-valued keys on the wire, so `null` is the only
way to express "unset" for an already-linked team; an absent key still means
"leave the current value alone". `TeamsStorageService.update` branches on
`"companyId" in patch` / `"knowledgeBase" in patch` to tell "clear" (`null`)
apart from "leave alone" (absent) before re-parsing against `TeamSchema`
(whose own `companyId`/`knowledgeBase` stay `string | undefined` /
`KnowledgeBaseSource | undefined` — never `null` — so a present `null` is
translated to `undefined` before the merge).

## Storage

`TeamsStorageService` is a byte-for-byte mirror of `CompaniesStorageService`,
minus the person-roster backfill: a single JSON manifest (`_teams.json`) in a
configurable directory (`TEAMS_DIR`, default `apps/api/data/teams`), sorted by
id, atomic writes (temp file + rename). A fresh install starts empty; the
manifest is created on the first `create`.

- `list()` drops schema-invalid entries rather than failing the whole listing
  (mirrors the companies/agent/project listings).
- **Deleting a team that still has projects pointing at it via `teamId` is
  allowed — no cascade.** The dangling `teamId` resolves to "no team" at read
  time, mirroring the binding companies decision (Phase 69/70): a project with
  no team must behave exactly as one whose team was deleted out from under it.

## Endpoints (`/api/teams`)

```
POST   /teams            create a team
GET    /teams             list all teams
GET    /teams/search?q=   free-text search (id, name, desc) — declared
                          BEFORE getTeam so it isn't captured by :id
GET    /teams/:id         get one team
PATCH  /teams/:id         partial update
DELETE /teams/:id         delete (allowed with linked projects — no cascade)
```

`TeamsController` mirrors `CompaniesController` in shape: `deleteTeam` reads
the team first (`storage.get(id)`) so a 404 surfaces before any side effect,
then deletes.

## Wired into the rest of the system

- **`app.module.ts`** — `TeamsModule` is registered beside `CompaniesModule`.
- **`projects` module** — `Project.teamId` is a bare optional string today (no
  resolver reads it yet); a later task is expected to add the same kind of
  read-time resolution `ResolvedProjectService` already does for `companyId`.
  See `docs/api/projects.md`.

## Gotchas

- A team's `id` reuses `AgentIdSchema`'s validation (filename-safe, no path
  separators/traversal) — same rules as `Company.id`/`Project.id`/`Agent.id`.
- No cascade on delete, ever — this module never consults `projects` before
  deleting, by design (see Storage above).
- No vault mirror of its own today: a team's knowledge base is a pointer
  (`knowledgeBase`) into an existing external location (a vault path), not a
  file this module writes or owns.
