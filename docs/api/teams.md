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
| Reader     | `apps/api/src/kb/kb-reader.service.ts`        | `KbReaderService` — pure, read-only reader over one `KnowledgeBaseSource` root    |

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

## Reading a knowledge base (`apps/api/src/kb`)

**Task 6 of the team-knowledge-base plan.** `KbReaderService`
(`apps/api/src/kb/kb-reader.service.ts`) is the pure, filesystem-level reader
over ONE `KnowledgeBaseSource` root — no Nest request context, no MCP, no
multi-team scoping (a later task wraps this with the operator's team/mandate
context and the MCP boundary's `envelopeInbound`, never called here).

```typescript
interface KbHit {
  noteId: string;
  title: string;
  path: string; // repo-relative to the KB root — never an absolute host path
  snippet: string;
}

class KbReaderService {
  search(source: KnowledgeBaseSource, query: string, limit?: number): Promise<KbHit[]>;
  read(source: KnowledgeBaseSource, noteId: string): Promise<{ path; title; body } | null>;
}
```

Mirrors `VaultService`'s (`apps/api/src/memory/vault.service.ts`) walk +
frontmatter shape and `grounding.service.ts`'s `selectIndexes`/`scoreEntry`
scoring shape, applied to the real KB layout (`team-context.md`,
`wiki/INDEX.md`, `wiki/{notes,projects,areas}/*.md`, `meetings/*.vtt`):

- **Read-only is structural.** The only `fs` calls in the file are `stat`,
  `readdir`, `lstat` and `readFile`. A source-scanning test acts as a
  regression tripwire, but it is a supplementary heuristic, not the guarantee:
  its pattern does not cover every write primitive (e.g. `fs.writeFileSync`,
  `chmod`, `createWriteStream`, `fs.open(…, "w")`), so a reviewer must still
  read the file. Reviewed 2026-08-31 against `apps/api/src/kb/`.
- **Path guard.** Every file the walk touches is containment-checked against
  the root after `path.resolve` (the `resolveSafeFile` shape,
  `apps/api/src/shared/file-storage/file-utils.ts:56-66`) and `fs.lstat`'d —
  a symlink (file OR directory) is refused outright, never followed. Dot-
  directories are skipped, exactly as `VaultService.walk()` does.
- **Fail soft, never throw.** A missing, unreadable, or non-directory root —
  or a future non-`vault` source kind — yields `[]`/`null`.
- **Budgets as named constants**: `KB_SNIPPET_MAX_CHARS` (500),
  `KB_BODY_MAX_CHARS` (4000, truncated with a visible marker).
- **Index-first ordering**: `team-context.md`, then `wiki/INDEX.md`, then the
  notes it links to, then the rest of `wiki/`, then everything else
  (`meetings/*.vtt`). A query term in the title or an `aliases`/`tags`
  frontmatter field outranks one only in the body.
- **`.vtt` files are indexed by filename only, never parsed** — they are raw
  verbatim transcripts of real people speaking. `read()` on a `.vtt` id
  returns `null`; only `search()` can surface one, by filename.
- **`noteId`** is the file's basename without extension (mirrors
  `VaultService`'s note `id`), resolved by looking it up among the entries the
  walk already validated — never by resolving a caller-supplied path
  directly, which is what makes the traversal/symlink guards hold.

## Scoping which KBs a caller can reach (`apps/api/src/kb/kb-scope.service.ts`)

**Task 7a of the team-knowledge-base plan.** `KbScopeService` is the entire
security story for the `zibby-kb` MCP server — it decides which
`KnowledgeBaseSource` roots a given caller may read at all, before
`KbReaderService` ever reads one:

```typescript
interface KbRoot {
  teamId: string;
  teamName: string;
  source: KnowledgeBaseSource;
}

class KbScopeService {
  rootsForRun(runId: string | undefined, team?: string): Promise<KbRoot[]>;
  rootsForChat(team?: string): Promise<KbRoot[]>;
}
```

**The asymmetry (deliberate).** A project-scoped agent/pipeline run reaches
ONLY its own team's KB (`runId → run record → projectId → knowledgeBaseFor →
[root]`) — no team, a team with no KB, an unknown run id, or an absent runId
all fail closed to `[]`. A chat turn has the _operator_ as its principal and
carries no project at all, so `rootsForChat(undefined)` deliberately returns
**every** team with a KB — narrowed only by an explicit `team`. Collapsing
these to one rule would make an untagged chat turn resolve to no project → no
team → empty, silently killing "let it follow from the conversation".

**`team` narrows, never widens** on both methods — passing a team the caller
couldn't otherwise reach yields `[]`, never that team's root.

**Resolving a run id to a project is by reference, not a stored id.** Neither
`AgentRun` nor `PipelineRun` persists a canonical `projectId`. An agent run
carries only `project` (the free-form label passed to `startRun` — an id or a
display name), resolved by id-then-name exactly like
`AgentRunnerService`'s own private `resolveProject`. A pipeline run carries
only `projectPath` (absolute path), resolved by path exactly like
`PipelineRunnerService`'s own private `projectForRun`. This means scope
resolution is a query-time lookup that can drift if the project registry
changes between run start and this call (rename, or a different project now
bearing the same name/path) — persisting a canonical `projectId` on the run
record would close this, and is out of scope here.

The `X-Zibby-Run-Id` header this resolves is **scoping input only, never
authentication** — low-entropy, guessable, forgeable by any local process
including the run itself. The auth boundary for the `zibby-kb` endpoint is
its guard (bearer token + loopback check) — see the next section.

For an agent run the header carries the pre-spawn
`${agentId}_${startedMs}`, while the persisted runId is
`${ownerId}_${startedMs}_${pid}` built from the same `startedMs` — so
`KbScopeService` resolves by prefix match (`record.runId.startsWith(header +
"_")`), safe because the boundary underscore rules out a false match against
a different, numerically prefix-colliding run. A pipeline run's header IS its
`pipelineRunId`, resolved by exact match (also supported for a completed
agent run, in principle).

## The `zibby-kb` MCP endpoint (`apps/api/src/kb/kb-mcp.controller.ts`)

**Task 7b of the team-knowledge-base plan.** `POST /api/kb/mcp` exposes
`KbScopeService` + `KbReaderService` as an in-process HTTP MCP server (same
shape as `ChatMcpController`/`EntityMcpController` — one fresh `McpServer` +
`StreamableHTTPServerTransport` per request, no session table). It is seeded
as the `zibby-kb` row in `apps/api/data/mcp-servers` (`McpServersStorageService`,
beside `zibby-entities`) at `http://localhost:{port}/api/kb/mcp`, so it is
injected into every enabled-MCP-servers run's `--mcp-config` like any other
connected server.

**Two tools, both read-only:**

```typescript
search_team_kb({ query: string, team?: string })
read_team_kb_note({ noteId: string, team?: string })
```

- **`team` is a team ID, never its display name** — the same narrowing rule
  `KbScopeService` enforces (Step 0b's fixture de-alias test pins this down).
- Neither tool schema exposes a path/directory parameter — the model can name
  a query and a note id, never a filesystem location.
- `search_team_kb` searches every `KbRoot` the caller's scope reaches, merges
  hits across roots, and **caps the merged total at 8** — never per root.
  Each hit is cited by team id + the note's repo-relative path (never an
  absolute host path) + title, with its snippet passed through
  `envelopeInbound` (Law 4 — untrusted vault content is data, not
  instructions).
- `read_team_kb_note` reads one note from the first reachable root (in scope
  order) that has it; its body is enveloped the same way.
- **No write tool exists**, and none is planned — `KbReaderService` itself
  never writes.
- An empty scope (unknown team, no permission, no KB configured) returns the
  SAME explicit empty result as a real query with zero hits, on both tools —
  never an error, and never a message that would let a caller distinguish
  "team doesn't exist" from "team exists but you can't read it".

**Guard is the sole auth boundary.** `KbMcpAuthGuard`
(`apps/api/src/kb/kb-mcp-auth.guard.ts`) mirrors `ChatMcpAuthGuard` exactly:
a per-boot bearer token (`KB_MCP_BEARER_TOKEN`, minted once per process,
in-memory only) compared via `crypto.timingSafeEqual`, AND a loopback check
on `req.socket.remoteAddress` — both enforced independently. `X-Zibby-Run-Id`
(read by the controller to pick `rootsForRun` vs `rootsForChat`) plays **no
part in authentication** — see the scoping section above.

**How the bearer token reaches a run.** `McpServersStorageService` writes
`KB_MCP_BEARER_TOKEN` into the `zibby-kb` row's credentials (`authToken`) via
`McpCredentialsStore` on every boot — unconditionally, unlike the entity row
itself (create-if-absent). `ClaudeRunCommandService.buildMcpConfig` (already
existing, unmodified) reads that credential fresh at every run's spawn time
and folds it into the `Authorization: Bearer` header, exactly like it does
for any other server's stored `authToken` — so a boot-time refresh is enough;
the token is never written into the entity's own `headers` field (that field
is plain and served as-is over `GET /api/mcp-servers` — see
`McpServerSchema`'s "Law 3 / credentials hygiene" doc).

## Wired into the rest of the system

- **`app.module.ts`** — `TeamsModule` is registered beside `CompaniesModule`;
  `KbModule` (`apps/api/src/kb/kb.module.ts`) is registered beside `McpModule`.
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
