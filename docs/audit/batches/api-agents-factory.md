BATCH: api-agents-factory

[SEVERITY: High] [FILE: apps/api/src/agents/agents.storage.service.ts:158-169] [CATEGORY: Tool allow-list gap]
`tools`/`optionalTools` frontmatter is accepted as bare arbitrary strings (`AgentSchema.tools: z.array(z.string())` in libs/contracts, no enum) — a hand-edited or API-submitted agent file can carry any string, which flows unchecked into the runner's `--allowedTools`/`--agents` construction with no cross-check against a known Claude tool-id catalog. (Potvrzuje contracts-a nález o `tools` array + runner claude-tools.ts allow-list díru — end-to-end nevalidovaná cesta.)
Doporučení: validate `tools`/`optionalTools` against a closed tool-id enum at parse time, reject/drop unknown ids.

[SEVERITY: Medium] [FILE: apps/api/src/agents/agents.storage.service.ts:150-152] [CATEGORY: Performance]
`fromFrontmatter` calls `avatarAssets.inlineSync` (synchronous readFileSync) for every agent carrying an externalized avatar, inside `list()`'s otherwise-parallel `Promise.all` — each avatar file blocks the event loop on a hot path (catalog listing for task classification/dispatch). (Stejný sync-fs vzor jako pipelines storage.)
Doporučení: make avatar inlining async and await it alongside the other file reads.

[SEVERITY: Medium] [FILE: apps/api/src/agents/agent-runner.service.ts:160-205,248-272,286-341,710-721] [CATEGORY: Maintainability]
`start`, `launch`, `rerun` and `buildCommand` all take 9-11 positional parameters; `rerun()` calls `launch()` with five trailing positional args (`undefined, undefined, undefined, rec.sessionId, undefined`), easy to mis-order and silently break attachment/toolGrant threading. (Stejný positional-args smell jako scheduler dispatch.)
Doporučení: replace positional parameter lists with a single options object per method.

[SEVERITY: Medium] [FILE: apps/api/src/agents/categories.controller.ts:8-15, agents.module.ts:45-49] [CATEGORY: Nest.js best practice]
Correct routing of `/agents/categories` vs `/agents/:id` depends on declaration order of controllers in the module array (documented in a comment, guarded only by an e2e test). (Stejný route-ordering křehkost jako pipelines module.)
Doporučení: prefer an explicit static-before-dynamic route guard or distinct path prefix.

[SEVERITY: Low] [FILE: apps/api/src/agents/agents.controller.ts:36-37] [CATEGORY: Error handling]
`updateAgent` re-validates the merged patch via `AgentSchema.parse` in storage's `update()`; `errors.or404` only intercepts `AgentNotFoundError`/`InvalidAgentIdError`, so a `ZodError` from that re-parse propagates unhandled → likely 500 instead of 400.
Doporučení: map `ZodError` to 400 in the error mapper or catch it in `update()`.

[SEVERITY: Low] [FILE: apps/api/src/agents/agent-runner.service.ts:319,730-731] [CATEGORY: Duplicate logic]
The "reject non-absolute path" defensive check for grant/attachment dirs is duplicated between `resolveGrantDirs` and `buildCommand` (comment "matches resolveGrantDirs" instead of reusing it).
Doporučení: extract a shared `isSafeAbsoluteDir` helper.

[SEVERITY: Low] [FILE: apps/api/src/agents/agent-runner.service.ts] [CATEGORY: File size]
783 lines — over the ~600 guideline; mixes spawn orchestration, worktree/project resolution, env/secrets merging, and mid-run gate evaluation.
Doporučení: extract worktree/project resolution and mid-run intent evaluation.

[SEVERITY: Low] [FILE: apps/api/src/agents/ (controllers/module/record)] [CATEGORY: Missing tests]
No dedicated unit tests for any controller, module wiring, `agent-run.record.ts` projection functions, `ORCHESTRATOR_AGENT`, or `agent-factory.module.ts`.
Doporučení: add focused tests for `agentStrategy.assemble`/`toAgentRun` (record projection is load-bearing for HTTP shape) and `intersectToolGrants`.

[SEVERITY: Low] [FILE: apps/api/src/agent-factory/] [CATEGORY: Scope note]
All 7 agent-factory files implement only the candidate-proposal pipeline; the curated catalog-build logic (cap 16, E2BIG, `selectCatalogAgents`) referenced in the brief actually lives in `runner/claude-run-command.service.ts` (auditováno v api-runner-core). Bez code change — flag, že catalog-build/E2BIG surface pokryl runner batch.

STATS: 20 files, 3065 lines. Top 3: agents/agent-runner.service.ts (783), agents.storage.service.test.ts (489), agent-runner.service.test.ts (372).
