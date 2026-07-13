BATCH: api-mcp-misc

[SEVERITY: Medium] [FILE: apps/api/src/mcp/mcp.controller.ts:36-38] [CATEGORY: Security - secret leak]
`McpServer.headers` (the entity's non-credential `headers` field, distinct from the gitignored credentials store) is persisted to committed config (`data/mcp-servers`) and returned verbatim by `listMcpServers`/`getMcpServer`. Nothing prevents an operator from putting a real secret there instead of in `setMcpCredentials`, so it can land in git history and every GET response. (Stejný discipline-not-schema vzor jako project.env.)
Doporučení: reject/redact secret-looking header values on write, or move `headers` behind the write-only credentials store.

[SEVERITY: Medium] [FILE: apps/api/src/mcp/mcp.storage.service.ts:74-80] [CATEGORY: Concurrency / race condition]
`create()` (and the identical pattern in hooks.storage.service.ts:31-37 and commands.storage.service.ts:36-42) does an unlocked `fileExists` check followed by a separate `writeEntity` — classic TOCTOU. Two concurrent POSTs for the same id can both pass the existence check and one silently overwrites the other instead of a 409. `withPathLock` exists but none of these three use it. (Systémový lost-update vzor — kořen v shared EntityFileStore.)
Doporučení: wrap create/update in `withPathLock(file, …)`.

[SEVERITY: Medium] [FILE: apps/api/src/gaps/gap-detector.service.ts:65] [CATEGORY: Input handling / content injection]
`sample: entry.summary.trim()` is interpolated directly into a vault Markdown bullet (`writeGaps`) with no escaping. `task-created` activity summaries originate from task-scheduler, reachable from autonomous/channel-derived task creation. A summary with newlines or Markdown control sequences (another `- [ ] …`, a closing code fence) can inject extra bullet items or corrupt the note that later feeds the morning briefing. Same pattern in pattern-extractor for action/decision strings (lower risk — internal enums). (Párový nález k self-knowledge composer marker injection a briefing prompt injection — vault Markdown je opakovaně nechráněný sink.)
Doporučení: strip/escape newlines and leading `-`/`#`/backtick before interpolating untrusted summaries into vault Markdown.

[SEVERITY: Low] [FILE: apps/api/src/mcp/mcp.errors.ts, hooks/hooks.errors.ts, commands/commands.errors.ts] [CATEGORY: Duplication]
The `<Entity>NotFoundError`/`<Entity>ConflictError`/`Invalid<Entity>IdError` trio is copy-pasted near-verbatim across all three; same for the CRUD storage boilerplate and the ts-rest handler wiring across the three controllers. (Systémový CRUD-boilerplate vzor napříč všemi katalogovými moduly.)
Doporučení: factor a `makeEntityErrors(name)` factory and a default `create`/`update` on `EntityFileStore` parameterized by Zod schema + conflict-error ctor.

[SEVERITY: Low] [FILE: apps/api/src/patterns/pattern-extractor.service.ts:139-145, gaps/gap-detector.service.ts:129-135] [CATEGORY: Duplication]
`parseProposalsFromNote` and `parseGapsFromNote` are byte-for-byte identical; the surrounding extract/detect methods share an identical tally→filter→sort→slice→map shape.
Doporučení: extract a shared `parseChecklistBullets(body)` helper and a generic top-N-tally utility.

[SEVERITY: Low] [FILE: apps/api/src/pins/pins.store.ts:30] [CATEGORY: Performance - sync fs]
`PinsStore.load` uses synchronous `readFileSync` in the constructor (mirrors SystemConfigStore by design). Negligible impact.
Doporučení: none if intentional; awareness only.

[SEVERITY: Low] [FILE: apps/api/src/mcp/mcp.controller.ts:66-72] [CATEGORY: Error handling]
`deleteMcpServer` calls `storage.delete(id)` then `credentials.remove(id)` as two non-transactional steps — a crash between them orphans the credentials file on disk.
Doporučení: remove credentials first, then the entity, or accept the residual-file risk in a comment.

[SEVERITY: Low] [FILE: apps/api/src/mcp/, hooks/, commands/, pins/ controllers] [CATEGORY: Test coverage]
None of the four controllers have a dedicated test — `credentialMatchesType` 422 branch, credential cascade-delete ordering, and ts-rest error-mapping wiring have no direct unit coverage.
Doporučení: add controller specs (or confirm e2e) for the 422 credential-mismatch path and the delete-cascade.

[SEVERITY: Low] [FILE: apps/api/src/gaps/gap-detector.service.ts, patterns/pattern-extractor.service.ts] [CATEGORY: Nest.js best practice]
Both swallow `writeSuggestions`/`writeGaps` failures with only a `log.warn` (fire-and-forget) — reasonable "proposals ≠ acts" choice, but a persistently broken vault write path degrades silently forever.
Doporučení: surface repeated write failures via a health/automation-status signal.

STATS: 27 souborů, 1665 řádků. Top 3: patterns/pattern-extractor.service.ts (145), gaps/gap-detector.service.ts (135), patterns/pattern-extractor.service.test.ts (132).
