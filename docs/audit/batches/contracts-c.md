BATCH: contracts-c

[SEVERITY: High] [FILE: libs/contracts/src/projects/projects.contract.ts:59] [CATEGORY: Inconsistency — error-shape/status-code]
`getProject`/`updateProject`/`deleteProject`/… type `pathParams: z.object({ id: ProjectIdSchema })` (regex + max(128)). An id failing that shape is rejected by ts-rest's validator as a bare 400 before the handler runs — never reaching the contract's declared 404 `ErrorSchema`. `subsystems.contract.ts:28-33` explicitly documents this trap and deliberately uses plain `z.string()`; projects and skills didn't apply the same fix.
Widen `id` pathParams to plain `z.string()` and let the handler return the documented 404.

[SEVERITY: High] [FILE: libs/contracts/src/skills/skills.contract.ts:39] [CATEGORY: Inconsistency — error-shape/status-code]
Same bug: `getSkill`/`updateSkill`/`deleteSkill` type pathParams with `SkillIdSchema`, so a malformed id 400s instead of the declared 404.
Same fix — plain `z.string()` pathParam.

[SEVERITY: High] [FILE: libs/contracts/src/projects/project.schema.ts:231] [CATEGORY: Missing validation — mutation body]
`ProjectSecretsInputSchema = z.record(z.string(), z.string())` has zero constraints: no key-count cap, no key-format check (keys become subprocess env var names), no per-value length cap. This body feeds credentials injected directly into `claude -p` run environments.
Add a bounded record (max key count, env-safe key regex, value length cap).

[SEVERITY: High] [FILE: libs/contracts/src/pipelines/pipeline.schema.ts:235] [CATEGORY: Missing validation — mutation body]
`UpdatePipelineSchema = PipelineObject.omit({id}).partial()` does not re-apply `refinePipeline`'s superRefine (unique phase ids, resolvable loop.to/driftTo/then) that CreatePipelineSchema gets. A PATCH can push duplicate phase ids or dangling loop targets past the contract boundary; the "storage re-validates" safety net lives outside libs/contracts.
Reapply the superRefine on update, or re-run `refinePipeline` at the contract layer.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task.schema.ts:435] [CATEGORY: Missing validation — mutation body]
`CreateTaskInputSchema.paths: z.array(z.string()).max(64)` bounds the array but not the elements: empty/whitespace/arbitrarily long strings pass. These become `--add-dir` grants — the schema enforces none of the "absolute + existing dir" invariant, leaving 100% of that gate to downstream code.
Add `.min(1)` + max length per element; consider rejecting relative-looking values.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task.schema.ts:462] [CATEGORY: Missing validation — mutation body]
`CreateTaskInputSchema.toolGrants: z.array(z.string()).optional()` has no `.max()` at all (contrast `paths`, capped at 64) and no per-element bound.
Cap array length and per-element length.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task.schema.ts:339] [CATEGORY: Inconsistency — duplicated bound]
`ScheduledTaskSchema.paths`/`toolGrants` (persisted shape) drop the `.max(64)` bound that create-input applies — the write-path validates a cap the persisted shape doesn't reassert.
Reuse one shared bounded schema across create-input and persisted shapes.

[SEVERITY: Medium] [FILE: libs/contracts/src/pipelines/pipeline-run.schema.ts:13] [CATEGORY: Duplicate schema pattern]
`StageRunStatusSchema` hand-copies the exact six values of shared `RunStatusSchema` (common.schema.ts:32) instead of reusing it; same at `tasks/task-run.schema.ts:31` (`TaskRunStatusSchema`) — three hand-maintained copies of the same base value set.
Derive from `RunStatusSchema.options` so a new run state can't silently miss an enum.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task-run.schema.ts:187] [CATEGORY: Duplicate schema — move to common]
`TaskRunArtifactSchema` is byte-for-byte identical to `PipelineRunArtifactSchema` (pipelines.contract.ts:32); comments cross-reference each other.
Extract one `RunArtifactSchema` into common.schema.ts.

[SEVERITY: Medium] [FILE: libs/contracts/src/projects/project.schema.ts:11] [CATEGORY: Inconsistency — ID typing]
`ProjectIdSchema = AgentIdSchema`, `SkillIdSchema = AgentIdSchema` — agent/project/pipeline/skill ids are all structurally identical, no branding, so TS can't catch a project id passed where an agent id is expected. Meanwhile `pipelines.contract.ts:9` defines its own weaker `PipelineIdParam` — a third variant.
Brand each id type (`.brand<"ProjectId">()`) or standardize the pathParam shape across contracts. (Souvisí s plánovaným entity-id refaktorem — docs/plans/entity-id-refactor.md.)

[SEVERITY: Medium] [FILE: libs/contracts/src/projects/project-pr.schema.ts:11] [CATEGORY: Duplicate schema pattern]
`ProjectPrSchema {number,title,url,...}` and `self/self.schema.ts:9` `SelfPrSchema {number,title,url}` are two independent "one open GitHub PR" shapes.
Factor a shared `PrSummarySchema` base into common.schema.ts.

[SEVERITY: Medium] [FILE: libs/contracts/src/speech/speech.schema.ts:11] [CATEGORY: Missing validation — user input]
`SpeechSynthesizeInputSchema.text: z.string().min(1)` has no `.max()` — unlike task text (capped at 8000) — allowing arbitrarily large synthesis requests against speakd.
Add a `.max()` cap consistent with other free-text inputs.

[SEVERITY: Low] [FILE: libs/contracts/src/tasks/task.schema.ts:242] [CATEGORY: Missing validation — mutation body]
`TaskOutputSchema` file variant and `PipelineFileOutputSchema` (pipeline.schema.ts:99) both accept `to: z.string().min(1)` with no path-traversal guard (no `..` rejection) even though `dest: "project"` writes into the project worktree.
Add a refine rejecting `..` segments and unintended absolute paths.

[SEVERITY: Low] [FILE: libs/contracts/src/projects/project.schema.ts:155] [CATEGORY: Weak schema — unconstrained record]
`ProjectSchema.env: z.record(z.string(), z.string())` — no key-count cap, key-format check, or value length cap.
Cap key count and value length.

[SEVERITY: Low] [FILE: libs/contracts/src/projects/project.schema.ts:130] [CATEGORY: Sensitive data — convention not schema-enforced]
`ProjectSchema.env` is documented "non-secret", but nothing stops an operator/agent putting a secret value in `env`, which then round-trips in plaintext on every GET /projects response — the separation from write-only secrets is discipline, not schema.
Consider a heuristic reject (common secret shapes) or UI-level warning.

[SEVERITY: Low] [FILE: libs/contracts/src/pipelines/pipeline.schema.ts:71] [CATEGORY: Missing validation — mutation body]
`PipelinePhaseSchema.commands: z.array(z.string().min(1))` (verify-phase shell commands, `&&`-joined and shell-executed) has no array or per-string max. Operator-only authorship, but worth a sanity cap.
Add caps.

[SEVERITY: Low] [FILE: libs/contracts/src/self/self.contract.ts:30] [CATEGORY: Duplicate schema pattern]
The `body: z.object({}).optional()` idiom is repeated verbatim in self.contract.ts:30, projects.contract.ts:135, subsystems.contract.ts:46, task-runs.contract.ts:91.
Add a shared `EmptyBodySchema` in common.schema.ts.

STATS: 37 files, 4405 řádků. Top 3 non-test: tasks/task.schema.ts (495), pipelines/pipeline.schema.ts (238), pipelines/pipeline-run.schema.ts (224).
