# Entity ID refactor — split identity from name

> Status: **planned, not started.** Decided 2026-06-22. Code gated behind tree
> cleanup (commit/park the email-notify-only WIP first).

## Problem

Today an entity's `id` does three jobs at once:

1. **Identity** — the stable key other entities reference (`integration.projectId`).
2. **Human name / slug** — `mail`, `calendar`, `zibby-self`, `research-analyst`.
3. **On-disk filename** — `data/integrations/mail.json`, `data/agents/research-analyst.md`.

Because identity == name, you cannot rename an entity without breaking every
reference, and the id carries no type information. `AGENT_ID_REGEX`
(`libs/contracts/src/agents/agent.schema.ts:12`) governs almost all of them; the
client (web) slugifies a free-form name into the id before create. The API never
generates an id.

Run records are the exception — they already generate ids as
`${ownerId}_${startedMs}_${pid}` (`apps/api/src/runner/runner-core.ts:401`).

## Decisions (locked)

1. **Split `id` from `slug`.** Every config entity gets:
   - `id` — opaque, immutable, **server-generated**, type-prefixed
     (`prj_…`, `int_…`, `agt_…`, `skl_…`, `gol_…`, `pip_…`, `mcp_…`).
   - `slug` — human-facing, mutable, derived from the name (today's "id").
2. **ID scheme = ULID/nanoid with a type prefix.** No global counter — multiple
   concurrent writers (API + scheduler + autonomous channel ticks) make a
   read-increment-write counter file a race. ULID is collision-free without
   coordination and time-sortable; the prefix makes it scannable in logs.
3. **Filename stays the slug.** `data/integrations/mail.json` stays human-readable
   on disk (North Star: "human-readable trace on disk"). The `id → file` lookup
   goes through a derived index (below).
4. **Files remain the source of truth (Law #2).** A database, if added, is a
   **derived, rebuildable index/cache over the files — never the source of
   truth.** It buys fast lookups (`id → path`, `projectId → integrations`)
   without breaking the law; it can be deleted and rebuilt from the files at any
   time.

## Why not a counter, why not a DB-of-record

- **Counter** — single allocation point + shared mutable file under concurrent
  writers ⇒ races. ULID needs no allocator.
- **DB as source of truth** — violates North Star Law #2 and "index-first, not
  vector RAG, dependency-free." Files stay canonical; DB is an optional index.

## Blast radius (from code survey 2026-06-22)

- `AGENT_ID_REGEX` in `agents/agent.schema.ts` is shared by agents/projects/
  skills/goals/pipelines; integrations (`integration.schema.ts:14`) and MCP
  (`mcp.schema.ts:14`) carry their own literal copies.
- Storage guard `resolveSafeFile(dir, id, ext, idRegex)` — **filename is the id
  today**; after the split the filename is the *slug*, so the guard moves to the
  slug.
- Shared stores: `EntityFileStore<T>` / `MarkdownEntityStore<T>`
  (`apps/api/src/shared/file-storage/`). `list()` derives id from the filename —
  must instead read `id` from file contents and key the index by it.
- Projects are the outlier: one JSON manifest array, not file-per-entity
  (`projects/projects.storage.service.ts`).
- **Loosely-typed cross-refs** (plain `z.string()`, NOT regex-validated, so a
  format change won't 400 — it silently breaks joins): `integration.projectId`,
  `project.schema.ts:163`, `channel.schema.ts:74-80`, `task.schema.ts:270,286`,
  `task-run.schema.ts`, `activity.schema.ts:74-84` (references nearly
  everything), `briefing`, `budget`.
- Runtime joins to verify: `integrations.controller.ts:46`,
  `channel-triage-flow.service.ts:138`, pipeline phase-id lookups.
- Already-persisted history: activity JSONL, runs, gate decisions hold old ids —
  migration must keep them resolvable (slug-based history stays valid since slug
  is preserved).

## Phased plan

1. **Tree cleanup (prereq).** Commit or park the email-notify-only WIP + handle
   graphify-out noise so the migration lands as a clean, single-topic diff.
2. **ID generator + contracts.** Add a typed `EntityId` helper (prefix + ULID).
   Add `id` (opaque) + `slug` fields to each config-entity schema. Keep `slug`
   carrying today's value so existing files/refs stay valid.
3. **Storage layer.** Server generates `id` on create; filename = slug; store
   reads `id` from contents. Build the derived index (`id → slug/path`).
4. **References.** Migrate cross-refs to point at `id`; tighten the loose
   `z.string()` ref fields to the typed id schema. Keep a slug→id resolver for
   backward-compat reads.
5. **Backfill migration.** One-shot script: read every existing file, mint an
   `id`, write it back (slug unchanged ⇒ filenames unchanged ⇒ history valid).
6. **(Optional) SQLite index.** Derived, rebuildable from files on boot.

## Open question resolved

Filename = slug (not opaque id). Lookup `id → file` via the derived index.
