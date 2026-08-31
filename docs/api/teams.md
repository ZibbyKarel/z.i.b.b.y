# Teams (the layer between Company and Project)

**Task 2 of the team-knowledge-base plan.** A team sits between `Company` and
`Project`: many teams per company, at most one company per team, and a
project optionally points at one team via `Project.teamId`. In v1 a team owns
no roster and no budget — those stay on `Company`/`Project`. What a team
uniquely owns is a **read-only knowledge base** (`knowledgeBase`) — wired up
for actual reads by `KbReaderService`/`KbScopeService`/the `zibby-kb` MCP
server (see "Reading a knowledge base" and "Scoping which KBs a caller can
reach" below).

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
resolution is a query-time lookup, redone on every call, NOT a "fails closed
at worst" one: if the referenced project is deleted and a new one is
registered reusing the same id/name (or the same `projectPath`), the SAME run
id resolves to a DIFFERENT team's knowledge base entirely — a team the run
never started under. This is a silent cross-team leak, not a fail-closed
degradation. Persisting a canonical `projectId` on the run record at run
start (and resolving from that instead of re-resolving a free-form label at
query time) would close this; it is a named follow-up, out of scope here.

The `X-Zibby-Run-Id` header this resolves is **scoping input only, never
authentication** — low-entropy, guessable, forgeable by any local process
including the run itself. The auth boundary for the `zibby-kb` endpoint is
its guard (bearer token + loopback check) — see the next section.

For an agent run the header carries the pre-spawn
`${agentId}_${startedMs}`, while the persisted runId is
`${ownerId}_${startedMs}_${pid}` built from the same `startedMs`. A plain
boundary-safe prefix match (`record.runId.startsWith(header + "_")`) is NOT
enough: agent ids (`architekt`, `koder`, …) are public constants, not
secrets, and a bare agent id is itself a shorter, boundary-aligned prefix of
`${agentId}_${startedMs}_${pid}` — sending it as the header would resolve to
whatever project that agent last ran under. `KbScopeService` additionally
requires the remainder after the boundary to be a **single segment** — i.e. to
contain no further `_`, the separator itself (`_${pid}`, never
`_${startedMs}_${pid}`), which accepts the intended header and rejects the
bare-agent-id truncation. The rule is shape-based rather than all-digit on
purpose: `RunnerCore.createPending` mints a `_p${hex}` suffix instead of a bare
pid, and an all-digit rule would silently drop such a run's KB scope — failing
closed, but for no reason. A pipeline run's header IS its
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
- `search_team_kb` searches every `KbRoot` the caller's scope reaches (each
  root capped at `MAX_SEARCH_HITS` before merging), then **interleaves hits
  round-robin across roots** before capping the merged total at 8 — fair by
  team, not global-best-first, so no single root can crowd out the others
  just because it happens to come first (fix round 1, F5; `KbHit` carries no
  relevance score to sort by, and none is planned). Each hit is cited by team
  id (trusted, kept outside the envelope) followed by the note's
  repo-relative path (never an absolute host path) + a length-capped title +
  its snippet — **path, title, and snippet all pass through a single
  `envelopeInbound` call together** (fix round 1, F2): title used to be
  formatted outside the envelope, so a hostile YAML-frontmatter title could
  reach the model unsanitized; it's now capped by its own constant
  (`MAX_KB_TITLE_CHARS`, separate from the envelope's own 4000-char budget,
  so an oversized title can't crowd the snippet out of the shared budget) and
  combined into the same envelope as the snippet (Law 4 — untrusted vault
  content is data, not instructions).
- `read_team_kb_note` reads one note from the first reachable root (in scope
  order) that has it; its path + title + body are enveloped together the
  same way.
- **No write tool exists**, and none is planned — `KbReaderService` itself
  never writes.
- An empty scope (unknown team, no permission, no KB configured) always
  returns an explicit empty-result message, on both tools — never an error,
  and never a message naming the cause: "team doesn't exist" and "team
  exists but you can't reach it" both land on the same empty-scope branch,
  indistinguishable to the caller. `search_team_kb`'s empty-scope message
  ("no team knowledge base is reachable here") does differ from its
  zero-hits message ("no results for `<query>`") — that's a hint to the
  model about where to widen its query, not a security-relevant leak, since
  an unauthorized or unknown team never gets past the empty-scope branch in
  the first place.

**Guard is the sole auth boundary — and the TOKEN decides the caller path,
never the header (fix round 1, F3).** `KbMcpAuthGuard`
(`apps/api/src/kb/kb-mcp-auth.guard.ts`) mirrors `ChatMcpAuthGuard`'s checks
exactly (same length-check-then-`crypto.timingSafeEqual` comparison, same
loopback check on `req.socket.remoteAddress`, both enforced independently) —
but instead of one shared token, `KbMcpAuthService`
(`apps/api/src/kb/kb-mcp-auth.service.ts`, provided by the leaf
`KbAuthModule`) mints **two** per-boot, in-memory-only tokens: a run token
and a chat token. The guard accepts either, and records which one matched as
`req.kbCaller: "run" | "chat"`. The controller branches on `kbCaller`, never
on whether `X-Zibby-Run-Id` is present:

| token | `X-Zibby-Run-Id` | result                                                                    |
| ----- | ---------------- | ------------------------------------------------------------------------- |
| run   | present          | `rootsForRun(headerRunId, team?)`                                         |
| run   | absent           | `rootsForRun(undefined, …)` → `[]` — fails closed                         |
| chat  | absent           | `rootsForChat(queryTeamId)`, then narrowed by `team?` — see below         |
| chat  | present          | same as above — the header carries no authority here, only the token does |

Before this fix, the caller path was decided by the header's presence alone
(`runId ? rootsForRun(...) : rootsForChat(...)`), so a caller holding a valid
token could simply omit `X-Zibby-Run-Id` and reach every team's KB via
`rootsForChat(undefined)` — no forgery needed, because the header was never
the authentication boundary in the first place. **Be accurate about what the
two-token split buys**: it is leash integrity, not a hard security boundary —
either token still sits in a 0600-permission credentials file readable by any
same-uid process; it stops a caller from silently escaping its own intended
scope by omitting a header, not a determined local attacker with filesystem
access. It is deliberately not a credential framework: two tokens, one
`if`/`else`, nothing more.

**The chat path's `?teamId=` query param is a ceiling, not a filter (Task 8).**
`ChatSessionService` builds the `zibby-kb` MCP server's URL per turn
(`kbMcpUrl(teamId?)`): `http://localhost:{port}/api/kb/mcp?teamId=<id>` when
the turn carries an operator-tagged team (from the composer's `@`-mention
picker, via `SendChatMessageBody.teamId`), or the same URL with **no query
string at all** when it doesn't — never `?teamId=` with an empty value.
`teamIdFromUrl` reads that param off the request (`undefined`, never `""`,
when absent) and `kb-mcp.controller.ts`'s `rootsFor` uses it as the CEILING
for every tool call this MCP connection serves, for the lifetime of that one
turn:

- `rootsForChat(queryTeamId)` resolves the roots reachable within that
  ceiling — `rootsForChat(undefined)` (no tag) still resolves to **every**
  team's KB, exactly as it did before Task 8; tagging a team narrows the
  ceiling itself down to that one team's roots.
- The tool's own `team` argument (`search_team_kb({ query, team? })` /
  `read_team_kb_note({ noteId, team? })` — the model's own choice, not the
  operator's) then narrows the result **within** whatever the ceiling
  already resolved to: `roots.filter((root) => root.teamId === toolTeam)`.
  It is never passed to `rootsForChat` directly.
- **Both directions narrow, neither widens — within the sanctioned tool
  surface.** A tool `team` argument outside the ceiling (e.g. the operator
  tagged `devrel` but the model asks for `platform`) resolves to an empty
  result on that ceiling — not `platform`'s KB, and not an error. A tool call
  with no `team` argument at all gets everything the ceiling allows, nothing
  more. Be accurate about what this buys, the same way the run path's
  forgeable header is: a chat turn's principal is the OPERATOR, and nothing
  stops a chat-turn model from reading its own 0600 MCP config and curling
  `/api/kb/mcp` directly, with no `?teamId=` at all, to reach
  `rootsForChat(undefined)` — every team's KB. That is not an escalation past
  what the chat principal could already reach by default (the operator's own
  reach is "every team with a KB"), so the design stands; the ceiling narrows
  what the SANCTIONED tools return, it is not a hard wall around the
  connection.
- The run path is unaffected: `rootsForRun(runId, team?)` still receives the
  tool's `team` argument directly, unchanged — a run's ceiling is its single
  project (via `runId`), which the tool argument narrows the same way it
  always has, and `?teamId=` is never read on that path at all.

**The task path has no per-task team tag — by design, not by oversight (Task
9b).** A run's knowledge base is resolved from its **project's** team
(`rootsForRun`, above) — a run never carries its own `?teamId=`-style ceiling
the way a chat turn does. `CommandLine`'s `allowTeamMentions` prop (fix round:
default **`false`**, opt-in) decides whether `@team` is offered as a mention
source at all — every call site states its own intent explicitly rather than
relying on a default: `ChatDock` passes `true` (a tagged team genuinely
narrows the KB end-to-end there); `TaskCommandLine` and both automations
composers (`AutomationFormDialog`, the `DetailScreen` task-edit surface) pass
`false` — none of them reach a run's KB scope yet, so offering the mention
would promise a scope that silently does nothing. `CreateTaskInput.teamId`
(`libs/contracts/src/tasks/task.schema.ts`) still exists on the wire and still
accepts a well-formed team id — it is the seam a later branch builds on — but
nothing on the task path sets it any more, and nothing on the API reads it: a
task's dispatched run has no field to carry an explicit team tag through to
its KB scope. Wiring one through needs a new field on each of three persisted
schemas that don't have one today — `PipelineRunSchema`, `GoalRunSchema`, and
`ScheduledTaskSchema` (a task itself, the earliest point the tag would
otherwise die) — plus the `rootsForRun` resolution above extended to prefer
that explicit tag over the project's own team. That's deferred, deliberately,
to a later branch; until it lands, offering the mention on the task path
would promise a scope that silently does nothing, which is worse than not
offering it.

**How the bearer token reaches a run.** `McpServersStorageService` writes the
**run token** — never the chat token — into the `zibby-kb` row's credentials
(`authToken`) via `McpCredentialsStore` on every boot — unconditionally,
unlike the entity row itself (create-if-absent). The chat token is never
persisted anywhere and is not reachable through `GET /api/mcp-servers`.
`ClaudeRunCommandService.buildMcpConfig` — extended by Task 5 with a `runId`
parameter and the `X-Zibby-Run-Id` header it threads onto loopback servers —
reads that credential fresh at every run's spawn time and folds it into the
`Authorization: Bearer` header, exactly like it does for any other server's
stored `authToken` — so a boot-time refresh is enough; the token is never
written into the entity's own `headers` field (that field is plain and
served as-is over `GET /api/mcp-servers` — see `McpServerSchema`'s "Law 3 /
credentials hygiene" doc). `ClaudeRunModule` owns its own duplicate
`McpServersStorageService` instance (see that module's doc) but imports
`KbAuthModule` rather than re-providing `KbMcpAuthService` — NestJS shares
one app-wide `KbMcpAuthService` singleton across every importer, so both
storage instances and the guard always agree on the same token pair.

## Wired into the rest of the system

- **`app.module.ts`** — `TeamsModule` is registered beside `CompaniesModule`;
  `KbModule` (`apps/api/src/kb/kb.module.ts`) is registered beside `McpModule`.
- **`projects` module** — `Project.teamId` is a bare optional string (same
  dangling-ref tolerance as `companyId`), but it is no longer unread:
  `ResolvedProjectService.findTeam` resolves it to a `Team` (or `null` for "no
  team") the same read-time way it already does for `companyId`, and
  `KbScopeService.rootsForRun` depends on it directly (`project.teamId` → the
  team's KB). See `docs/api/projects.md`.

## Gotchas

- A team's `id` reuses `AgentIdSchema`'s validation (filename-safe, no path
  separators/traversal) — same rules as `Company.id`/`Project.id`/`Agent.id`.
- No cascade on delete, ever — this module never consults `projects` before
  deleting, by design (see Storage above).
- No vault mirror of its own today: a team's knowledge base is a pointer
  (`knowledgeBase`) into an existing external location (a vault path), not a
  file this module writes or owns.
