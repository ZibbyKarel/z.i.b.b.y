BATCH: contracts-b

[SEVERITY: Critical] [FILE: libs/contracts/src/integrations/integration.schema.ts:174] [CATEGORY: Type Safety]
Type `Integration` is inferred from unrefined `IntegrationObjectSchema` instead of the strict `IntegrationSchema`. This bypasses the `superRefine(requireExactlyOneOwner)` constraint in the type system, allowing code to construct invalid Integration objects where both or neither of projectId/companyId are set. (Pozn. orchestrátora: typová díra na XOR invariantu Company/Project ownershipu — reálně spíš High; runtime validace přes IntegrationSchema stále platí.)
Apply `export type Integration = z.infer<typeof IntegrationSchema>;` to enforce the ownership constraint at the type level.

[SEVERITY: High] [FILE: libs/contracts/src/companies/companies.contract.ts:41] [CATEGORY: Input Validation]
Search query parameter lacks `.min(1)` validation; clients can submit empty `q` string. Same issue in discovery.contract.ts:50 and integrations.contract.ts:35.
Add `.min(1)` to all query search strings.

[SEVERITY: High] [FILE: libs/contracts/src/memory/memory.contract.ts:37, 50, 71, 79, 87] [CATEGORY: Input Validation]
Path parameter `:id` in `/memory/note/:id`, `/memory/notes/:id`, `/memory/notes/:id/append`, `/memory/index/:id/links` uses bare `z.string()` without format validation. Can accept empty strings or invalid note IDs.
Validate pathParams with `z.object({ id: NoteIdSchema })` (enforces the format regex).

[SEVERITY: Medium] [FILE: libs/contracts/src/monitors/monitor.schema.ts:35] [CATEGORY: Input Validation]
`detail` field on MonitorEventSchema has no length constraints — unbounded strings can cause storage/display issues.
Add `.min(1).max(4000)` or a reasonable bound.

[SEVERITY: Medium] [FILE: libs/contracts/src/machine/machine.schema.ts:13, 15, 30, 43] [CATEGORY: Input Validation]
User input strings lack `.max()` bounds: `folder`, `find`, `query`, `path` all use `.min(1)` but no upper limit.
Apply `.max(2048)` or domain-specific ceilings.

[SEVERITY: Medium] [FILE: libs/contracts/src/integrations/integration.schema.ts:156, 161] [CATEGORY: Schema Consistency]
Optional `name` field in `IntegrationSchema` lacks `.min(1)`; empty strings are valid — inconsistent with other optional fields.
Disallow empty strings or document the permissiveness.

[SEVERITY: Low] [FILE: libs/contracts/src/memory/memory.schema.ts:32, 121] [CATEGORY: Schema Weakness]
`frontmatter: z.record(z.string(), z.unknown())` permits arbitrary nested structures with no validation. Backwards-compatible for Obsidian, but weakens type safety at the boundary.
Consider a stricter union of frontmatter value types with fallback for legacy notes.

[SEVERITY: Low] [FILE: libs/contracts/src/memory/memory.contract.ts:96] [CATEGORY: Response Consistency]
Import endpoint returns 400 for `sourcePath` validation error, but other mutations in the same contract return 422 — inconsistent error semantics.
Standardize on 422 or document the distinction.

Pozitivum: integrations response schémata credentials neexponují (hasCredentials boolean) — potvrzeno i z web-integrations batche.

STATS: 43 souborů (26 non-test schema+contract napříč 13 doménami), 3389 řádků. Největší: integration.schema.ts (228), gate.schema.ts (182), memory.schema.ts (178).
