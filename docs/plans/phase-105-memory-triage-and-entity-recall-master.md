# Paměť — halda/destilace, entity-aware self-knowledge, řízený recall — master plan, phases 105–109

> Design conversation (operator + Claude, 2026-07-09): the vault/grounding/nightly-distiller
> mechanism already matches the North Star's "second brain" closely (see `docs/api/memory.md`),
> but three things were missing relative to the operator's own framing: (1) a note the operator
> just dumps somewhere still has to be *chosen* a tier up front — no undifferentiated "halda"; (2)
> self-knowledge (always glued into every run's context) doesn't know about subsystems; (3) no
> agent can ever actively look anything up — grounding is 100% push, and the one active tool
> (`recall_memory`) is chat-only. This master plan closes all three, plus retires a stale
> duplicate write path the exploration surfaced. Decisions below are BINDING (from the
> conversation) — do not reopen without a new operator decision.

## Binding decisions (from the design conversation — do not reopen)

1. **No new physical vault tier.** A `raw: boolean` frontmatter flag (optional, default
   `false`/absent) marks a note as "unprocessed halda" — usable on ANY tier, not just a
   dedicated inbox. This covers both the zero-friction quick-capture case AND the "I pasted a
   whole meeting transcript straight into `knowledge/`" case with ONE mechanism (operator
   explicitly confirmed the second case must also be nightly-triaged, ruling out an
   inbox-only scope).
2. **Self-knowledge gets exactly one new section: subsystems.** Agents and pipelines are
   already covered; skills/mcp/commands/hooks/projects/companies/chains/integrations/
   goals/automations are explicitly OUT OF SCOPE for self-knowledge (operator: "hlavně
   subsystems, pipelines a agenty") — available instead via the new entity-directory tool
   (decision 4), on demand, not baked into the always-injected block.
3. **Subsystems render as static identity only** (`id`/`name`/`tagline`/`mandate`) — NOT
   live `state`/`tier2Count`/`tier3Count` (`SubsystemsService`, phase 82). Live status
   changes every few minutes; baking it into the AUTO block would make `computeDrift` read
   "changed" almost continuously, defeating the drift signal's purpose. Live status stays
   exclusively a live-query surface (`GET /api/subsystems`), never a grounded snapshot.
4. **New entity-directory MCP tool, not a self-knowledge expansion.** A structured
   `list_entities(kind, query?)` tool over the storage services — distinct in kind from
   `recall_memory` (which stays a prose/vault search). Complementary, not overlapping.
5. **`fileLearned` is retired.** `RunRecorderService`'s per-delivery `learned.md` filing is
   removed; the nightly `MemoryDistillerService` becomes the SOLE write path for
   run-derived learnings, matching the already-documented "agents stay memory-blind"
   principle end to end (`docs/api/memory.md` already claimed this was done; it wasn't).
6. **Tool-grant model is three layers**, reusing existing dispatch infra wherever possible:
   - **Ceiling** — a NEW agent-definition field `optionalTools: string[]` (distinct from
     the existing always-on `tools`): the MCP/tool ids this agent MAY be granted per run,
     but does not have by default. Absent/empty = today's behavior unchanged (memory-blind).
   - **Default proposal** — `TaskClassifierService`'s existing routing pass (the same
     `claude -p` router call that already picks the target) additionally proposes a
     `toolGrants: string[]` subset of the resolved target's `optionalTools` for THIS task.
     Advisory only — never trusted blindly at dispatch time (see phase 108).
   - **Operator override** — the New Task / CommandLine composer shows the proposal as
     pre-checked, editable checkboxes; the operator's confirmed set is what actually rides
     into the run (`CreateTaskInput.toolGrants`), independent of what the classifier proposed.

## RECON — what's already there vs. what phase 105+ adds

- `VaultService.scan()` (`apps/api/src/memory/vault.service.ts:432`, private, 5s-cached) backs
  every public read method (`index`/`note`/`graph`/`search`). No public method returns notes
  filtered by an arbitrary frontmatter flag today — phase 106 adds one reusing the same cache,
  it does NOT need a new scan/cache layer.
- `McpServerSchema` (`libs/contracts/src/mcp/mcp.schema.ts`) has no builtin/system distinction —
  any `http`-type row with `enabled: true` flows through `claude-run-command.service.ts`'s
  existing `--mcp-config` assembly and widens `--allowedTools` via `mcp__<id>__*` exactly like a
  user-added integration. The entity-directory server (phase 106) needs NO schema change here —
  it's just one more row, seeded once, pointing at a new internal endpoint.
- `ChatMcpController` (`apps/api/src/chat/chat-mcp.controller.ts`) is a per-conversation,
  stateless HTTP MCP server reachable only from the chat CLI spawn's own `--mcp-config`. Pipeline
  /agent runs go through a DIFFERENT `--mcp-config` (built in `claude-run-command.service.ts`
  from `McpServer` listings). The two paths do not share wiring today — phase 106 gives
  pipeline-stage agents parity via the `McpServer` registry path, not by touching chat's.
- `TaskClassifierService.route()`/`.enrich()` (`apps/api/src/tasks/task-classifier.service.ts`)
  computes `target`/`confidence`/`reason`/`mode`/`proposedGoal`/`paths` today — no tool-grant
  concept exists. Phase 108 adds one field to that same output; RECON confirms no other codepath
  currently reads/writes anything resembling `toolGrants`.

## Phase 105 — Contracts (foundation, contract-first)

- `libs/contracts/src/memory/memory.schema.ts`: add `raw: z.boolean().optional()` to
  `NoteSchema`, `CreateNoteSchema`, `UpdateNoteSchema` — folds into frontmatter exactly like
  `type`/`tags` today (see the existing doc comment pattern on those fields; mirror it for
  `raw`). No tier change.
- `libs/contracts/src/self-knowledge/self-knowledge.schema.ts`: add
  `subsystems: z.number().int().nonnegative()` to `SelfKnowledgeSectionsSchema`.
- `libs/contracts/src/agents/agent.schema.ts`: add `optionalTools: z.array(z.string()).optional()`
  next to the existing `tools` field — same shape, different semantics (granted on request,
  not always-on). Document the distinction inline (mirror the existing doc comment on `tools`).
- `libs/contracts/src/tasks/task.schema.ts`:
  - `TaskRoutingSchema`: add `toolGrants: z.array(z.string()).default([])` — the classifier's
    PROPOSAL (advisory).
  - `CreateTaskInputSchema`: add `toolGrants: z.array(z.string()).optional()` — the operator's
    CONFIRMED set from the dispatch UI, independent of the routing proposal. Threaded through
    to `claude-run-command.service.ts` at dispatch (phase 108 wires the actual consumption).
- Schema round-trip tests for every new field (mirror the existing `type`/`tags` tests in
  `memory.contract.test.ts`, and the routing/create-task schema tests already in
  `tasks.contract.test.ts`/wherever those live).
- Barrel exports unaffected (all additive fields on existing schemas).

## Phase 106 — API: entity-directory MCP tool + wiring parity for pipeline-stage agents

- New controller, e.g. `apps/api/src/memory/entity-mcp.controller.ts` (mirror
  `ChatMcpController`'s stateless-per-request `McpServer`/`StreamableHTTPServerTransport`
  pattern, but NOT scoped to a chat conversation): registers
  - `list_entities` — `{ kind: "skills"|"mcp"|"commands"|"hooks"|"projects"|"companies"|
    "chains"|"integrations"|"goals"|"automations", query?: string }` → reads the matching
    storage service (`SkillsStorageService`, `McpStorageService`, `CommandsStorageService`,
    `HooksStorageService`, `ProjectsStorageService`, `CompaniesStorageService`,
    `ChainsStorageService`, `IntegrationsStorageService` (via the resolved-project layer where
    relevant), `GoalsStorageService`, `AutomationsStorageService`), optionally filtered by
    `query` (id/name/desc substring, same posture as `KeywordScorer`/`recall_memory`).
  - `recall_memory` — reuse `ChatToolsService.recallMemory()`'s implementation (extract to a
    shared helper both controllers call, do not duplicate the vault-search logic) so
    pipeline-stage agents get identical semantics to chat's.
  - Route: `POST /api/memory/mcp` (new, alongside the existing REST memory endpoints), 405 on GET
    — mirror `chat-mcp.controller.ts`'s error handling verbatim.
- Seed exactly one `McpServer` row at first boot (id `zibby-entities`, `type: "http"`,
  `url: http://localhost:<api-port>/api/memory/mcp`, `enabled: true`) via whatever mechanism
  already seeds default data (RECON: check how `.zibby/data/mcp-servers/` gets its defaults, if
  any — if nothing seeds MCP servers today, this may need a one-time migration/bootstrap script
  instead of code-level defaulting; note the actual mechanism found before writing).
- No change to `claude-run-command.service.ts`'s `buildCatalog`/`--mcp-config` assembly — an
  enabled `McpServer` row already flows through unmodified.

## Phase 107 — API: raw-note nightly triage sweep + quick-capture entry point

- `VaultService`: add a public method (e.g. `rawNotes(): Promise<Note[]>`) filtering `scan()`
  results by `frontmatter.raw === true`, reusing the existing 5s cache — no new I/O pattern.
- `MemoryDistillerService.gather()`: extend to also collect `rawNotes()` as triage candidates
  alongside terminal runs/chats (own `Candidate` variant — a raw note has no `cwd`/`projectId`
  in the run sense; model it like the existing `chatId` special case).
- `ClaudeCliDistiller` (or a sibling): for each raw note, produce (a) a condensed durable
  summary (critical for a full meeting-transcript dump — strip filler, keep decisions/facts),
  (b) `type`/`tags` classification (reuse `NoteTypeSchema`), (c) related-note links via
  `VaultService.search()`/`index()` + `updateIndex` (reuse the existing MOC-link machinery), (d)
  a verdict: durable → clear `raw`, optionally relocate tier; noise/duplicate → clear `raw` but
  tag `triaged-noise`, log one daily-note line — NEVER silently delete (matches the
  distiller's existing "defer, never drop" posture for the run-cap case).
- Idempotency: raw notes need their own at-least-once marker — the existing
  `memory-distilled.json` marker lives in a run's `cwd`, which a note doesn't have. Use the
  note's own frontmatter (a `triagedAt` timestamp field, checked before re-considering) rather
  than an external marker file.
- Quick-capture entry point: extend `POST /memory/notes` so `tier` becomes optional — when
  omitted, default to `knowledge` and force `raw: true` server-side (the "I don't want to think
  about where this goes" path). An explicit `tier` + explicit `raw` still work exactly as today
  (a deliberate curated note is unaffected).
- Tests: `memory-distiller.service.test.ts` gets a raw-note fixture (durable → filed +
  unflagged; noise → unflagged + tagged + daily line, not deleted); `vault.service.test.ts`
  gets `rawNotes()` coverage; contract test for optional-`tier` create.

## Phase 108 — API: retire `fileLearned`, classifier proposes `toolGrants`, dispatch consumes confirmed grants

- `RunRecorderService`: delete the `fileLearned` codepath and its call site (the per-delivery
  `learned.md` → knowledge-note filing). Keep the daily-log outcome line — that stays.
  Remove/update its dedicated tests. Update `docs/api/memory.md`'s `RunRecorderModule` section
  to drop the now-false "learned.md" mention (or confirm-and-correct if any other code path
  still relies on the Dokumentátor producing `learned.md` — grep before deleting).
- `TaskClassifierService.route()`: when the resolved target has non-empty `optionalTools`, ask
  the router (or a lightweight follow-up heuristic if the router doesn't already reason about
  this) which of them look relevant to `input.text`; populate `TaskRouting.toolGrants` with
  that subset. Empty `optionalTools` → always `toolGrants: []`, no extra round-trip.
- Dispatch path (wherever `CreateTaskInput`/`TaskRouting` becomes an actual
  `claude-run-command.service.ts` invocation — locate in `apps/api/src/tasks/`): the FINAL
  grant set is `CreateTaskInput.toolGrants ∩ target.optionalTools` (never trust the operator's
  submitted list beyond what the target agent's own definition permits — the ceiling from
  decision 6 is enforced server-side, not just in the UI). Union the result into
  `buildCatalog`'s `allowedTools` alongside the agent's static `tools`.
- Tests: classifier proposes grants only from the target's `optionalTools`, never invents new
  ones; dispatch intersects operator input against the ceiling (a request for an ungranted tool
  is silently dropped from the final set, not an error — matches the "the UI already only shows
  what's grantable" expectation, but the server-side guard is what actually matters).

## Phase 109 — Web: quick-capture, raw-note affordance, dispatch tool-grant checkboxes

- `apps/web/features/memory`: a quick-capture entry (minimal composer — text only, optional
  title, no tier/type picker) using the phase-107 optional-`tier` create path. Reachable from
  the Memory screen's existing "new note" affordance (add a second, lighter-weight option
  alongside today's full `NoteEditorDialog` create flow — don't replace it, curated notes still
  need the full form).
  - Wire through `useCreateNoteMutation` (already exists) — likely no new mutation needed, just
    a new call site that omits `tier`.
- `NoteView.tsx` / `MemoryGraph.tsx`: a small "netříděno" badge/affordance for `raw: true` notes
  so the operator can see what's still pending triage without waiting for the nightly pass.
- CommandLine / New Task composer (`apps/web/features/commandline` or wherever
  `CreateTaskInput` gets assembled — locate via phase-91's own note that this lives in the
  CommandLine feature): render `TaskRouting.toolGrants` as pre-checked, editable checkboxes
  (label = tool id, or a friendlier name if one is easily derivable) before submit; wire the
  final state into `CreateTaskInput.toolGrants`. Hidden entirely when `toolGrants` is empty (no
  UI noise for the common case where nothing was proposed).
- Component tests: quick-capture path (mirror existing `NoteEditorDialog.test.tsx` patterns);
  raw badge rendering; CommandLine checkbox render/toggle/submit-wiring test.

## Tests (cross-cutting, in addition to each phase's own list above)

- `libs/contracts`: schema round-trip tests for every new field (105).
- `apps/api`: e2e coverage for the new `/api/memory/mcp` route (106); distiller raw-note
  fixtures (107); classifier `toolGrants` + dispatch intersection (108).
- `apps/web`: component tests per touched screen (109).

## Verification (paste real output, per phase)

- `npx tsc -p` for contracts/api/web — clean.
- `npx eslint <touched>` — clean.
- `rtk proxy npx vitest run libs/contracts apps/api/src/memory apps/api/src/tasks apps/api/src/agents apps/web/features/memory apps/web/features/commandline` — green (adjust to the real touched dirs per phase).
- `pnpm self-knowledge:generate` after phase 105/106 land, to confirm the new `SUBSYSTEMS` block
  (added alongside, see note below) and `optionalTools`-aware agents compose without drift
  surprises.

## Note: the self-knowledge `SUBSYSTEMS` block itself

Binding decision 2/3 (subsystems in self-knowledge, identity-only) is a small, self-contained
change best folded into phase 105/106 rather than its own phase:
- `apps/api/src/self-knowledge/self-knowledge.composer.ts`: add `"SUBSYSTEMS"` to `BLOCK_KEYS`,
  a `renderSubsystems(subsystems: Subsystem[])` mirroring `renderPipelines`'s shape (name +
  mandate, no live state), and fold `subsystems: input.subsystems.length` into
  `composeSelfKnowledge`'s returned `sections`.
- `apps/api/src/self-knowledge/self-knowledge.service.ts`: `gather()` adds `SUBSYSTEMS` (the
  static `readonly Subsystem[]` export — no new storage dependency, no DI cycle risk).
- Test: `self-knowledge.composer.test.ts` gets a subsystems fixture; drift test confirms adding
  the block doesn't spuriously flag existing notes without touching `computeDrift`'s per-key loop
  (it already iterates `BLOCK_KEYS`, so a new key is picked up for free — verify, don't assume).

## Global constraints (every phase)

- Contract-first: `libs/contracts` changes land before api/web consume them.
- React 19 (no `forwardRef`), no `any`, no raw inline DOM `style` in `apps/web`.
- Every new write path stays fail-open where its sibling today is fail-open (grounding, the
  nightly distiller, `RunRecorderService`) — a raw-note triage failure or an entity-directory
  MCP hiccup must never block a run or the nightly tick.
- Never silently drop a raw note as "processed" without a durable trace (tag + daily-log line at
  minimum) — mirrors the existing distiller's "defer, never drop" posture for its run cap.
- The ceiling (`optionalTools`) is enforced server-side at dispatch, not just filtered in the UI.
- Do not touch unrelated operator WIP; do not `git commit` unless asked to for this specific
  plan's work; do not run destructive git operations.
