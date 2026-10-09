# Memory vault

## What the vault is

The vault is an Obsidian-compatible folder of Markdown files — ZIBBY's durable
memory across sessions. It is not a vector database; retrieval is **index-first**:
MOC files + descriptive filenames.

Default location: `.zibby/data/vault/`
Overridable via the `VAULT_DIR` env var.

## Three tiers

| Tier        | Folder                                                    | Purpose                                               |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------- |
| `memory`    | vault root (and any non-tier subfolder, e.g. `projects/`) | Durable knowledge — facts, decisions, project context |
| `daily`     | `vault/daily/`                                            | Daily log — append-only record of what happened       |
| `knowledge` | `vault/knowledge/`                                        | Thematic notes — deeper-dive documents                |

The tier is derived from the top-level folder (`tierOf`); anything outside `daily/` and
`knowledge/` is `memory`.

## Note format

Every file is `<id>.md` with YAML frontmatter:

```markdown
---
title: Delivery Loop — model decision
tags: [architect, workflow]
created: 2026-06-01
updated: 2026-06-02
---

# Delivery Loop — model decision

We decided to use Opus for the Architect and the Coder ...

See also [[zibby-north-star]], [[project-xy]].
```

Every write (create, patch, append) stamps `updated: YYYY-MM-DD` into the frontmatter
`knowledge/vault-log.md` is an append-only change log of vault
writes.

### Note ID rules

- A filesystem-safe basename (no path separators)
- Regex: `/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/`
- Must be unique across every tier
- Validated by `resolveSafeFile` (path-traversal protection)

A note nested in a subfolder (e.g. `vault/projects/<id>.md`) still gets a bare
basename id — `VaultService.scan()` derives it via `path.basename(file, ".md")`,
never the path relative to the vault root, so `VaultService.note(id)` only ever
matches a plain basename. `ProjectVaultService` (`vault/projects/<id>.md`, id
`<id>`) and `apps/api/src/memory/review-rules-note.ts`'s
`reviewRulesIdFor(projectId)` (`vault/projects/<id>-review-rules.md`, id
`<id>-review-rules`, no `projects/` prefix) both follow this rule.

## VaultService

**File:** `apps/api/src/memory/vault.service.ts`

Read access to the vault is free; the only write with no gate is the safe
`daily/` append. A short-lived (5s) scan cache keeps repeated graph/search calls
cheap on a large vault.

### Operations

```
GET    /api/memory/index                index/MOC entry points into the vault
GET    /api/memory/note/:id             note detail (title, body, tier, frontmatter, links, backlinks)
GET    /api/memory/graph                the wiki-link graph (nodes + edges)
GET    /api/memory/search?q=            full-text search
POST   /api/memory/daily                append an episodic entry to today's daily note
POST   /api/memory/notes                create a note (id, title, tier, body)
PATCH  /api/memory/notes/:id            patch a note (title, body, frontmatter merge)
POST   /api/memory/notes/:id/append     append text to the end of a note
POST   /api/memory/index/:id/links      ensure a [[link]] exists in an index/MOC note
```

There is no delete-note endpoint — `VaultService` has no delete method; a note is
removed by deleting its file on disk directly.

### Wiki-links and backlinks

- `[[target]]` in a note's body is extracted on every read
- Backlinks are computed on the fly by scanning every file
- No in-memory graph — simple, and consistent with the file-based source of truth

### Full-text search

```
GET /api/memory/search?q=<text>
```

Searches the title + body of every note (case-insensitive substring match), scored
so a title hit ranks above a body hit.

### Graph

```
GET /api/memory/graph
```

Returns `{ nodes, edges: { from, to }[] }` for a force-directed
visualization.

### The daily note

There is no dedicated "get today's note" endpoint. `POST /api/memory/daily` appends
`text` to today's `daily/<YYYY-MM-DD>.md` (creating it if needed) and returns the
resulting note; to read the current day's note without appending, fetch it by id via
`GET /api/memory/note/:id` with today's date (`YYYY-MM-DD`) as the id.

## Index / MOC (Map of Content)

`index()` returns notes whose id ends in `index` or `moc` (any tier) as entry
points, falling back to every note in the vault when none exist. It is not filtered
to a single tier.

```
GET  /api/memory/index                    list of index/MOC entry points
POST /api/memory/index/:id/links          idempotently ensure a [[link]] exists in an index note
```

`updateIndex` creates the target index note in `knowledge/` if it doesn't exist yet,
replaces an existing `- [[target]]` line in place (label refresh), or appends a new
one. Writes to one MOC are serialized per-id to avoid a lost update when two runs
finish concurrently.

ZIBBY navigates the vault through indexes — instead of scanning every file.

## GroundingService

**File:** `apps/api/src/memory/grounding.service.ts`

Called at the start of every run (fail-open — a vault outage never blocks a run):

1. Loads the North Star note (`NORTH_STAR_ID` — `north-star`; absent is fine,
   `add` skips any note it can't read)
2. Loads the self-knowledge note (`SELF_KNOWLEDGE_ID` — `self-knowledge`)
3. Loads the learned review-rules notes — never term-matched, and deliberately
   ahead of the shelf/MOC/expansion sections so a char-budget truncation cuts
   speculative context first, never a learned rule: the cross-project note
   (`GLOBAL_REVIEW_RULES_ID`, skipped for a `domain: "personal"` run) and, when
   the run carries a `projectId`, that project's note
   (`reviewRulesIdFor(projectId)`); see `docs/api/review-learning.md`
4. Loads the owning department's knowledge shelf (F4a) when `department` is
   set, plus the Personal shelf for a `domain: "personal"` run (F8)
5. Loads up to `MOC_LIMIT` term-matched indexes, narrowed first by M7 project
   isolation and F8 domain isolation, then up to `EXPANSION_LIMIT` notes reached
   by 1-hop wikilink expansion from what is already grounded (F4b)
6. When the run carries a `projectId`, loads that project's own note
7. Team knowledge base (work runs only): when the project's team has a
   `knowledgeBase`, its `team-context.md` and `wiki/INDEX.md` (each capped at 1500
   chars, enveloped — Law 4, read in place, symlinks/escapes refused; template-only
   files skipped) become a `### Team knowledge base (<kb folder>)` section, plus a hint
   to use `search_team_kb` / `read_team_kb_note`. Added last and only if it fits the
   block budget whole, so truncation never cuts an envelope open
   (`team-kb-grounding.ts`)
8. Returns the combined markdown context → passed to the agent as `--append-system-prompt`

Budgets: each note's body is truncated at `NOTE_BUDGET` (2000 chars) and the whole
block at `BLOCK_BUDGET` (8000) — both cut the tail, which is why the order above is
load-bearing.

## RunRecorderModule

**File:** `apps/api/src/memory/run-recorder.module.ts` and `run-recorder.service.ts`

When an agent or workflow run reaches a terminal state (also swept on bootstrap for
runs that ended across a restart), the recorder appends **one line** to today's daily
note: run id, agent/workflow, title, status, plus `[[project]]` and (for an owned run)
`[[department-<id>-moc|id]]` links. It is at-most-once: `memory-recorded.json` is
written into the run's cwd before the vault write, so a crash can lose a line but never
duplicate one. It writes no run marker comment and does not update indexes.

## MemoryDistillerModule

**Files:** `apps/api/src/memory/memory-distiller.module.ts`,
`memory-distiller.service.ts`, `claude-cli-distiller.ts`

System-owned **learning from runs** — the mirror image of grounding. Grounding
writes context _into_ a run, the distiller reads insights _out_ of it; the agent
never knows any of this memory exists (learning is NOT an agent capability). It's
driven by the nightly [`memory-distill` system automation](./automations.md#memory-distillation-memory-distill).

`MemoryDistillerService.distill()` walks terminal workflow/agent/goal runs, a cheap
model (haiku, fail-open) extracts durable insights from them, and saves them as one
nightly digest `distilled-<date>` in `knowledge/`, linked from the affected projects'
MOCs. Idempotent via a `memory-distilled.json` marker in the run's `cwd`. See the
automations doc for details.

> Note: the earlier per-agent `learned.md` (where a documentation agent wrote its own
> memory) has been removed — memory is now collected by the system, not from an
> agent's own description.

## Vault lint

A nightly `vault-lint` system automation (03:30) writes the report-only
`knowledge/vault-lint.md`: broken links, orphans, stale notes (>90d) and tag bloat. It
never edits other notes. Orphans exclude `daily/`, North Star, self-knowledge, MOCs and
the machine notes; `vault-log` and `vault-lint` are scanned as link-less so they don't
mask orphans. Service: `vault-lint.service.ts`.

## Knowledge sources (web `/knowledge/*`)

All three Knowledge pages (Trezor `/knowledge/vault`, Graf `/knowledge/graph`, Destilace
`/knowledge/distill`) share one source bar: a switcher ZibbyCorp / team KBs and, for a team,
the "Sync KB" button (`POST /api/teams/:id/kb/sync`). The selection (`vault` | `team:<id>`) is
held by `KnowledgeSourceProvider` in `app/(company)/knowledge/layout.tsx`, so it survives tab
switches; it is initialised from `?source=` and the param is re-applied on every page (tab links
drop the query string). An unknown team or one without a KB falls back to the vault.

| Page      | Vault source                                    | Team source (read-only)                                                                                                                                                                           |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trezor    | tier/shelf nav, edit, capture, import, new note | `GET /teams/:id/kb/notes` nav grouped by folder + filter, `GET /teams/:id/kb/note?path=` rendered read-only                                                                                       |
| Graf      | `GET /api/memory/graph` + tier filter           | `GET /api/teams/:id/kb/graph`; a node opens the note in the Trezor (`?source=team:<id>&note=<relPath>`)                                                                                           |
| Destilace | distillation automations + self-model           | `GET /teams/:id/kb/ingest` log + "Run ingest" (starts `team-kb-ingest` on the KB project through `POST /api/tasks`); no registered project -> empty state, see `docs/workflows/team-kb-ingest.md` |

The team graph is built by `KbReaderService.graph` from resolved `[[wikilinks]]`; `.vtt`
transcripts and `_templates/` are not nodes and not listed notes.

## Bulk import (Phase 112)

**File:** `apps/api/src/memory/memory-import.service.ts` (`MemoryImportService`)

`POST /api/memory/import` (contract: `libs/contracts/src/memory/memory.contract.ts`)
bulk-imports `.md`/`.txt` files from a server-side folder into a staging queue
(`import/`, a sibling of the vault dir, never a subdir of it — `VaultService.scan()`
never walks into it). `stageFrom(sourcePath)` copies every accepted file into the
queue with a collision-safe name (5 MiB per-file cap; oversized/unsupported/unreadable
files are skipped and tallied, never silently dropped, never fatal to the walk). A
separate `ingestQueue()` turns each queued file into a raw ("halda") knowledge note
(frontmatter title preserved for `.md`, filename-derived otherwise) for the existing
nightly triage sweep to pick up, then archives the source into
`import/_imported/<YYYY-MM-DD>/` — idempotent, since an archived file is no longer in
the queue to re-ingest.

## Entity-directory MCP (`entity-mcp.controller.ts`)

**File:** `apps/api/src/memory/entity-mcp.controller.ts` (`EntityMcpController`)

`POST`/`GET /api/memory/mcp` is a second in-process MCP server (mirrors
`ChatMcpController`'s stateless-per-request shape) exposing two tools to any run
granted the seeded `zibby-entities` MCP server row:

- `list_entities {kind, query?}` — structured, on-demand lookup over a named catalog
  (`skills`, `mcp`, `commands`, `hooks`, `projects`, `companies`,
  `integrations`, `goals`, `automations`), reduced to `{id, name?, description?}` and
  optionally filtered by a case-insensitive substring. Fail-open per catalog — a
  storage hiccup logs and returns `[]`.
- `recall_memory {query}` — the same vault search as the chat MCP's tool (see below).

Unlike the chat MCP, this endpoint is not scoped to a chat conversation and carries
no `ChatMcpAuthGuard`-style auth of its own.

### Shared recall helper

**File:** `apps/api/src/memory/recall.helper.ts` (`recallMemory`)

The vault-search + formatting logic behind both MCP servers' `recall_memory` tool
lives in exactly one place: it searches the vault, renders the top few hits (title +
snippet, Czech), and envelopes each snippet via `envelopeInbound` (Law 4) before it
enters the returned string, since a hit's snippet can be raw/imported or distilled
content.

Scope: the chat `recall_memory` is unscoped (the operator is the principal, F8). The
entity-directory `recall_memory`, which any run is granted, passes
`{ globalWorkOnly: true }` — project-owned and `domain: personal` notes are dropped
before capping, so a run in project A can never recall project B's (or personal)
notes. A run's own project notes reach it through grounding instead.

## Cross-project isolation (M7)

A run in project A must never "reach" project B's memory. The workspace is already
isolated structurally (a per-project worktree from `project.path` + an explicit
`--add-dir` allowlist). The leak was in the grounding **read path**: `compose` used
`projectId` _additively_, while `vault.index()` returned every note with no filter —
so a run in A could pull in project B's MOC through a term match.

The fix (purely restrictive, no migration):

- `IndexEntry` carries `project` (the owner). `ownerProjectOf` derives it from
  frontmatter: an explicit `project: <id>` tag, or a `type: project` profile note
  (its own `id`). A note with no owner is **global** (North Star, `knowledge/`,
  system digests).
- `visibleToProject(entries, projectId)` narrows candidates _before_ term-matching: a
  run sees only global notes plus its own project's notes; an unattributed run sees
  only global notes.
- Profile notes (`vault/projects/<id>.md`) are tagged `project: <id>`.

## Error states

| Error                | HTTP | When                                             |
| -------------------- | ---- | ------------------------------------------------ |
| `NoteNotFoundError`  | 404  | The id doesn't exist in any tier                 |
| `InvalidNoteIdError` | 422  | The id contains `/`, `..`, or starts with `.`    |
| `DuplicateNoteError` | 409  | The id already exists (even in a different tier) |
