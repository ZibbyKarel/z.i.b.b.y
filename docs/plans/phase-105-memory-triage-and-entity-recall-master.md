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
>
> **Revised 2026-07-09** after a full RECON pass (4 verification sweeps against live code). All
> file:line anchors below are verified. Corrections vs. the first draft are flagged `⚠ RECON`.

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
   live `state`/`tier2Count`/`tier3Count`. ⚠ RECON: the base `Subsystem` type
   (`libs/contracts/src/subsystems/subsystem.schema.ts:28-36`) carries only
   `id`/`name`/`tagline`/`mandate`/`color`/`heroImage` — the live fields live on the separate
   `SubsystemWithStatus` (`:130-135`). So "static identity only" is the *natural* shape of the
   static `SUBSYSTEMS` export; there is nothing extra to strip. Live status changes every few
   minutes; baking it into the AUTO block would make `computeDrift` read "changed" almost
   continuously, defeating the drift signal. Live status stays a live-query surface
   (`GET /api/subsystems`), never a grounded snapshot.
4. **New entity-directory MCP tool, not a self-knowledge expansion.** A structured
   `list_entities(kind, query?)` tool over the storage services — distinct in kind from
   `recall_memory` (which stays a prose/vault search). Complementary, not overlapping.
5. **`fileLearned` is retired.** `RunRecorderService`'s per-delivery `learned.md` filing is
   removed; the nightly `MemoryDistillerService` becomes the SOLE write path for
   run-derived learnings, matching the already-documented "agents stay memory-blind"
   principle end to end. ⚠ RECON: `docs/api/memory.md:157-159` ALREADY claims this was done — it
   is stale/aspirational; the code (`run-recorder.service.ts:145-183`, call site `:115`, three
   passing tests) still does it. Phase 108 makes the doc true, not the reverse.
6. **Tool-grant model is three layers**, reusing existing dispatch infra wherever possible:
   - **Ceiling** — a NEW agent-definition field `optionalTools: string[]` (distinct from
     the existing always-on `tools`): the MCP/tool ids this agent MAY be granted per run,
     but does not have by default. Absent/empty = today's behavior unchanged (memory-blind).
   - **Default proposal** — the classifier's routing pass additionally proposes a
     `toolGrants: string[]` subset of the resolved target's `optionalTools` for THIS task.
     Advisory only — never trusted blindly at dispatch time (see phase 108).
   - **Operator override** — the New Task / CommandLine composer shows the proposal as
     pre-checked, editable checkboxes; the operator's confirmed set is what actually rides
     into the run (`CreateTaskInput.toolGrants`), independent of what the classifier proposed.

## Verified RECON (2026-07-09) — anchors + corrections

**Contracts** (`libs/contracts`):
- `NoteSchema` (`memory.schema.ts:24-35`), `CreateNoteSchema` (`:105-114`), `UpdateNoteSchema`
  (`:118-122`). `tier: MemoryTierSchema` is REQUIRED in both `NoteSchema` and `CreateNoteSchema`.
  `MemoryTierSchema` enum = `memory|daily|knowledge` (`:4`). `type`/`tags` are optional top-level
  fields documented in the schema-level docblock (`:16-23`) — mirror that "optional, backwards
  compatible" framing for `raw`.
- `SelfKnowledgeSectionsSchema` (`self-knowledge.schema.ts:8-29`) fields today:
  `agents`, `pipelines`, `gateRules`, `channels`, `codebaseShape?`.
- `AgentSchema.tools` (`agent.schema.ts:46`) = `z.array(z.string()).optional()`, documented in the
  schema docblock (`:28-36`).
- `TaskRoutingSchema` (`task.schema.ts:195-210`); `CreateTaskInputSchema` (`:416-439`).
- Round-trip test patterns to mirror: `memory.contract.test.ts:107-166` (positive + back-compat
  + `CreateNoteSchema` variant + enum exhaustiveness), `tasks.contract.test.ts:64-97`
  (additive default + round-trip).
- ⚠ RECON: additive fields on existing schemas need **no** `index.ts` barrel change (wildcard
  re-exports). A brand-new exported symbol would.

**Memory API** (`apps/api/src/memory`):
- `VaultService.scan()` is `private`, `:432`, 5s-cached (`:169-170`), cache cleared on every write.
  Public reads: `index()` `:180`, `note()` `:191`, `graph()` `:209`, `search()` `:227`.
- ⚠ RECON: frontmatter is parsed by `gray-matter`; the WHOLE block is stored untyped in
  `RawNote.frontmatter` (`:447-457`), so `frontmatter.raw` is reachable with no parser change.
  BUT only `type`/`tags` are promoted to typed top-level `Note` fields via `typedFieldsOf()`
  (`:99-108`). A first-class `Note.raw` (needed for the web badge) requires extending
  `typedFieldsOf` to promote `raw` too.
- `recallMemory()` lives on `ChatToolsService` (`chat-tools.service.ts:85-94`); depends only on
  `VaultService.search()` + `MAX_RECALL_HITS=5` + hard-coded Czech strings — trivially extractable.
- `ChatMcpController` (`chat-mcp.controller.ts`): `@Controller()` no prefix; `@Post("api/chat/mcp")`
  builds a fresh stateless `McpServer` per request (`buildServer()` `:96`), `StreamableHTTPServerTransport`
  with `sessionIdGenerator: undefined, enableJsonResponse: true` (`:54-66`), MUST pass the
  already-parsed Nest body to `transport.handleRequest` (`:66`), `res.on("close")` closes both
  (`:58-61`), GET → 405 `Allow: POST` JSON-RPC `-32000` (`:82-93`). This is the entity-mcp template.

**Storage services** (all present, most extend `EntityFileStore<T>` with `list()`/`get(id)`):
`SkillsStorageService`, ⚠ **`McpServersStorageService`** (NOT `McpStorageService`),
`CommandsStorageService`, `HooksStorageService`, `ProjectsStorageService`,
`CompaniesStorageService`, `ChainsStorageService`, `IntegrationsStorageService`,
`GoalsStorageService`, `AutomationsStorageService`.
- ⚠ RECON: **nothing seeds `.zibby/data/mcp-servers/` today.** `McpServersStorageService` does not
  override `onModuleInit`; base only `ensureDir`s. To seed the `zibby-entities` row, add an
  `onModuleInit()` + `private seedSystem()` override mirroring `AutomationsStorageService:70,81`
  (or `PolicyStorageService:29,63`). `MCP_DIR` = `dataDir("mcp-servers")` under repo-root `.zibby/data`.
- `claude-run-command.service.ts`: enabled rows come from `this.mcp.list()` filtered by `enabled`
  (`:382-384`, failure → `[]`); `buildCatalog` (`:471-525`) unions `mcp__<id>__*` per server into
  `allowedTools` (`:498-500`); `buildMcpConfig` (`:535-563`) assembles inline `--mcp-config`
  (`:424`). An enabled row flows through unmodified — no change needed for entity-directory itself.

**Distiller** (`apps/api/src/memory`):
- `MemoryDistillerService`: `Candidate` = `{cwd, projectId, summary, chatId?, chatCount?}` (`:45-53`).
  `gather()` (`:113-162`) collects terminal pipeline/agent/goal runs + incremental chats; inner
  `consider()` skips distilled cwds, caps `MAX_RUNS_PER_PASS=30`, DEFERS overflow (never drops,
  logs). Chat special case: `cwd:""`, `chatId`, marker via `chat.markDistilled(...)` instead of the
  `memory-distilled.json` file (`:32`, `isDistilled` `:308-310`, `markDistilled` `:312-322`).
- `ClaudeCliDistiller` (`claude-cli-distiller.ts`) → `Learning{title,body,type,tags}`; `claude -p
  --output-format json --model haiku`, 30s, skipped under `VITEST`. Filing (type/tags merge, MOC
  links, daily line, `dedupe`/`SimilarNoteError`/`DuplicateNoteError`) is in the SERVICE
  `fileDigest` (`:243-295`), not the distiller — reuse it.

**Self-knowledge** (`apps/api/src/self-knowledge`):
- `composer.ts`: `BLOCK_KEYS` (`:27`) = `["META","AGENTS","PIPELINES","GATES","CHANNELS","CODEBASE-SHAPE"]`.
  `renderPipelines` (`:123-140`) — sort by id, header `## Pipelines (n)`, empty-state italic,
  per-item bullet with `name (\`id\`)` label; **mirror for `renderSubsystems`**. `computeDrift`
  (`:298-307`) iterates `BLOCK_KEYS`, skips META → a new key is picked up for free.
  `composeSelfKnowledge` (`:226-259`) builds `blocks` record (`:241-248`) and `sections` (`:229-239`).
- `service.ts` `gather()` (`:72-88`) `Promise.all`s storage lists; `channelKinds` uses the static
  `IntegrationKindSchema.options` (no live registry). Add `subsystems: SUBSYSTEMS` by importing the
  static `SUBSYSTEMS` from `@zibby/contracts` — **no new DI**.
- Static export: `SUBSYSTEMS: readonly Subsystem[]` at `subsystems/subsystem.schema.ts:47-113`.

**Classifier / dispatch** (`apps/api/src/tasks`):
- `TaskClassifierService.route()` (`:113-148`) / `.enrich()` (`:158-167`). The LLM router is
  `claude-cli-router.ts`: model returns `{targetKind,targetId,confidence,reason,matchedTerms,loop,objective}`
  (`:17-43`), mapped to `TaskRouting` at `:90-101`. `proposedGoal`/`paths`/`mode` are synthesized
  downstream, not in raw output — a `toolGrants` proposal needs a new router-verdict field +
  prompt line, then mapping. There is NO existing `toolGrants` anywhere in the repo.
- ⚠ RECON: to propose grants from the target's `optionalTools`, the classifier must resolve the
  target agent's definition (`AgentsStorageService.get`) after routing — `optionalTools` is not in
  the router output.
- Dispatch: `TaskSchedulerService.dispatch()` (`task-scheduler.service.ts:838`) calls
  `classifier.classify(...)` then branches to `agentRunner.start` (`:885`) / `pipelineRunner.start`
  (`:901`) / `goalRunner.start` (`:915`). The `claude` spawn lives inside those runners →
  `claude-run-command.service.ts`. `toolGrants` must thread `dispatch → runner.start(...) →
  buildClaudeCommand → buildCatalog` to reach `allowedTools`.

**RunRecorder**: `fileLearned()` `run-recorder.service.ts:145-183`; call site `recordPipeline` `:115`
(only `status === "done"`); daily line `appendDaily` `:122-124` (carries `[[projectId]]` +/`[[learnedId]]`).
Tests: `run-recorder.service.test.ts:145,178,192`.

**Web** (`apps/web/features`):
- `memory/Screen.tsx`: create flag `creating` (`:44`), "New note" button `data-testid="memory-note-new"`
  (`:81-89`, also empty-state `:138-140`), `NoteEditorDialog` mounted while `creating` (`:110-113`).
  `NoteEditorDialog.tsx` is create-only, tier `Dropdown` default `knowledge`, calls
  `useCreateNoteMutation` (`:48,65-66`). `mutations/useCreateNoteMutation.ts` invalidates `["memory"]`;
  `tier` is REQUIRED in the body today.
- ⚠ RECON: the New-Task composer is `features/tasks` (**not** `features/commandline`).
  `CreateTaskInput` body is assembled in `hooks/useTaskSubmit.ts` (`submitSingle` `:108-119`,
  `submitLoop` `:138-148`). `NewTaskDialog.tsx` builds `previewRouting` + renders `PlanPreview.tsx`,
  which ALREADY shows `reason`/`confidence` (`PlanPreview.tsx:18,37,54-60`). No `toolGrants`/`raw`
  reference exists anywhere in `apps/web`. Natural home for checkboxes: `NewTaskDialog.tsx` near
  `TaskOutputField` (`:175-184`), folded into the body in `useTaskSubmit.ts:108-119`.

---

## Phase 105 — Contracts (foundation, contract-first) — ✅ DONE (commit 7f2b1eb)

- [x] `memory.schema.ts`: `raw: z.boolean().optional()` on `NoteSchema`, `CreateNoteSchema`,
  `UpdateNoteSchema` (docblock framing mirrored).
- [x] `memory.schema.ts`: `CreateNoteSchema.tier` made optional; docblock notes server default
  `knowledge` + forced `raw:true` when omitted. `NoteSchema.tier` stays required.
- [x] `self-knowledge.schema.ts`: `subsystems: z.number().int().nonnegative()` added.
- [x] `agent.schema.ts`: `optionalTools: z.array(z.string()).optional()` added next to `tools`;
  distinction documented.
- [x] `task.schema.ts`: `TaskRoutingSchema.toolGrants` (default `[]`) + `CreateTaskInputSchema.toolGrants`
  (optional) added.
- [x] Round-trip tests added across `memory`/`tasks`/`self-knowledge`/`agents` contract tests;
  `libs/contracts` vitest green (323 passed). Barrel unchanged (verified).
- NOTE: expected contract-first tsc ripple in `apps/api`/`apps/web` — fixed by phases 106-109.

## Phase 106 — API: entity-directory MCP tool + self-knowledge SUBSYSTEMS block — ✅ DONE

> Landed: entity-mcp controller (10-kind `list_entities` fail-open + `recall_memory` via extracted
> `recall.helper.ts`), `zibby-entities` seed via `McpServersStorageService.onModuleInit` (runtime
> data, not committed — avoids port freeze), SUBSYSTEMS self-knowledge block (clears `:229` ripple).
> Tests: entity-mcp controller round-trip (6) + mcp seed (3) + composer subsystems; 180 passed.

- [x] New `apps/api/src/memory/entity-mcp.controller.ts` mirroring `chat-mcp.controller.ts` verbatim
  (stateless per-request `McpServer` + `StreamableHTTPServerTransport`, pass the parsed Nest body,
  `res.on("close")` cleanup), NOT scoped to a chat conversation. Route `@Post("api/memory/mcp")`,
  GET → 405 `Allow: POST` JSON-RPC `-32000`. Register in the memory module.
- [ ] `list_entities({ kind, query? })` — `kind ∈ skills|mcp|commands|hooks|projects|companies|
  chains|integrations|goals|automations`; reads the matching storage service `list()` (⚠ MCP is
  `McpServersStorageService`), optional `query` = id/name/desc substring filter (same posture as
  `recall_memory`). Fail-open: a storage hiccup returns `[]`, never throws the tool.
- [ ] `recall_memory` — extract `ChatToolsService.recallMemory()` into a shared helper (e.g.
  `memory/recall.helper.ts` taking `VaultService`), call it from BOTH `ChatMcpController` and the new
  controller — do NOT duplicate the vault-search logic.
- [ ] Seed one `McpServer` row (`id: "zibby-entities"`, `type: "http"`,
  `url: http://localhost:<api-port>/api/memory/mcp`, `enabled: true`) — ⚠ add `onModuleInit()` +
  `private seedSystem()` to `McpServersStorageService` mirroring `AutomationsStorageService:70,81`
  (idempotent: only create when absent). Resolve the port the same way the app binds it.
- No change to `claude-run-command.service.ts` — an enabled row flows through unmodified (verified).
- **Self-knowledge SUBSYSTEMS block** (folded here, decisions 2/3):
  - [ ] `self-knowledge.composer.ts`: add `"SUBSYSTEMS"` to `BLOCK_KEYS` (`:27`); add
    `renderSubsystems(subsystems: Subsystem[])` mirroring `renderPipelines` (name + mandate, no live
    state); add the key to the `blocks` record (`:241-248`); fold `subsystems: input.subsystems.length`
    into `sections` (`:229-239`).
  - [ ] `self-knowledge.service.ts`: `gather()` adds `subsystems: SUBSYSTEMS` (static import from
    `@zibby/contracts`, no new DI).
  - [ ] `self-knowledge.composer.test.ts`: subsystems fixture; confirm `computeDrift` picks up the new
    key without touching its loop (verify, don't assume).

## Phase 107 — API: raw-note nightly triage sweep + quick-capture entry point

- [ ] `VaultService`: extend `typedFieldsOf()` (`:99-108`) to promote `raw` (boolean) to a typed
  top-level `Note` field; add `rawNotes(): Promise<Note[]>` filtering `scan()` by `raw === true`
  (reuse the 5s cache — no new I/O).
- [ ] `MemoryDistillerService.gather()`: also collect `rawNotes()` as triage candidates — add a
  raw-note `Candidate` variant (model like the `chatId` case: `cwd:""`, carry a `noteId`), respecting
  the same defer-never-drop overflow cap posture.
- [ ] Triage per raw note (a distiller sibling / extended prompt): (a) condensed durable summary
  (strip filler from a transcript dump, keep decisions/facts), (b) `type`/`tags` (reuse
  `NoteTypeSchema`), (c) related-note links via `search()`/`index()` + reuse the service's
  `fileDigest`/`updateIndex` MOC machinery, (d) verdict — durable → clear `raw`, optionally relocate
  tier; noise/duplicate → clear `raw` but tag `triaged-noise`, log one daily line. **NEVER silently
  delete.**
- [ ] Idempotency via the note's own frontmatter `triagedAt` timestamp (checked before
  re-considering) — NOT the `memory-distilled.json` marker (a note has no run `cwd`).
- [ ] Quick-capture: `POST /memory/notes` — when `tier` omitted, default `knowledge` + force
  `raw:true` server-side. Explicit `tier`+`raw` still behave exactly as today.
- [ ] Tests: `memory-distiller.service.test.ts` raw-note fixtures (durable → filed + unflagged;
  noise → unflagged + `triaged-noise` + daily line, not deleted); `vault.service.test.ts`
  `rawNotes()` + `raw` promotion; controller/contract test for optional-`tier` create.

## Phase 108 — API: retire `fileLearned`, classifier proposes `toolGrants`, dispatch consumes confirmed grants

- [ ] `RunRecorderService`: delete `fileLearned()` (`:145-183`) and its call site (`:115`); keep the
  daily-log outcome line (`:122-124`) but drop the now-dead `[[learnedId]]` backlink from its suffix.
  Remove/rewrite the three tests (`run-recorder.service.test.ts:145,178,192`). Confirm nothing else
  consumes a Dokumentátor `learned.md` (grep). `docs/api/memory.md:157-159` already asserts removal —
  it now becomes true; leave/tidy it.
- [ ] `claude-cli-router.ts`: add a `toolGrants` field to the router verdict + one prompt line; when
  the resolved target has non-empty `optionalTools`, ask the router which look relevant to the task
  (or a lightweight follow-up heuristic). `TaskClassifierService`/`enrich`: resolve the target
  agent's `optionalTools` (`AgentsStorageService.get`) and populate `TaskRouting.toolGrants` with a
  subset of it. Empty `optionalTools` → always `[]`, no extra round-trip.
- [ ] Dispatch (`TaskSchedulerService.dispatch()` `:838` → runner `.start()` →
  `claude-run-command.service.ts`): thread `CreateTaskInput.toolGrants` through the runners; the FINAL
  grant set = `toolGrants ∩ target.optionalTools` (ceiling enforced SERVER-SIDE, not just UI). Union
  the result into `buildCatalog`'s `allowedTools` alongside the agent's static `tools`.
- [ ] Tests: classifier proposes only from the target's `optionalTools` (never invents ids); dispatch
  intersects operator input against the ceiling (an ungranted request is silently dropped, not an
  error).

## Phase 109 — Web: quick-capture, raw-note affordance, dispatch tool-grant checkboxes

- [ ] `features/memory`: add a lighter quick-capture entry (text + optional title, no tier/type
  picker) alongside the existing full `NoteEditorDialog` create flow on `Screen.tsx` — do NOT replace
  it. Wire through `useCreateNoteMutation` with a call site that omits `tier` (relies on phase-105
  optional `tier` + phase-107 server default).
- [ ] `NoteView.tsx` / `MemoryGraph.tsx`: a small "netříděno" badge/affordance for `raw:true` notes.
- [ ] New-Task composer (⚠ `features/tasks`, NOT `features/commandline`): render
  `TaskRouting.toolGrants` as pre-checked, editable checkboxes in `NewTaskDialog.tsx` (near
  `TaskOutputField` `:175-184`, alongside `PlanPreview`); wire the final state into the create body in
  `useTaskSubmit.ts:108-119`. Hidden entirely when `toolGrants` is empty.
- [ ] Component tests: quick-capture path (mirror `NoteEditorDialog.test.tsx`); raw badge rendering
  (`NoteView.test.tsx`); checkbox render/toggle/submit-wiring test.

## Tests (cross-cutting)

- `libs/contracts`: schema round-trip tests for every new field (105).
- `apps/api`: e2e for `/api/memory/mcp` (106); distiller raw-note fixtures + `rawNotes()` (107);
  classifier `toolGrants` + dispatch intersection (108); self-knowledge subsystems + drift (106).
- `apps/web`: component tests per touched screen (109).

## Verification (paste real output, per phase)

- `npx tsc -p tsconfig.base.json --noEmit` (contracts/api) and `npx tsc -p apps/web/tsconfig.json
  --noEmit` (web) — clean. ⚠ `apps/api/src/machine/machine.service.ts` has a PRE-EXISTING unrelated
  tsc error; the api typecheck may surface it — confirm any error is that known one, not new.
- `pnpm check:lint` (eslint --fix) — clean.
- `pnpm test` (vitest) for the touched dirs — green.
- `pnpm self-knowledge:generate` after 106 lands, to confirm the new `SUBSYSTEMS` block composes
  without drift surprises. Commit the regenerated note alongside the phase.

## Global constraints (every phase)

- Contract-first: `libs/contracts` changes land before api/web consume them.
- React 19 (no `forwardRef`), no `any`, no raw inline DOM `style` in `apps/web`.
- Every new write path stays fail-open where its sibling is fail-open (grounding, nightly distiller,
  `RunRecorderService`) — a raw-note triage failure or an entity-directory MCP hiccup must never
  block a run or the nightly tick.
- Never silently drop a raw note as "processed" without a durable trace (tag + daily line).
- The ceiling (`optionalTools`) is enforced server-side at dispatch, not just filtered in the UI.
- ⚠ Commit hygiene (self-knowledge drift gate): before each phase commit run
  `pnpm self-knowledge:generate` and `git add` the note. Do NOT run `graphify update .` between
  phases — it re-drifts the note; run it once at the very end. Never `rm -rf .playwright-mcp/`
  (git-tracked).
- Do not touch unrelated operator WIP; do not run destructive git operations.
