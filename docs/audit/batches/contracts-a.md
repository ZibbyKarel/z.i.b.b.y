BATCH: contracts-a

POZN. ORCHESTRÁTORA: nález č. 1 (z.unknown() na raw) je reálně spíš High než Critical — jde o úložiště syrového provider payloadu, riziko je smuggling nestrukturovaných dat do auditního záznamu, ne přímá exekuce. Při agregaci normalizovat.

[SEVERITY: Critical] [FILE: libs/contracts/src/channels/channel.schema.ts:67] [CATEGORY: Weak schema - unknown type without validation]
`raw: z.unknown()` accepts any untrusted provider payload without structure validation. Combined with triage running over channel text (Law 4: strict handling of untrusted input), the raw field could smuggle arbitrary data structures into the audit record. (Reálná severity: High)
Recommendation: Define an explicit union of known payload shapes per IntegrationKind, or at least `z.record(z.unknown())` to signal deliberate permissiveness.

[SEVERITY: High] [FILE: libs/contracts/src/commands/command.schema.ts:31] [CATEGORY: Weak schema - unvalidated enum field]
`model: z.string().optional()` accepts any string instead of the closed set [opus, sonnet, haiku]. The agent has AgentModelSchema, the command does not.
Recommendation: Replace with `z.enum(['opus','sonnet','haiku']).optional()`.

[SEVERITY: High] [FILE: libs/contracts/src/chains/chain.schema.ts:11] [CATEGORY: Schema inconsistency - wrong ID type]
ChainStepSchema.pipeline uses AgentIdSchema but the field represents a pipeline id. ChainRunStepSchema:47 uses bare `z.string().min(1)` — the schema is inconsistent with itself.
Recommendation: Create a PipelineIdSchema and use it consistently.

[SEVERITY: Medium] [FILE: libs/contracts/src/automations/automation.schema.ts:31] [CATEGORY: Weak schema - unvalidated cron expression]
`expr: z.string().min(1)` accepts any string without validating cron syntax. A malformed cron parks the scheduler silently; no 422 at dispatch.
Recommendation: Add a regex for 5-field cron syntax, or document handler-level parse-error handling.

[SEVERITY: Medium] [FILE: libs/contracts/src/agents/agent.schema.ts:53-55] [CATEGORY: Weak schema - unvalidated array contents]
`tools`/`optionalTools` are `z.array(z.string()).optional()` without validating contents — a malformed tool id reaches the runner.
Recommendation: Define a ToolIdSchema, or document catalog validation in the handler.

[SEVERITY: Medium] [FILE: libs/contracts/src/channels/channel.schema.ts:31] [CATEGORY: Weak schema - unbounded string]
`reason: z.string()` in TriageVerdictSchema lacks bounds — inconsistent with `summary` capped at 280.
Recommendation: Add `.max(500)` or match summary's cap.

[SEVERITY: Medium] [FILE: libs/contracts/src/chat/chat.schema.ts:33] [CATEGORY: Weak schema - unbounded string]
`name: z.string()` in ChatToolEventSchema has no length bounds.
Recommendation: Add `.min(1).max(256)`.

[SEVERITY: Medium] [FILE: libs/contracts/src/channels/channel.schema.ts:65] [CATEGORY: Weak schema - unbounded text]
`text: z.string()` in ChannelItemSchema lacks `.max()`. The docstring says "sanitized, length-capped" but the schema does not enforce it.
Recommendation: Add a reasonable cap (`.max(10000)`), document sanitization in the handler.

[SEVERITY: Medium] [FILE: libs/contracts/src/agents/agents.contract.ts:76, automations.contract.ts:63, chains.contract.ts:38, commands.contract.ts:56] [CATEGORY: Response envelope inconsistency]
DELETE responses return different shapes: agents/automations `{ id: AgentIdSchema }`, chains `{ id: z.string() }`, commands `{ id: CommandIdSchema }` — same affordance, different shapes (proti "one interaction grammar").
Recommendation: Define a shared DeleteResponseSchema in common.schema and reuse.

[SEVERITY: Medium] [FILE: libs/contracts/src/automations/automations.contract.ts:71, channels/channels.contract.ts:59] [CATEGORY: Response envelope inconsistency]
triggerAutomation returns `{ runRef }`, createJiraIssue returns `{ approvalId }` — both secondary-resource-created responses with different key names.
Recommendation: Standardize the reference-key shape and document semantics.

[SEVERITY: Low] [FILE: libs/contracts/src/agents/agent.schema.ts:46-56] [CATEGORY: Weak schema - free-form optional strings]
`name`, `description`, `glyph`, `category` are all unbounded `z.string().optional()`.
Recommendation: Add `.min(1).max(256)` to name/description, `.max(64)` to glyph/category.

[SEVERITY: Low] [FILE: libs/contracts/src/briefing/briefing.schema.ts:97-103] [CATEGORY: Unbounded arrays]
`trend7d`, `learnedPatterns`, `automationGaps`, `appIdeas` are `z.array(z.string()).optional()` without bounds on array size or string length.
Recommendation: Add semantic caps per field.

STATS: 38 souborů across 12 resource folders, 2947 řádků (bez testů). Top 3: activity.schema.ts (191), automation.schema.ts (137), activity-view.schema.ts (118).
