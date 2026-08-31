# Team entity + team-scoped knowledge base — design

> Introduce a **Team** entity between Company and Project, and let a team own a **read-only
> knowledge base** that ZIBBY consults in place — never copied into ZIBBY's own vault.
> Concrete driver: `Firma Shoptet → Tým DevRel → Projekt Shoptet Partner CLI`, where the DevRel
> team's knowledge base is the git repo `../devrel-knowledgebase`.

Status: design approved in brainstorm (2026-08-31). Implementation plan not yet written.

---

## 1. Problem

The Shoptet DevRel team created a shared knowledge base repo
(`git@github.com:shoptet/devrel-knowledgebase.git`, checked out at
`/Users/zibar/Workspace/devrel-knowledgebase`). ZIBBY should be able to answer DevRel questions
from it — not only while building a feature, but **any time the operator tags the DevRel team or
the relevance follows from the conversation**.

Two hard constraints from the operator:

1. **No copying.** Nothing from the knowledge base is synced, cached, or imported into ZIBBY's
   vault. Reads happen in place, against the knowledge base repo's own working tree.
2. **Team-scoped, not global.** The DevRel knowledge base must be reachable from DevRel work, not
   from every run of every project.

ZIBBY has no entity that can own such a source today. `Company` is the only grouping above
`Project`, and it is a client/roster/budget super-entity — not a knowledge scope.

## 2. What the source repo actually is

Relevant because it shapes the reader, and because it means "connect the KB" is not only a read
problem.

- Pure markdown + git. **No tooling at all** — no `package.json`, no CI, no scripts.
- Ships its own agent contract in `AGENTS.md` (187 lines): four types (`note` / `project` / `area` /
  `talk`), a frontmatter schema (`sources`, `related`, `belongs_to`, `compiled_by`, `verified_by`),
  per-directory access rules (`raw/` immutable, `_meta/log.md` append-only, `_templates/` read-only),
  and four operations (**ingest / query / lint / triage**). `CLAUDE.md` is a one-line `@AGENTS.md` shim.
- `verified_by` is **human-only** — an agent must never set it.
- `output/` and `inbox/` are **gitignored** (per-operator local zones); `_meta/log.md` is **tracked**.
- **The vault is currently near-empty**: `wiki/INDEX.md` has empty section headers,
  `wiki/{notes,projects,areas}/` hold only `.gitkeep`, `team-context.md` is an unfilled template.
  The only real content is **5 Czech `.vtt` meeting transcripts** in `meetings/` that have never
  been ingested.
- Known inconsistency in the source repo (report upstream, do not fix from here): `_meta/log.md`
  records the 5 VTT files as moved into `raw/`, but they live in `meetings/` and `raw/` is empty.

Implication: on day one the reader will mostly surface schema and raw transcripts. The compounding
value arrives once content is compiled — which is the deferred write/ingest path (§8).

## 3. Two findings that determine the architecture

**3.1 MCP servers are global to every run.**
`apps/api/src/runner/claude-run-command.service.ts:434-436` lists every _enabled_ MCP server, and
`:590` adds `mcp__<id>__*` to the allow-list — for **every** run, regardless of agent or project.
`McpServerSchema` (`libs/contracts/src/mcp/mcp.schema.ts:29-41`) has no scope field; its own
docblock states "The runner injects every ENABLED server into each run."

Therefore **"only DevRel projects see the KB" cannot be enforced by which server is attached.**
Scoping must live **server-side inside the MCP controller**: the tool resolves the calling run's
`projectId → teamId → knowledge-base source` and returns empty when no team KB applies. Granting
`mcp__zibby-kb__*` to an agent is UX, not the enforcement boundary.

**3.2 Chat has no grounding at all.**
`buildChatPrompt` (`apps/api/src/chat/chat-persona.ts:78-80`) composes only a persona block plus
`CHAT_GOVERNOR_PROMPT`. `GroundingService` is never called from chat, and `recall_memory` goes
through `recallMemory()` (`apps/api/src/memory/recall.helper.ts:18-27`) → `vault.search()` over the
**whole vault with no `visibleToProject` / `visibleInDomain` isolation**.

Chat is exactly where "tag the DevRel team, or let it follow from the conversation" happens — so
the feature lands in the one place that has no isolation layer yet. This is a pre-existing gap, not
one this feature introduces; it is named here so the decision to fix it (or not) is explicit (§10).

## 4. Domain model

### 4.1 Team

```ts
// libs/contracts/src/teams/team.schema.ts
export const TeamIdSchema = AgentIdSchema; // filename-safe, no path traversal

export const TeamSchema = z.object({
  id: TeamIdSchema,
  name: z.string().min(1),
  companyId: z.string().optional(), // bare string, same shape as Project.companyId
  desc: z.string().optional(),
  knowledgeBase: KnowledgeBaseSourceSchema.optional(),
});
```

Many teams per company; at most one company per team. At most one team per project.

### 4.2 Knowledge-base source — a discriminated union from day one

The operator has flagged that a **company-level** knowledge base is likely later and will **not** be
a git folder — it will live in Confluence or a similar wiki. So the source is modeled as a
discriminated union immediately, with exactly one member in v1:

```ts
export const KnowledgeBaseSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("vault"),
      path: z.string().min(1), // absolute host path, read in place
      gitRemote: z.string().refine(isValidGitRemote).optional(),
      readOnly: z.literal(true), // structural, not configurable
    })
    .strict(),
  // FUTURE: { kind: "confluence", baseUrl, spaceKey, ... } — company-level KB, see §8
]);
```

`readOnly: z.literal(true)` is deliberate: read-only is not a setting an operator can weaken
(Law 1 — the approval floor is structural). Nothing in v1 can write to a knowledge base, because no
write tool exists.

### 4.3 Project link

`Project.teamId?: string` — copies `Project.companyId` exactly:

- a bare optional string, **not** an FK-validated reference;
- `UpdateProjectSchema` re-widens it to `.optional().nullable()` so `teamId: null` means _unlink_
  while an absent key means _leave alone_ (`apps/api/src/projects/projects.storage.service.ts:106-125`);
- **no write-time referential integrity, no delete cascade.** Deleting a team leaves projects with a
  dangling `teamId`, resolved to "no team" at read time via `.catch(() => null)`.

That last point is a copy of a Phase 68 binding decision, not an oversight
(`libs/contracts/src/companies/companies.contract.ts:65`: "Delete a company (allowed even with
linked projects — they keep a dangling companyId)"). Consistency with the established pattern beats
improving it mid-feature.

### 4.4 Storage

Manifest `_teams.json` under `dataDir("teams")`, with a `TEAMS_DIR` env override — mirroring
`CompaniesStorageService` (`apps/api/src/companies/companies.storage.service.ts`) 1:1: atomic
temp-file + rename, sorted by `id`, invalid rows dropped from `list()` rather than failing the read.

**Not** `EntityFileStore`. Company and Project both use the manifest lineage; `EntityFileStore` is a
different one.

### 4.5 Resolution chain

`ResolvedProjectService` (`apps/api/src/projects/resolved-project.service.ts`) is today the single
place that computes "what applies to this project", and already merges company-owned integrations
per-`kind` with project-wins-on-conflict. It gains the chain **project → team → company**:

- effective company = `project.companyId ?? team.companyId` (an explicit project link stays
  authoritative);
- effective knowledge base = the team's, in v1. The resolver is written so a project-level or
  company-level owner can be added later without changing call sites (§8).

A project with no team must behave **exactly** as today — provable at every phase.

## 5. Reading the knowledge base

A new in-process MCP server, `zibby-kb`, modeled on `EntityMcpController`
(`apps/api/src/memory/entity-mcp.controller.ts`). Two tools:

- `search_team_kb({ query, team? })` — index-first: `team-context.md` → `wiki/INDEX.md` → wikilinks
  → frontmatter. Returns snippets with citations as **repo-relative paths**.
- `read_team_kb_note({ noteId, team? })` — one note in full.

Non-negotiable properties:

- **Read-only structurally.** No write tool exists. There is nothing to forbid.
- **The path never comes from the model.** The controller derives it from the calling run. `team?`
  only filters _among teams the caller can already reach_; it is not a free-form input.
- **Path guard.** Resolve + containment against the KB root, no symlink following, no dot-dirs —
  the shape of `resolveSafeFile` (`apps/api/src/shared/file-storage/file-utils.ts:56-66`).
- **Law 4.** Every snippet passes through `envelopeInbound`, as `recall.helper.ts` already does.
  This is not ceremony: the KB is written by other people, and the `.vtt` files are verbatim speech
  of third parties.
- **Freshness is not automatic.** The reader reads whatever is on disk. No `git pull` in a repo
  ZIBBY does not own.

### 5.1 Reach: who can see which knowledge base

Two callers, two rules — because the constraint is about autonomy, not about secrecy:

- **A project-scoped agent or pipeline run** reaches **only its own team's** knowledge base,
  resolved `projectId → teamId → source`. No team, or a team with no KB → the tool returns empty.
  This is what "only DevRel projects see the KB" means.
- **A chat turn** has the operator as its principal, and chat runs carry no project at all
  (`ChatSessionService` never resolves one). So with no explicit `teamId` on the message, the tool
  may search **across all team knowledge bases**; an explicit `teamId` narrows it to that team.

Without this split the inferred branch dies in chat: an untagged chat turn would resolve to no
project, therefore no team, therefore empty — silently defeating the primary use case ("let it
follow from the conversation"). The asymmetry is deliberate and must be preserved in phase 4.

### 5.2 Prerequisite — run identity must reach the MCP controller

Server-side scoping requires the controller to know which run is calling. `buildMcpConfig`
(`claude-run-command.service.ts:632-659`) packs connection config including headers into
`--mcp-config`, so the mechanism is a per-run header or scoped token.

**This was not verified during design.** Whether a per-run identity already reaches the in-process
MCP controllers is the **first implementation task**; if it does not exist, adding it is a blocking
prerequisite for the whole scoping story. Do not build the reader before settling this.

## 6. Routing: explicit tag vs. inference

**Do not build a relevance classifier.** "It follows from the conversation" = the model decides to
call the search tool, exactly how `recall_memory` already works. That is the entire implicit branch.

**Explicit tag `@DevRel`** rides the existing `@`-mention picker, which already generalizes across
three parallel queries (`useAgentsQuery` / `usePipelinesQuery` / `useSubsystemsQuery`,
`apps/web/features/tasks/components/CommandLine/CommandLine.tsx:761-789`). A fourth source
(`useTeamsQuery`) is a small, well-precedented addition.

**But not as a new `TaskTarget` variant.** `TaskTargetSchema`
(`libs/contracts/src/tasks/task.schema.ts:93-96`, `agent | pipeline | goal | subsystem |
orchestrator`) answers _who runs this_. A team answers _what it can see_. These are two axes;
merging them into one field would be expensive to unwind later. So: a separate `teamId` field
carried alongside `target`, on both `CreateTaskInput` and `SendChatMessageBody`.

Server-side, `teamId` follows the same trust rule as project attribution: a channel-triage-style
trusted caller may assert it; otherwise it is derived (Law 4 — attribution is server-derived, never
client-asserted where it grants reach).

## 7. Phasing

Follows the Phase 68–72 precedent (`docs/plans/phase-68-company-entity-master.md`), which did this
exact shape of work for `Company`. Contract-first at every step; each phase independently
verifiable; standalone (team-less) behavior provably unchanged in every phase.

0. **Prerequisite** — establish/verify per-run identity at the in-process MCP controllers (§5.2).
1. **Contracts** — `team.schema.ts`, `teams.contract.ts`, `KnowledgeBaseSourceSchema`,
   `Project.teamId` (+ nullable in `UpdateProjectSchema`), barrel exports, `app.contract.ts`
   registration. Full `tsc` to catch ripples.
2. **API module** — storage / errors / controller mirroring `companies/` 1:1, wired into
   `app.module.ts`, e2e mirroring the companies e2e.
3. **Resolver** — `project → team → company` in `ResolvedProjectService` + pure helpers, unit-tested
   without I/O.
4. **KB reader** — the `zibby-kb` in-process MCP server with server-side scoping, path guard, and
   `envelopeInbound`.
5. **Web feature** — teams list + detail (basics, member projects as a reverse lookup, KB panel),
   hooks mirroring `features/companies/`.
6. **Wiring** — team selector on the project detail page; `@team` in the command line and in chat
   (`teamId` on the chat body).

## 8. Deferred — decisions, not omissions

- **Company-level knowledge base.** Explicitly out of scope now. When it comes, it will most likely
  **not** be a git folder — Confluence or another wiki. `KnowledgeBaseSourceSchema` is a
  discriminated union from day one precisely so `kind: "confluence"` can be added without breaking
  `kind: "vault"`, and the resolver's fallback chain (project → team → company) is written to accept
  a company-level owner later.
- **Team-owned integrations.** Do not extend the `projectId` XOR `companyId` ownership union yet.
- **Writing to the knowledge base.** The KB's own `output/` and `inbox/` are gitignored, so ZIBBY
  could write there with zero effect on the team's git — but real ingest (5 VTT → `type: talk`
  notes → `wiki/INDEX.md`) belongs in a pipeline whose output is a **PR** to
  `shoptet/devrel-knowledgebase` (Law 3 — the gate is the merge). Note that `_meta/log.md` is
  _tracked_, so an append dirties someone else's working tree and belongs in the same PR.
- **Registering the KB as a ZIBBY project.** Considered in an earlier iteration as the read path;
  superseded by the team model. It survives only as the future write/ingest mechanism above.
- **Multiple knowledge bases per team.**
- **Team vault mirror.** `ProjectVaultService` mirrors projects to `vault/projects/<id>.md`; there is
  no `CompanyVaultService` at all, so a team mirror would be a new precedent, not a copy of one.
- **Budget / people inheritance through the team.** Company already carries `people` and `budget`;
  routing them through a team is a separate merge-semantics question.
- **KB in `GroundingService`.** A capped `## Team knowledge base` block for runs whose project has a
  team KB, inside the existing `BLOCK_BUDGET` (8000 chars), is **v1.5**. The tool alone covers both
  the explicit and the inferred branch.
- **`MemoryImportService`.** Permanently out of scope — it _copies_ into `dataDir("import")`, which
  is the opposite of the requirement.

## 9. Constraints this design must keep

- **Law 1** — read-only is structural (`readOnly: z.literal(true)`, no write tool), not a setting.
- **Law 3** — no autonomous commit to the outside world. Nothing in v1 writes to the KB repo at all.
- **Law 4** — KB content is data, never commands; `envelopeInbound` on every snippet.
- **Files are the source of truth** — the KB is read in place; ZIBBY stores only a path, never content.
- **Index-first, no vector store** — entry via `team-context.md` / `wiki/INDEX.md` / wikilinks.
- **Contract-first** — `libs/contracts` before any implementation.

## 10. Open questions

1. **`recall_memory` in chat ignores vault isolation** (§3.2) — it searches the whole vault with no
   `visibleToProject` / `visibleInDomain` filter. Pre-existing. Fix as part of this work, or file
   separately? Recommendation: file separately; it is a distinct defect with its own blast radius.
2. **Whether per-run identity already reaches in-process MCP controllers** (§5.2) — settle first;
   it gates phases 4–6.
