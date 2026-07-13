BATCH: api-memory-core

[SEVERITY: High] [FILE: apps/api/src/memory/claude-cli-distiller.ts:145-190] [CATEGORY: Injection / untrusted input]
Run excerpts, chat text, and imported note bodies (all originate from external channels, agent output, or operator-supplied files) are embedded verbatim into the `claude -p` prompt with only a system-prompt instruction as guard; a crafted excerpt can attempt to override the distiller's instructions, and the resulting "learning"/triage verdict is written into the vault, later re-injected into every future run's system prompt via grounding.service.ts. Directly touches Law 4. (Klíčový cross-cutting nález — inbound → memory → grounding → future run prompt.)
Doporučení: wrap excerpts in an explicit untrusted-data delimiter the system prompt tells the model never to treat as instructions; consider flagging distilled notes as lower-trust until reviewed.

[SEVERITY: Medium] [FILE: apps/api/src/memory/vault.service.ts:333-357,401-426] [CATEGORY: Concurrency / race condition]
`createNote`, `updateNote`, and `appendToNote` do a read-modify-write (scan → read → mutate → writeFileAtomic) with no serialization, unlike `updateIndex` which already uses `withPathLock` for exactly this reason (documented Phase 8.2). Concurrent calls on the same note id (nightly triage racing an API update) can silently lose one write; `createNote`'s duplicate check is TOCTOU-racy. (Stejný lost-update vzor jako scheduler/pipeline-runner/run-recorder.)
Doporučení: key `createNote`/`updateNote`/`appendToNote` through `withPathLock(id)` like `updateIndex`.

[SEVERITY: Medium] [FILE: apps/api/src/memory/memory-import.service.ts:246-256] [CATEGORY: Performance]
`ingestQueue` calls `createNote` once per queued file; `createNote` resets `VaultService`'s scan cache on every write, so ingesting N files against a vault of M notes triggers ~N full vault re-walks (O(N·M) file reads).
Doporučení: scan once before the ingest loop and batch cache invalidation.

[SEVERITY: Medium] [FILE: apps/api/src/memory/claude-cli-distiller.ts] [CATEGORY: Missing tests]
No dedicated test file exists; the only reference fully mocks `ClaudeCliDistiller`, so `runClaude`, `parse`/`extractResultText`, the timeout path, and both Zod schema-reject paths have zero coverage.
Doporučení: add a distiller-focused suite stubbing `spawn`/`runClaude`.

[SEVERITY: Low] [FILE: apps/api/src/memory/claude-cli-distiller.ts:192-251] [CATEGORY: Duplicate logic]
`runClaude`/`parse`/`extractResultText` are near-verbatim copies of `briefing/claude-cli-briefer.ts`'s same-named methods — comments say "copies X's shape EXACTLY", reference a third `ClaudeCliTriager`. (Potvrzuje cross-cutting spawn/parse duplikaci.)
Doporučení: extract a shared `runClaudeJson()` helper reused by briefer/distiller/triager.

[SEVERITY: Low] [FILE: apps/api/src/memory/vault.service.ts] [CATEGORY: Maintainability]
Largest in batch (534 lines) — scan/index/graph, full-text search, dedupe/similarity heuristics, note CRUD, and MOC-linking in one class. Under 600 but worth watching.
Doporučení: if it grows, extract the dedupe heuristic (jaccard/tokenize/findSimilar).

[SEVERITY: Low] [FILE: apps/api/src/memory/memory-import.service.ts:166-177] [CATEGORY: Access control]
`stageFrom(sourcePath)` only validates existence/directory/readability — no allow-listed root — so a caller can point the importer at any host directory readable by the process and have `.md`/`.txt` contents copied into the vault and surfaced in grounding.
Doporučení: confirm this endpoint is gated to operator-only Tier; otherwise scope `sourcePath` to an allow-listed root.

[SEVERITY: Low] [FILE: apps/api/src/memory/memory-distiller.service.ts:247-261] [CATEGORY: Performance]
`summarizeAgent` calls `agents.readLog(run.runId, 0)` (read from start) only to keep `.slice(-EXCERPT_LIMIT)` (last 1200 chars) — a full-log read for a tail-only need. (Stejný tail-read anti-vzor jako pipeline-runner tailLog.)
Doporučení: use a tail-read mode on `readLog`.

STATS: 6 files, 1752 lines. Top 3: vault.service.ts (534), memory-distiller.service.ts (507), memory-import.service.ts (310).
