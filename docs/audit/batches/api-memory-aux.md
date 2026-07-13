BATCH: api-memory-aux

[SEVERITY: Medium] [FILE: apps/api/src/memory/run-recorder.service.ts:82-93] [CATEGORY: concurrency/race-condition]
`claim()` does an `await fileExists(marker)` check followed by a separate `await writeFileAtomic(marker, …)` — TOCTOU gap despite the name. If `recordAgent`/`recordPipeline` fire twice for the same run close together (a live status event racing the bootstrap sweep), both calls can pass the existence check before either writes, producing a duplicate daily-note line. (Párový vzor k race conditions v scheduleru/pipeline-runneru.)
Doporučení: claim exclusively via `writeFile(marker, …, { flag: "wx" })` and treat `EEXIST` as "already claimed".

[SEVERITY: Medium] [FILE: apps/api/src/memory/memory.controller.ts:39-106] [CATEGORY: input validation / security]
Path param `id` (getNote/updateNote/appendToNote/updateIndex) is passed straight to `VaultService` with zero controller-level validation; the only defense against path traversal is whatever `VaultService` does internally via `InvalidNoteIdError` (auditováno v api-memory-core).
Doporučení: confirm `VaultService` normalizes/rejects traversal segments; if not centralized there, add explicit validation at the controller/DTO boundary.

[SEVERITY: Medium] [FILE: apps/api/src/memory/entity-mcp.controller.ts:169-187] [CATEGORY: MCP tool exposure / authorization]
`list_entities` exposes 10 full catalogs (including companies, integrations, goals) with no per-run or per-project scoping inside the tool — any run granted the `zibby-entities` MCP server can enumerate the entire global catalog.
Doporučení: if multi-company isolation is ever a goal, add a scoping filter by caller's project/company; otherwise document as accepted single-operator-scope tradeoff.

[SEVERITY: Medium] [FILE: apps/api/src/memory/memory.controller.test.ts:26] [CATEGORY: missing tests]
Test file only covers `POST /api/memory/import`. `getNote`/`createNote`/`updateNote`/`appendToNote`/`updateIndex`/`search`/`getIndex`/`getGraph`/`appendDaily` have no controller-level tests, so the ts-rest 404/409/422 mapping for those handlers is unverified.
Doporučení: add controller tests asserting the status mappings, mirroring the import pattern.

[SEVERITY: Low] [FILE: apps/api/src/memory/memory.controller.ts:62-106] [CATEGORY: duplication]
The try/catch error-mapping block (NoteNotFoundError→404, InvalidNoteIdError→422, DuplicateNoteError/SimilarNoteError→409) is repeated near-verbatim across four handlers.
Doporučení: extract a shared `mapVaultError(error)` helper (or ts-rest exception filter).

[SEVERITY: Low] [FILE: apps/api/src/memory/entity-mcp.controller.ts:213-222] [CATEGORY: error handling]
`listEntities` catches any error from `rawList` indiscriminately and returns `[]`, logging only a warn — fail-open swallows genuine bugs as an empty catalog.
Doporučení: narrow the catch to expected storage errors, or surface a distinguishable "unavailable" marker.

[SEVERITY: Low] [FILE: apps/api/src/memory/run-recorder.service.ts:124-139] [CATEGORY: duplication / performance]
`resolveProjectRef` and `resolveProjectByPath` both do an ad-hoc `projects.list().catch(() => [])` + linear `.find()` scan instead of sharing one lookup helper.
Doporučení: factor a single `findProjectByRefOrPath` helper.

[SEVERITY: Low] [FILE: apps/api/src/memory/memory.controller.ts:143-150] [CATEGORY: NestJS best practices]
`fireDistillNow` resolves `MemoryDistillerService` via `ModuleRef.get(..., {strict:false})` at call time (DI-cycle escape hatch) rather than constructor injection.
Doporučení: no change now; if more lazy resolutions appear, extract a `LazyResolver` provider.

[SEVERITY: Low] [FILE: apps/api/src/memory/recall.helper.ts:14-15] [CATEGORY: input validation / performance]
`recallMemory` (used by both chat MCP and entity MCP) passes `query` straight to `vault.search(query)` with no length/emptiness guard.
Doporučení: add a minimal guard (trim + max length + empty short-circuit) at this shared boundary.

STATS: 6 files, 660 lines. Top 3: entity-mcp.controller.ts (248), memory.controller.ts (151), run-recorder.service.ts (140).
