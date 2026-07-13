BATCH: api-pipelines-rest

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipelines.storage.service.ts:139] [CATEGORY: Performance/sync-fs]
`fromFrontmatter` calls `avatarAssets.inlineSync()` (`readFileSync`) on every parsed entity, so `list()`/`get()` block the Node event loop with synchronous disk reads once per pipeline that carries an avatar.
Make the avatar-inline step async and thread it through `EntityFileStore.list()`/`get()`, or document and cap it.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipelines.controller.ts, pipeline-runs.controller.ts] [CATEGORY: Test coverage]
No dedicated test exercises the HTTP layer for `getPipeline`, `listPipelines`, `deletePipeline`, `listPipelineRuns`, and only one PATCH case is covered; e2e exercises almost exclusively `POST /api/pipelines`, leaving the ts-rest 404/409/422 status mapping unverified end-to-end.
Add e2e cases for GET (found/404), DELETE, list, and the 422/409 paths.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.errors.ts:26-31, pipelines.controller.ts:13-16] [CATEGORY: Error handling]
`CorruptPipelineFileError` (thrown by storage get/fromFrontmatter) is not in `makeErrorMapper`'s `missing` list, so a corrupt on-disk pipeline file surfaces as an unhandled generic 500.
Decide/document the mapping (500 typed, or 404) and add a test.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/verify-command.ts:23-28] [CATEGORY: Security/shell-injection]
`buildVerifyCommand` joins `commands`/`projectChecks` with `&&` and runs through `/bin/sh -c`, giving full shell interpretation; safety depends entirely on callers only ever passing operator-authored config (true today) but it's an implicit, undocumented trust boundary in this file.
Add a doc comment/runtime assertion that these strings must never contain untrusted content.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.storage.service.ts:194-205] [CATEGORY: Performance]
`sweepInlineAvatars()` migrates files serially in a `for...of` with `await` per file, unlike `EntityFileStore.list()` which parallelizes — scales linearly at every boot.
Parallelize with `Promise.allSettled`.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.module.ts:42-44] [CATEGORY: NestJS route ordering]
Correct routing of `/pipelines/runs` vs `/pipelines/:id` depends on `PipelineRunsController` being registered before `PipelinesController`; a comment documents it, but nothing enforces or tests it.
Add a routing e2e assertion that `GET /api/pipelines/runs` resolves to the runs handler.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.storage.service.ts:72-84] [CATEGORY: Validation (positive finding)]
Potvrzeno: `update()` re-validates the merged patch via full `PipelineSchema.safeParse` (not the partial `UpdatePipelineSchema`), correctly closing the contract-layer gap (viz contracts-c nález). Bez akce — jen doplnit cross-reference komentář u `UpdatePipelineSchema`.

STATS: files=7, total_lines=474, top3=[pipelines.storage.service.ts (218), pipelines.module.ts (54), pipelines.controller.ts (52)]
