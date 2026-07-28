# Projects (the target-directory registry + per-project services)

The catalog of target directories agents, skills and pipelines run against.
A project is a **registry entry** (`_projects.json`), not files of its own —
deleting a project removes only the registry record, never the files it
points at on the host. The module also owns everything that hangs off a
project: per-machine clone resolution, run secrets, a vault grounding mirror,
standup generation, GitHub PR overview/merge, and (Phase 70/72) the
company-merged "effective" context.

## Pieces

| Piece                   | File                                                                            | Role                                                                      |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Contract                | `libs/contracts/src/projects/project.schema.ts`                                 | `ProjectSchema` + profile/budget/identity sub-schemas                     |
| Contract                | `libs/contracts/src/projects/projects.contract.ts`                              | `projectsContract` — CRUD + 9 sub-resources                               |
| Contract                | `libs/contracts/src/projects/project-pr.schema.ts`                              | `ProjectPrSchema`, merge request/result shapes                            |
| Contract                | `libs/contracts/src/projects/resolved-project-context.schema.ts`                | `ResolvedProjectContextSchema` — the wire shape of the merged view        |
| Registry storage        | `apps/api/src/projects/projects.storage.service.ts`                             | `ProjectsStorageService` — JSON-manifest CRUD, logo asset externalization |
| Categories              | `apps/api/src/projects/project-categories.storage.service.ts`, `.controller.ts` | project taxonomy, `/api/projects/categories`                              |
| Controller              | `apps/api/src/projects/projects.controller.ts`                                  | implements `projectsContract`                                             |
| Errors                  | `apps/api/src/projects/projects.errors.ts`                                      | 6 typed errors (see below)                                                |
| Local-clone resolution  | `apps/api/src/projects/project-local.service.ts`                                | `ProjectLocalService` — per-machine path/clone resolution (Phase 76/77)   |
| GitHub PRs              | `apps/api/src/projects/project-pr.service.ts`                                   | `ProjectPrService` — list-open + operator-triggered merge (Phase 78)      |
| Vault mirror            | `apps/api/src/projects/project-vault.service.ts`                                | `ProjectVaultService` — writes a grounding note per project               |
| Secrets                 | `apps/api/src/projects/project-secrets.store.ts`                                | `ProjectSecretsStore` — write-only per-project secret env vars            |
| Attribution             | `apps/api/src/projects/project-matcher.ts`                                      | `matchProject` — deterministic task→project attribution (Phase 8.1)       |
| Company merge (service) | `apps/api/src/projects/resolved-project.service.ts`                             | `ResolvedProjectService` — the DB-facing merge seam (Phase 70)            |
| Company merge (pure)    | `apps/api/src/projects/resolved-project.helpers.ts`                             | pure merge rules: `mergePeople`, `mergeBudget`, `mergeIntegrationsByKind` |
| Standup                 | `apps/api/src/projects/standup.service.ts`                                      | `StandupService` — 24h activity → Yesterday/In-Progress/Blockers          |
| Modules                 | `apps/api/src/projects/projects.module.ts`, `resolved-project.module.ts`        | wiring, see "Module graph" below                                          |

## Data model (`ProjectSchema`)

```typescript
{
  id: string;                 // filename-safe (reuses AgentIdSchema)
  name: string;
  path?: string;               // host root dir — OPTIONAL (Phase 98); falls
                                // back to <cloneRoot>/<id> when absent
  desc?: string;
  category?: string;
  checks?: string[];           // pipeline verify-phase commands, joined with &&
  budget?: ProjectBudget;      // run-count + USD caps, per day/week/month + concurrency
  env?: Record<string, string>;// NON-secret env injected into this project's runs
  hasSecrets?: boolean;        // computed at read time from ProjectSecretsStore
  logo?: Avatar;                // data URI or bundled /-path; externalized on disk
  identity?: { people?: ProjectPerson[] };
  autonomy_policy?: ProjectAutonomyPolicy;  // can only HARDEN the gate floor
  daily_rhythm?: ProjectDailyRhythm;
  companyId?: string;           // Phase 68 link — see resolved-project.service.ts
  gitRemote?: string;           // Phase 76 clone source, validated (see below)
}
```

`ProjectBudgetSchema` is `.strict()` (an unknown key can never smuggle in a
fifth knob): `dailyRuns`/`weeklyRuns`/`monthlyRuns`, `maxConcurrent`, and
(Phase 12) `dailyCostCapUsd`/`weeklyCostCapUsd`/`monthlyCostCapUsd` — priced
off accumulated `costUsd`, not a run count. See `docs/api/budget.md` for the
enforcement side.

`isValidGitRemote` (also re-exported as `apps/api/src/shared/git-exec.ts`'s
`validateRemote`) is a fail-closed allowlist against clone-remote command
injection (CVE-2017-1000117 class): only `https://`, `ssh://`, or scp-like
(`user@host:path`) forms, rejecting a leading `-` (argv/option injection),
`ext::` (git's arbitrary-command transport), `file://`/bare paths, `git://`,
and — checked against the authority split on the **last** `@` (not the first,
which a second `@` could exploit) — any user/host segment itself starting with
`-`. Enforced both at clone time (`ProjectLocalService.clone`) and on every
disk read (`ProjectSchema.gitRemote.refine`), so a hand-edited malicious value
on disk is caught before any run tries to clone it.

`CreateProjectSchema` = the full entity minus `hasSecrets`. `UpdateProjectSchema`
makes everything but `id`/`hasSecrets` optional, and re-widens `companyId`/`logo`
to accept an explicit `null` — the JSON-PATCH-can't-express-"unset" problem: a
present `null` means "clear the link/logo", an absent key means "leave it".

## `ProjectsStorageService`

Single JSON manifest (`_projects.json`), same shape/atomicity/backfill pattern
as `CompaniesStorageService` (see `docs/api/companies.md`) — sorted by id,
atomic temp-file+rename writes, schema-invalid entries dropped rather than
failing the whole listing, `people[].id` backfilled on read.

Phase 113 adds **logo asset externalization**: an uploaded `data:image/*`
logo is written to `<dir>/assets/<id>.<ext>` on disk (`toDiskProject`) and
inlined back to the full data URI on read (`inlineLogoRef`) — the wire entity
always carries the full data URI or a bundled `/`-path, never the bare
on-disk reference. `onModuleInit` runs a one-shot idempotent sweep
(`sweepInlineLogos`) migrating any pre-existing inline `data:` logo left in
the raw manifest from before this externalization existed.

## Errors (`projects.errors.ts`)

| Error                         | HTTP | Raised when                                                                                           |
| ----------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `ProjectNotFoundError`        | 404  | unknown id                                                                                            |
| `ProjectConflictError`        | 409  | `create` with an id already taken                                                                     |
| `ProjectNoRemoteError`        | 422  | `clone` with no `gitRemote`                                                                           |
| `ProjectAlreadyClonedError`   | 409  | `clone` when already present on this machine                                                          |
| `ProjectLocalUnresolvedError` | —    | `resolveForRun`: no local clone, no remote — dispatch fails clearly rather than spawning into nothing |
| `NoGithubLinkError`           | 422  | `merge`: no resolved github integration + token                                                       |
| `PrNotMergeableError`         | 409  | GitHub reports 405/409 on the merge attempt                                                           |

## Per-machine clone resolution (Phase 76/77 — `ProjectLocalService`)

`project.path` is the canonical **synced** registry field, but on any one
machine it may not exist (a fresh machine, a not-yet-cloned project). This
service tells the caller what THIS machine sees, and can clone on demand —
`path`/the registry are **never** mutated here, cloning is a local filesystem
side effect only.

- `resolve(project)` → `{ present, isGitRepo, resolvedPath, source, cloneRoot }`.
  `source` is `"path"` (canonical path exists + is a git repo), `"cloneRoot"`
  (a prior clone at `<cloneRoot>/<id>` exists instead), or `"none"`.
- `clone(project)` → 422 without a `gitRemote`, 409 if already present;
  otherwise `validateRemote()` gates the remote (defense-in-depth, the same
  check the schema already enforces) immediately before the **only production
  call site** of `WorkspaceService.clone()`.
- `resolveForRun(project)` (Phase 77) — what a run dispatch (agent/goal/
  pipeline) should actually use on this machine: present → use it; absent with
  a `gitRemote` → clone then use it; absent with no remote but `path` is an
  ordinary (non-git) folder → use it directly, no worktree (the pre-Phase-76
  posture); none of the above → throws `ProjectLocalUnresolvedError` rather
  than spawning into a directory that may not exist.

## GitHub PRs (Phase 78 — `ProjectPrService`)

Reuses the CI monitor's GitHub-REST posture (`Bearer` token, 429/403 →
rate-limit error, injectable `fetchImpl` for tests).

- `listOpen(projectId)` — resolves the project's **effective** (company-merged)
  github integration + stored token via `ResolvedProjectService.resolveIntegrations`;
  returns `[]` (never an error) when there's no link/token — a missing
  integration reads as "nothing to show". A real GitHub failure still throws.
- `merge(projectId, number, method?)` — **the only merge path in ZIBBY**,
  reached only from the operator-triggered controller route. Explicitly
  documented as never called from any scheduler/monitor/autonomous runner —
  Law "Never: Auto-merge". 422 with no link, 409 when GitHub reports
  not-mergeable.
- `getPr(projectId, number)` / `isMerged(projectId, number)` (phase 125e) — one PR's
  live state, for the roadmap gate's merge poll. `getPr` mirrors `listOpen`'s error
  posture exactly (404 → `null`, 429/403 → rate-limit error, other non-2xx → throws).
  `isMerged` wraps it **fail-closed**: unknown, gone, unlinked or rate-limited all
  read as `false`. That is the opposite of `PostMergeWatchService.rollup`'s fail-open
  `"pending"`, and deliberately so — the watcher is reporting CI on an _already
  merged_ sha, whereas this answers "may a dependent roadmap item dispatch now?"
  A gate that guessed "merged" on an unreadable response would release work onto a
  base that does not yet contain its dependency, which is the exact failure phase 125
  exists to prevent.

### The roadmap gate's eager release signal (125e)

`recordMerge` fires `roadmapGate.onMerge(projectId, number)` — an item `awaiting-merge`
on that PR becomes `done` and its project's enqueued items drain.

It is **unawaited and independently `.catch`ed**. Both halves matter: unawaited so the
operator's merge response never waits on roadmap bookkeeping, and separately caught
because an unawaited rejection is invisible to the caller's own `.catch(() => {})` and
would surface as an unhandled rejection. **A roadmap bookkeeping failure must never
present as a merge failure** — by that point the merge has already happened on GitHub,
so reporting it as failed would be a lie the operator might act on.

`ProjectPrService` ↔ `RoadmapGateService` is a genuine provider cycle (RoadmapModule
already needs `ProjectsStorageService`). It is resolved with `forwardRef` on the two
**constructor injections only** — `ProjectsModule` does **not** import `RoadmapModule`;
`RoadmapModule` is `@Global()` instead.

That is deliberate and worth not "tidying up". Adding a `ProjectsModule → RoadmapModule`
import edge closes a **four-file** `require()` cycle (`agents → projects → roadmap →
tasks → agents`), and `forwardRef` cannot help there: it defers _NestJS's_ read of a
module reference at DI-resolution time, but Node still evaluates the underlying `import`
statements eagerly in file order. With four files in the ring, `agents.module.ts` is only
partially loaded when `tasks.module.ts` reads it, and the boot dies on an `undefined`
import rather than anything `forwardRef` can defer. The existing
`ResolvedProjectModule` ↔ `IntegrationsModule` ↔ `ProjectsModule` triangle works because
none of its members reaches back through a fourth file. See
`docs/plans/phase-125/DECISIONS.md` D-009.

## Vault mirror (`ProjectVaultService`)

Fire-and-forget: every `create`/`update` writes (and every `delete` removes) a
Markdown note at `vault/projects/<id>.md`, frontmatter-tagged `project: <id>`
so grounding's ownership filter scopes it correctly. Renders the project's own
**raw** `identity.people`/`autonomy_policy` — deliberately **not** the
company-merged effective roster (documented as a Phase 70 DEFERRED decision:
this is a synchronous side effect of a plain mutation, and threading an async
company lookup through it for advisory grounding text isn't worth it yet).
Failures are swallowed — the registry write always wins.

## Secrets (`ProjectSecretsStore`)

One `<projectId>.json` per project under a separate gitignored directory
(`PROJECT_SECRETS_DIR`), **write-only over HTTP** — the API only ever exposes
`hasSecrets`, never the values, and the store does no logging at all so a
token can't leak through a debug line. Same flat-dir containment
(`resolveSafeFile` + the agent id regex) and atomic write as the integrations
credentials store.

## Task attribution (`project-matcher.ts`)

`matchProject(projects, { text?, paths? })` — pure, deterministic, **no LLM
call** (budget enforcement must be token-free and reproducible):

1. A `paths[]` entry under a project's `path` wins — longest-prefix match (the
   most specific containing project).
2. Else a whole-word match of a project `id`/`name` in `text`, diacritics-folded
   (Czech names match unaccented text), longest name wins ties.
3. Else `null` — unattributed, never queues, no per-project budget applies.

## Company-merged effective context (Phase 70/72)

`ResolvedProjectService` (DB-facing) + `resolved-project.helpers.ts` (pure,
independently unit-tested) compute a project's EFFECTIVE people/budget/
integrations by merging its linked company's data with its own **at read
time** — never persisted, never copied. A dangling/absent `companyId` degrades
to the project's own raw data at every merge, no special-casing needed.

- `mergePeople` — company roster first; a project person matching one
  (`samePerson`: by `id` if both sides have one, else case-insensitive name)
  **overrides** it field-by-field; an unmatched project person is added.
- `mergeBudget` — field-level: every field the project set wins, unset fields
  inherit the company's.
- `mergeIntegrationsByKind` — a `kind` the project itself has is entirely
  **owned** by the project's own integration(s) of that kind (company's
  same-kind ones dropped); a `kind` the project has none of is inherited whole.

`ResolvedProjectContext` additionally carries `companyId`/`companyName` (a
separate additive lookup for the UI's "from company X" note) via
`resolveCompanyRef` — layered on by the controller, not part of `resolve()`'s
own tested return shape.

## Standup (M3 — `StandupService`)

In-memory-cached (per process), regenerated on demand: reads the past 24h of
activity filtered to the project (or global entries with no `projectId`),
buckets into **Yesterday** (`DONE_KINDS`), **In Progress** (`PROGRESS_KINDS`),
**Blockers** (`BLOCKED_KINDS`), renders Markdown, and appends a one-line
summary to today's vault daily note. Pure deterministic assembly, no LLM.

## Endpoints (`/api/projects`)

```
POST   /projects                        create
GET    /projects                         list
GET    /projects/search?q=                free-text search (before :id)
GET    /projects/:id                      get one
PATCH  /projects/:id                      partial update
DELETE /projects/:id                      delete (registry record only)
PUT    /projects/:id/secrets              set run secrets (write-only)
DELETE /projects/:id/secrets              remove secrets
GET    /projects/:id/profile              identity/autonomy/daily-rhythm
PUT    /projects/:id/profile              replace profile
GET    /projects/:id/standup              latest standup (generates on first call)
GET    /projects/:id/resolved             effective (company-merged) context
GET    /projects/:id/local-state          this machine's clone resolution
POST   /projects/:id/clone                clone into this machine's cloneRoot
GET    /projects/:id/prs                  open GitHub PRs ([] with no link)
POST   /projects/:id/prs/:number/merge    operator-triggered merge only
```

Plus `project-categories.controller.ts`'s `GET/POST/PUT/DELETE /projects/categories[/:name]`,
mounted **before** `ProjectsController` so its static routes don't get
captured by `GET /projects/:id`.

## Module graph

`ProjectsModule` imports `MemoryModule` (vault dir), `WorkspaceModule` +
`MachineConfigModule` (leaf modules, no cycle risk), and — both via
`forwardRef` — `ResolvedProjectModule` and `IntegrationsModule`. The
`forwardRef`s exist because `IntegrationsModule` already imports
`ProjectsModule` directly (for its integration→project FK check) and
`ResolvedProjectModule` imports `IntegrationsModule`, so without breaking one
edge in each triangle, importing both directly would cycle.
`ResolvedProjectModule` is its own small module (not folded into
`ProjectsModule`) specifically so `IntegrationsController` can depend on it
without pulling in the whole projects module.

## Wired into the rest of the system

- **`companies`** — the merge source for effective context; see
  `docs/api/companies.md`.
- **`integrations`** — merged by kind into effective context; PR merge reads a
  resolved github integration's token via `CredentialsStore`.
- **`runner`/`agents`/`pipelines`/`goals`** — `ProjectLocalService.resolveForRun`
  is the seam every run dispatch calls to get a real, on-this-machine path
  before spawning; see `docs/api/runner.md`.
- **`tasks`** — `matchProject` is the attribution step feeding budget/queue/
  briefing/triage.
- **`memory`** — `ProjectVaultService` mirrors profile data as a grounding
  note; standups append to the daily note.
- **`workspace`** — `ProjectLocalService.clone` is the only production caller
  of `WorkspaceService.clone()`.

## Gotchas

- `path` is now **optional** (Phase 98) — don't assume every project has a
  host-resolvable directory without going through `ProjectLocalService`.
- The vault mirror renders **raw**, not effective, project data — don't treat
  `vault/projects/<id>.md` as authoritative for a company-linked project's
  actual people/budget.
- `deleteProject` never cascades to linked companies or to `companyId`
  references on other entities — same "allow delete, no cascade, dangling ref
  resolves to none at read time" posture as `companies`.
- `ProjectPrService.merge` is intentionally reachable from exactly one route.
  Do not add a second call site — it would violate the Law "Never: Auto-merge".
