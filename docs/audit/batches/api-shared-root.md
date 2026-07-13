BATCH: api-shared-root

[SEVERITY: Critical] [FILE: apps/api/src/shared/logging/logging.interceptor.ts:62] [CATEGORY: security/secret-leak]
POTVRZENO a ROZŠÍŘENO: the interceptor logs `req.body` in full (via `preview`) for every non-GET request, and the only excluded route is one whose URL contains `/logs`. `safeStringify` merely truncates at 500 chars/field — it does NOT redact — so secrets far shorter than that are written verbatim to stdout at `info` level (default, always emitted). Affected secret-bearing write routes, all PUT, none matching `/logs`: `PUT /api/integrations/:id/credentials` (Slack bot token / email password), `PUT /api/mcp-servers/:id/credentials` (stdio env secrets, secret headers), `PUT /api/projects/:id/secrets` (project run secrets). Chat prompt bodies are also logged and may carry pasted secrets. (Rozšiřuje api-projects Critical — leak je na TŘECH credential routes, ne jen projects.)
Doporučení: add a redaction pass (deny-list keys: token/password/apiKey/secret/env/headers/credentials, deep) and/or a `skipBody` route matcher covering `/credentials`, `/secrets`, before serializing.

[SEVERITY: High] [FILE: apps/api/src/shared/categories/category-manifest-store.ts:60] [CATEGORY: concurrency/lost-update]
`create`/`delete` do a read-modify-write (`list()` → filter/append → `writeAtomic`) with NO `withPathLock`, so two concurrent creates both read the old manifest and the second `writeAtomic` clobbers the first (lost update / TOCTOU on the conflict check). `EntityFileStore.writeEntity` similarly does not serialize concurrent writes to the same id. The atomic-rename only prevents torn files, not lost updates. (KOŘENOVÁ PŘÍČINA systémového lost-update vzoru napříč scheduler/vault/automations/pipeline/goal storage — všechny staví na tomto storu bez zámku.)
Doporučení: wrap the RMW in `withPathLock(this.file, …)` and route entity mutations through the same per-path lock; nejlépe vestavět do EntityFileStore.

[SEVERITY: High] [FILE: apps/api/src/shared/file-storage/file-utils.ts:39] [CATEGORY: testing/coverage]
The crash-safety and path-traversal core — `writeFileAtomic`, `resolveSafeFile` (regex + containment), `collisionResistantId` — has no unit test file. Path containment is exercised only indirectly. These are exactly the utilities other race-condition fixes depend on.
Doporučení: add direct tests for atomic-write tmp cleanup, and for `resolveSafeFile` traversal/absolute-escape rejection.

[SEVERITY: Medium] [FILE: apps/api/src/shared/file-storage/file-utils.ts:41] [CATEGORY: correctness/atomic-write]
The tmp-file cleanup only wraps `fs.rename`. If `fs.writeFile(tmp, …)` fails midway (ENOSPC, EACCES), a partial `.tmp` is left behind and never removed, so `.tmp` files accumulate on repeated failures. Also no `fsync`, so a crash right after `rename` can still lose the just-written data (rename atomic but not durable).
Doporučení: put the whole temp write+rename in one try with `fs.rm(tmp,{force:true})` on any failure; optionally fsync for durability-critical writes.

[SEVERITY: Medium] [FILE: apps/api/src/shared/file-storage/avatar-asset-store.ts:123] [CATEGORY: performance/sync-io]
`inlineSync` uses `readFileSync` and is called from `fromFrontmatter` at read time, so listing N entities carrying avatars does N synchronous, event-loop-blocking file reads (each an unbounded full base64 read). (KOŘENOVÁ PŘÍČINA sync-fs nálezů v pipelines/agents storage.)
Doporučení: cache/inline asynchronously, or bound and move avatar inlining off the hot list path.

[SEVERITY: Medium] [FILE: apps/api/src/shared/file-storage/entity-file-store.ts:122] [CATEGORY: performance/unbounded]
`list()` fans out `Promise.all` over every directory entry with no concurrency cap and reads each file fully into memory (no size limit). A large data dir or a single oversized entity file can exhaust file descriptors or memory.
Doporučení: cap concurrency (p-limit) and/or a per-file size guard.

[SEVERITY: Medium] [FILE: apps/api/src/shared/logging/trace.middleware.ts:24] [CATEGORY: security/log-injection]
Inbound `x-trace-id` is trusted and reused verbatim, unbounded in length and charset, then merged into every log line and echoed in the response header. A client can inject arbitrary/huge or newline-bearing values to forge or bloat log entries.
Doporučení: validate against a UUID/short-token pattern (bounded length) before adopting; otherwise mint a fresh UUID.

[SEVERITY: Low] [FILE: apps/api/src/shared/file-storage/file-lock.ts:20] [CATEGORY: correctness/reentrancy]
`withPathLock` is a correct in-process FIFO mutex, but non-reentrant: if `fn` (already holding `key`) awaits `withPathLock(sameKey, …)`, the inner call chains behind the outer's still-unsettled tail and self-deadlocks. Undocumented footgun (relevantní pro všechna doporučení "obal do withPathLock" jinde — nesmí být volán rekurzivně).
Doporučení: document non-reentrancy (and cross-process scope) in the JSDoc.

[SEVERITY: Low] [FILE: apps/api/src/shared/file-storage/avatar-asset-store.ts:152] [CATEGORY: duplication]
`resolveAssetFile` re-implements the exact `path.resolve` + `path.dirname === base` containment already in `resolveSafeFile`. Two copies of the traversal-defense can drift.
Doporučení: have the avatar store call the shared `resolveSafeFile` guard.

[SEVERITY: Low] [FILE: apps/api/src/shared/file-storage/file-utils.ts:56] [CATEGORY: security/path-containment]
`resolveSafeFile`/`resolveAssetFile` containment relies on lexical `path.dirname`, with no `realpath` — a symlink inside the data dir pointing outward would pass. Low risk given the regex guard and controlled data dir.
Doporučení: acceptable for single-operator model; consider realpath if the data dir ever becomes untrusted.

STATS: 35 souborů (33 shared + app.module + main.ts), ~2687 řádků. Top 3: shared/sse/sse.ts (175), shared/sse/sse.test.ts (175), shared/file-storage/avatar-asset-store.ts (157).
