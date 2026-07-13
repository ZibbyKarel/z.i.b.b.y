BATCH: api-tasks-routing

[SEVERITY: High] [FILE: apps/api/src/tasks/attachment-storage.service.ts:22-34] [CATEGORY: Security - MIME spoofing]
`save()` stores the client-supplied `mimetype` verbatim with no allow-list or content sniffing, and `tasks.controller.ts:134-138` serves it back as the `Content-Type` with `disposition: inline`. An uploaded file whose declared type is `text/html` or `image/svg+xml` is rendered inline in the app's origin — a stored-XSS vector once attachments can originate from anything other than the operator's own hand (the automation attachment-ref provider suggests they can).
Whitelist a small set of safe inline media types (or force `attachment` disposition / re-derive type from file signature) before serving.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/attachment-storage.service.ts:27-31] [CATEGORY: Data integrity]
Two files uploaded in the same batch with an identical `originalname` silently overwrite each other on disk, but both entries are still recorded in metadata — the UI can show two attachments where only one physical file exists. (Známý deferred bod "dup-basename" z project_task_attachments_delivered — stále nevyřešen.)
De-duplicate/disambiguate basenames within a batch before writing.

[SEVERITY: High] [FILE: apps/api/src/tasks/claude-cli-router.ts:124-156] [CATEGORY: Duplicate logic]
`runClaude`, `extractResultText` and the fenced-JSON parser are duplicated almost verbatim in `claude-cli-task-namer.ts:67-126` and a third time in `apps/api/src/briefing/claude-cli-briefer.ts` (spawn args, 8s timeout pattern, stdout/stderr accumulation, envelope unwrap). Three independent copies will drift.
Extract a shared `runClaudeCli(prompt, opts)` helper and have all three callers use it.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/claude-cli-router.ts:126-130] [CATEGORY: Security - sensitive data exposure]
The full task text (up to 4000 chars, verbatim operator input) is passed as a `spawn` argv element (`["-p", prompt, ...]`), visible to any local process listing (`ps aux`) for the process lifetime. Same pattern in `claude-cli-task-namer.ts:69-73`. Project memory records an incident of a plaintext password in a chat prompt, so task text is not guaranteed innocuous.
Pass the prompt via stdin instead of argv.

[SEVERITY: Low] [FILE: apps/api/src/tasks/claude-cli-router.ts:140-145] [CATEGORY: Performance - unbounded buffer]
`stdout`/`stderr` accumulate with no size cap while the child runs (also `claude-cli-task-namer.ts:83-88`), unlike the project's capped-read pattern (1MiB readLog cap).
Cap accumulated size and kill the child if exceeded.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/claude-cli-router.ts] [CATEGORY: Missing tests]
No `.test.ts` exists for `ClaudeCliRouter`. `parseVerdict`, `extractResultText`, `parseJsonObject` and the catalog id-coherence check parse untrusted subprocess output into a routing decision with zero direct unit coverage.
Add unit tests covering malformed/fenced/partial JSON, unknown target id, and the timeout path.

[SEVERITY: Low] [FILE: apps/api/src/tasks/tasks-attachments.test.ts] [CATEGORY: Missing tests]
The attachment suite covers path traversal and default content-type fallback but never exercises a supplied `mimetype` (e.g. `text/html`) being served back verbatim — exactly the gap behind the MIME-spoofing finding.
Add a regression test once the content-type allow-list lands.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-classifier.service.ts:257-260] [CATEGORY: Error handling]
`buildCandidates` (and `classifyWithinSubsystem` at line 93) swallow `agents.listActive()`/`pipelines.list()` failures into `[]` with no log line — a storage outage is indistinguishable from "nothing configured yet".
Log at warn/error before falling back to `[]`.

[SEVERITY: Low] [FILE: apps/api/src/tasks/tasks.controller.ts:107-112] [CATEGORY: NestJS best practice - logic placement]
The total-set-size check (`MAX_SET_BYTES`) is inline business validation in the controller rather than in `AttachmentStorageService`.
Move the total-size check into `AttachmentStorageService.save()`.

[SEVERITY: Low] [FILE: apps/api/src/tasks/tasks.controller.ts:101-139] [CATEGORY: Response shape consistency]
The multipart upload and attachment-serve routes are plain `@Post`/`@Get` handlers outside ts-rest (necessarily), so their error shapes don't match the contract envelope.
Document the protocol exception, or map exceptions through the same `makeErrorMapper` shape.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-output.service.ts:194-200] [CATEGORY: Duplicate logic]
The "PR otevřen: …" / "PR push selhal (soft) …" note strings and `pr` result shape are built twice — in `openPrNow` and again in `resolve` — with slightly different call shapes.
Extract a shared `formatPrOutcome(result)` helper.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-output.service.ts:109-118] [CATEGORY: Security - unsanitized input]
For `dest: "vault"`, `output.to` is passed straight into `vault.createNote`/`updateNote` with no validation at this layer — traversal/collision safety depends entirely on `VaultService`.
Confirm `VaultService` sanitizes note ids, or add a defensive check matching the `resolveInside` pattern used for the `project` dest.

STATS: files=11, total_lines=1491, worst3=[task-classifier.service.ts:315, task-output.service.ts:271, claude-cli-router.ts:213]
