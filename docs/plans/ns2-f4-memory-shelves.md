# F4 — Memory Shelves & Retrieval That Scales — Implementation Plan

> NS2 phase F4, planned against branch `north-star-2` at `9e45a8e8` (F1a landed).
> Contract-first where the API surface changes, tests = DoD, no `any`, vitest
> everywhere, per-package `tsc -p` (never `rtk pnpm typecheck`), i18n cs+en for any
> new UI string. Three independently-committable subphases: **F4a shelves**,
> **F4b retrieval**, **F4c seed + scheduled self-knowledge**.
>
> **Sequencing prerequisite:** F4a resolves `ownerSubsystem` from stored
> Agent/Pipeline entities. F1a (contract, commit `9e45a8e8`) is in; **F1b's backfill
> must land before F4 ships** or every owner lookup returns `undefined` and shelves
> stay empty. The code below is written to degrade gracefully (no owner → no shelf,
> never an error), so F4 can be *implemented* in parallel but must be *verified*
> after F1b.

## Factual corrections (roadmap premises the code disproves)

1. **`vault/subsystems/<id>/MOC.md` is impossible in this vault.** Note ids are
   file **basenames, unique across the whole vault** (`NOTE_ID` regex forbids path
   separators, `libs/contracts/src/memory/memory.schema.ts:96-98`; duplicate check is
   vault-wide, `apps/api/src/memory/vault.service.ts:333-357`), and `createNote`
   writes **only into the three tier dirs** (`resolveNoteFile`,
   `vault.service.ts:313-317`; tiers `memory`/`daily`/`knowledge`, `:59,303-305`).
   Ten files all named `MOC.md` would collide on id `MOC`. **Corrected layout:**
   one knowledge-tier note per subsystem, `knowledge/subsystem-<id>-moc.md`
   (id `subsystem-<id>-moc`). This id ends in `-moc`, so `VaultService.index()`
   already treats it as a retrieval entry point (`/(^|[-_ ])(index|moc)$/i`,
   `vault.service.ts:186`) — zero index-side changes needed.
2. **"No seeded vault on fresh install" is only half true.** This repo *commits*
   the vault: only `daily/` is gitignored (`.gitignore`: `.zibby/data/vault/daily`),
   and `north-star.md`, `knowledge/zibby-index.md`, `knowledge/self-knowledge.md`
   exist on disk. The gap is real only for a non-default `VAULT_DIR` /
   `ZIBBY_DATA_DIR` (packaged install; `/apps/api/data/` is fully gitignored).
   Also the doc comment at `apps/api/src/memory/memory.module.ts:24-27` claims the
   default vault dir is `apps/api/data/vault` — stale; the actual default is
   `<repo>/.zibby/data/vault` via `dataDir` (`apps/api/src/shared/data-dir.ts:32`).
   **Consequence:** the seeder must be programmatic *and only fire on an empty
   vault* — an unconditional boot seed would break
   `apps/api/test/memory.e2e.test.ts:49` (exact node-set assertion
   `["MEMORY","rohlik","zibby"]`) and every temp-vault unit fixture.
3. **The recorder does not "file learnings".** `RunRecorderService` writes exactly
   one episodic daily line per terminal run (`run-recorder.service.ts:95-121`);
   distilled learnings are `MemoryDistillerService.fileDigest`'s
   (`memory-distiller.service.ts:307-359`). F4a's recorder change is therefore only
   the subsystem wikilink on the daily line; shelf *filing* is the distiller's.
4. **Goal runs, chat and raw notes have no owner path.** `GoalRun`/chat/note
   candidates in `gather()` (`memory-distiller.service.ts:181-220`) reference no
   owned entity (goals were not given `ownerSubsystem` in F1). They file with no
   shelf. Scout's shelf fills via the research **pipelines/chains** F1b seeds to
   scout — the roadmap's "a run owned by scout" test must use a pipeline fixture.
5. **Self-knowledge is not "manual-CLI-only".** Besides the CLI
   (`generate-cli.ts`), `GET /api/self-knowledge` composes + drift-checks live
   (`self-knowledge.controller.ts:14`), and the note is already grounded into every
   run as the always-second section (`grounding.service.ts:15,102`). What is
   genuinely missing is a **scheduled write** — hence the new automation target,
   not a new generator.
6. **"Shelf first" cannot literally be first.** The compose order is structurally
   north-star → self-knowledge → … (`grounding.service.ts:101-107`). The shelf slots
   **third** — first among *retrieved* notes, ahead of term-matched MOCs and the
   project note. This honors the roadmap's intent without demoting the mission note.
7. **`graph()` premise confirmed** — wikilink parsing exists
   (`vault.service.ts:212-228`, `extractLinks` `:511-518`), including alias/anchor
   stripping (`[[id|alias]]` → `id`), which F4a exploits for readable daily-line
   links.

## Design decisions (binding for the implementer)

- **Shelf id scheme:** `subsystem-<id>-moc` in tier `knowledge`, e.g.
  `subsystem-forge-moc`. Helper in one place (`subsystem-shelf.ts`, below).
- **Shelf ownership marker:** frontmatter `subsystem: <id>` on each shelf;
  `subsystem: codex` on `zibby-index` (Codex owns the global index — as data).
- **Existing vaults need no migration:** `VaultService.updateIndex` auto-creates a
  missing MOC in `knowledge/` under a per-MOC path lock
  (`vault.service.ts:434-470`), so the first distiller filing lazily creates any
  missing shelf. The committed shelf files + empty-vault seeder are conveniences,
  not prerequisites.
- **No vectors, no embeddings, anywhere.** F4b is frontmatter tags/aliases scoring
  + 1-hop wikilink expansion over the existing scan cache. This is law
  (ROADMAP-2 non-negotiables; `vault.service.ts:164-167` doc).
- **Seeder fires only when the vault contains zero notes** (fresh-install
  semantics). Non-empty vault → strict no-op.

---

## F4a — Subsystem MOC shelves (record · distill · ground by owner)

**No API-surface change** — all writes go through existing vault primitives and
frontmatter (`Record<string, unknown>`); contract-first is satisfied vacuously.
The contract additions land in F4b where the read surface changes.

### Verified current state

- `GroundingInput { task, projectId?, matchedTerms? }` —
  `apps/api/src/memory/grounding.service.ts:25-29`; compose order + fail-open `add()`
  `:84-116`; missing note silently skipped `:96-98`.
- Agent call site: `agent-runner.service.ts:327-331` — `agent` (with F1a's optional
  `ownerSubsystem`, `libs/contracts/src/agents/agent.schema.ts:93`) is in scope.
- Pipeline call site: inside `buildStageCommand`
  (`pipeline-runner.service.ts:1744-1762` signature; compose at `:1795-1799`); the
  method receives `phase/cwd/project/...` but **not** the pipeline. Its one caller
  `runStage` (`:1519-1540`) has `run: PipelineRun` (→ `run.pipelineId`) and the
  service already injects `PipelinesStorageService` (`:133`). `Pipeline` carries
  `ownerSubsystem` (`pipeline.schema.ts:139`).
- Recorder: `run-recorder.service.ts:95-121` (`recordAgent`/`recordPipeline` daily
  lines); its module already imports `AgentsModule` + `PipelinesModule`
  (`run-recorder.module.ts:16`), which export their storage services (proven by
  `self-knowledge.module.ts` injecting both).
- Distiller: `Candidate` interface `memory-distiller.service.ts:46-61`; `gather()`
  `:154-226`; `fileDigest` project-MOC linking loop `:346-353` via
  `vault.updateIndex(projectId, filedId, …)`; module imports Agents/Pipelines
  modules (`memory-distiller.module.ts:20`).
- Wikilink alias form resolves to the bare id in the graph
  (`vault.service.ts:511-517`).

### Change list

1. **New pure module** `apps/api/src/memory/subsystem-shelf.ts`:
   - `export const SHELF_ID_PREFIX = "subsystem-";`
   - `export function subsystemShelfId(id: SubsystemId): string` →
     `` `subsystem-${id}-moc` ``.
   - `export function shelfDailyLink(id: SubsystemId): string` →
     `` `[[subsystem-${id}-moc|${id}]]` `` (alias form — readable daily line, real
     graph edge).
   - JSDoc citing correction #1 (why not `subsystems/<id>/MOC.md`).
2. **GroundingService** (`grounding.service.ts`):
   - `GroundingInput` gains `ownerSubsystem?: SubsystemId`.
   - In `compose`, insert after the `SELF_KNOWLEDGE_ID` add (`:102`):
     `if (input.ownerSubsystem) await add(subsystemShelfId(input.ownerSubsystem));`
     — missing shelf is skipped by `add`'s existing catch.
3. **AgentRunnerService** (`agent-runner.service.ts:327-331`): add
   `ownerSubsystem: agent.ownerSubsystem` to the compose input (optional field —
   type-safe with F1a's schema).
4. **PipelineRunnerService**:
   - `buildStageCommand` gains a trailing optional param
     `ownerSubsystem?: SubsystemId`, forwarded into the compose call at `:1795`.
   - `runStage` (`:1519`) resolves it once per stage:
     `const ownerSubsystem = (await this.pipelines.get(run.pipelineId).catch(() => null))?.ownerSubsystem;`
     and passes it at the `:1533` call site.
5. **RunRecorderService**:
   - Inject `AgentsStorageService` + `PipelinesStorageService` (modules already
     imported; add the two constructor params).
   - `recordAgent`: resolve `const owner = (await this.agentsStore.get(run.agentId).catch(() => null))?.ownerSubsystem;`
     append `` ` · ${shelfDailyLink(owner)}` `` to the daily line when present.
   - `recordPipeline`: same via `run.pipelineId` + pipelines store.
6. **MemoryDistillerService**:
   - `Candidate` gains `subsystemId: SubsystemId | null`.
   - Inject `AgentsStorageService` + `PipelinesStorageService`.
   - `gather()`: pipeline candidates resolve owner from `run.pipelineId`; agent
     candidates from `run.agentId` (both `.catch(() => null)`, then
     `?.ownerSubsystem ?? null`); goal/chat/raw-note candidates hardcode `null`
     (correction #4 — comment it).
   - `fileDigest`: after the project-MOC loop (`:346-353`), a parallel loop over
     `[...new Set(candidates.map(c => c.subsystemId).filter(...))]` calling
     `this.vault.updateIndex(subsystemShelfId(s), filedId, `Destilace — ${day}`)`
     with the same `.catch` + `logger.warn` posture. `updateIndex` auto-creates a
     missing shelf (design decision above).

### Test list

- `apps/api/src/memory/grounding.service.test.ts` — new cases: compose with
  `ownerSubsystem: "forge"` includes the shelf section between self-knowledge and
  the term-matched MOCs; shelf note absent → composed block identical to today;
  no `ownerSubsystem` → unchanged (regression).
- `apps/api/src/memory/subsystem-shelf.test.ts` — id/alias-link shapes; id matches
  the entry-point regex `/(^|[-_ ])(index|moc)$/i`.
- `apps/api/src/memory/run-recorder.service.test.ts` — owned agent run → daily line
  contains `[[subsystem-forge-moc|forge]]`; unowned agent (no `ownerSubsystem`) →
  today's exact line; storage lookup failure → line still written (fail-open).
- `apps/api/src/memory/memory-distiller.service.test.ts` — fixture with a terminal
  run of a **scout-owned pipeline**: digest filed AND scout's shelf auto-created in
  `knowledge/` containing a `[[distilled-<day>]]` line (the roadmap's "run owned by
  scout files onto scout's shelf"); mixed batch (scout + forge + unowned goal) →
  exactly two shelves linked; shelf-link failure logged, digest still filed.
- Existing `pipeline-runner`/`agent-runner` suites must stay green (the new param
  is optional; grounding is stubbed in those tests).

Run: `pnpm exec vitest run apps/api/src/memory` then
`pnpm exec vitest run apps/api/src/pipelines/pipeline-runner.service.test.ts apps/api/src/agents/agent-runner.service.test.ts`;
`pnpm exec tsc -p apps/api`.

### Commit

`feat(memory): subsystem MOC shelves — record, distill and ground by owner`

---

## F4b — Retrieval upgrade: tags + wikilink-graph expansion (index-first, no vectors)

### Verified current state

- `selectIndexes` scores **only id + title token overlap**, top `MOC_LIMIT = 2`
  (`grounding.service.ts:22,50-64`); terms fall back to `tokenize(task)` (`:86`,
  tokenizer `apps/api/src/tasks/keyword-scorer.ts:6-8`).
- `IndexEntry` carries `{id,title,tier,project?}` only
  (`libs/contracts/src/memory/memory.schema.ts:43-54`); graph nodes `{id,label,tier,project?}`
  (`:57-73`); `Note` has typed `type/tags/raw` via `typedFieldsOf`
  (`vault.service.ts:100-111`) but no subsystem surface.
- `index()` builds entries at `vault.service.ts:183-192`; `graph()` at `:212-228`;
  the scan cache holds full frontmatter + links (`RawNote`, `:153-161`), so tags /
  aliases / subsystem cost **zero extra I/O**.
- `ownerProjectOf` precedent for frontmatter derivation: `vault.service.ts:119-130`.
- Project isolation filter `visibleToProject` (`grounding.service.ts:37-42`) — the
  expansion must respect it.
- Web note panel: `apps/web/features/memory/components/NoteView.tsx` (feature-local
  `NoteViewTestId` enum `:20-27`; raw badge precedent `:153-157`); graph screen data
  source `useMemoryGraphQuery` → `GET /api/memory/graph`
  (`apps/web/features/memory/Screen.tsx:40`, contract
  `libs/contracts/src/memory/memory.contract.ts:41-46`).

### Change list

1. **Contract** (`libs/contracts/src/memory/memory.schema.ts`) — all additive/optional:
   - Import `SubsystemIdSchema` from `../subsystems/subsystem.schema` (no cycle —
     subsystems imports nothing from memory).
   - `IndexEntrySchema` += `subsystem: SubsystemIdSchema.optional()`,
     `tags: z.array(z.string()).optional()`,
     `aliases: z.array(z.string()).optional()` (doc: retrieval keywords for
     index-first scoring — never embeddings).
   - `MemoryGraphSchema` node += `subsystem: SubsystemIdSchema.optional()`.
   - `NoteSchema` += `subsystem: SubsystemIdSchema.optional()`.
2. **VaultService**:
   - New pure export `ownerSubsystemOf(frontmatter): SubsystemId | undefined` —
     `SubsystemIdSchema.safeParse(frontmatter.subsystem)`, mirroring
     `ownerProjectOf` (`:119-130`).
   - New pure helper `aliasesOf(frontmatter): string[]` (same tolerance as `tagsOf`
     `:88-92`).
   - `index()` entries gain `subsystem` / `tags` / `aliases` (spread-if-present,
     matching the `project` pattern at `:189-190`).
   - `graph()` nodes and `note()`/`rawNotes()` results gain `subsystem` (extend
     `typedFieldsOf` or spread alongside it — keep `typedFieldsOf`'s
     tolerant-of-garbage posture).
3. **GroundingService scoring** (`selectIndexes`, `:50-64`): score =
   `1 ×` (term ∈ tokens of id+title) `+ 2 ×` (term ∈ tokens of tags+aliases) per
   wanted term. Curated frontmatter outweighs incidental title words — this is the
   "scored above raw substring" upgrade. Same `MOC_LIMIT`, same deterministic
   id tie-break; keep it pure + exported.
4. **1-hop wikilink expansion** (`grounding.service.ts`):
   - `add()` returns the loaded `Note | null` instead of `void` (it already fetches
     the full note).
   - New pure export
     `selectLinkedNotes(terms: string[], mocs: Note[], visible: IndexEntry[], alreadySeen: Set<string>): string[]`
     — union of the matched MOCs' `links`, filtered to ids present in `visible`
     (project isolation, correction: shelves are global so they pass) and not in
     `alreadySeen`, scored with the same term scorer over the *linked entry's*
     id/title/tags, top `EXPANSION_LIMIT = 2`, deterministic tie-break.
   - `compose()`: collect the notes returned by the shelf + MOC `add()` calls, run
     `selectLinkedNotes`, `add()` each expansion id **before** the project note.
     Budgets unchanged (`NOTE_BUDGET` 2000 / `BLOCK_BUDGET` 8000 — the existing
     truncation caps worst-case growth).
5. **Web (minimal, verified surface):** `NoteView.tsx` — when `note.subsystem` is
   present render a `Tag` beside the raw badge (`:149-158`):
   `NoteViewTestId.SubsystemBadge = "memory-note-subsystem-badge"`, content
   `note.subsystem` (data, not copy) with an i18n `aria-label`/tooltip string
   `memory.subsystemBadge` — **cs:** `"Polička subsystému"`, **en:**
   `"Subsystem shelf"` in `apps/web/i18n/messages/{cs,en}.json` (parity test
   `apps/web/i18n/messages/parity.test.ts` enforces both). Graph/search UI changes:
   none (fields flow through types only).

### Test list

- `libs/contracts/src/memory/memory.contract.test.ts` — new optional fields parse;
  a legacy payload without them still parses; `subsystem: "not-a-subsystem"` fails.
- `apps/api/src/memory/vault.service.test.ts` — `ownerSubsystemOf` (valid / invalid
  / absent); `index()` carries tags+aliases+subsystem from a fixture note;
  `graph()` node carries subsystem.
- `apps/api/src/memory/grounding.service.test.ts` —
  - **tag beats title fixture:** MOC A (title with zero term overlap, tags matching
    two task terms) outranks MOC B (title matching one term) — the roadmap's
    "beats substring" assertion;
  - **1-hop fixture:** selected MOC links `[[deploy-runbook]]`; terms match that
    note's title → composed block contains the runbook section; a linked note owned
    by *another project* is excluded (`visibleToProject` holds through expansion);
    `EXPANSION_LIMIT` respected;
  - determinism: two runs on the same fixture → identical block.
- `apps/web/features/memory/components/NoteView.test.tsx` — badge renders for a
  `subsystem: "forge"` note, absent otherwise (testid enum).

Run: `pnpm exec vitest run libs/contracts/src/memory apps/api/src/memory apps/web/features/memory`;
`pnpm exec tsc -p libs/contracts && pnpm exec tsc -p apps/api && pnpm exec tsc -p apps/web`.

### Commit

`feat(memory): tag + wikilink-graph retrieval; subsystem surfaced through the memory contract`

---

## F4c — Vault seed + scheduled self-knowledge

### Verified current state

- Committed vault: `.zibby/data/vault/` with `north-star.md`, `north-star-2.md`,
  `knowledge/zibby-index.md` (root MOC), `knowledge/self-knowledge.md`,
  `projects/*`; only `daily/` gitignored. Subsystem charters (name, tagline,
  mandate) live in the contract registry
  (`libs/contracts/src/subsystems/subsystem.schema.ts:9-21,52+` — already 10 ids) and
  in prose in `.zibby/data/vault/north-star-2.md` ("The Chairs").
- Seeder precedent: `AutomationsStorageService.seedSystem` (`onModuleInit`,
  `automations.storage.service.ts:107-133`) — create-if-missing, heal server-owned
  fields, never touch operator fields.
- Automation target union: `TargetSchema` discriminated union
  (`libs/contracts/src/automations/automation.schema.ts:43-96`);
  `SYSTEM_AUTOMATIONS` (`automations.storage.service.ts:54-95`); dispatch switch
  (`scheduler.service.ts:128-211`); system automations are delete-locked,
  reschedule/toggle-only (`:144-163`).
- `SelfKnowledgeService.write()` merges AUTO blocks so operator prose survives
  (`self-knowledge.service.ts:128-141`); `check()` = drift (`:144-147`);
  `SelfKnowledgeModule` exports the service and imports only
  Agents/Pipelines/GateRules/Gates/Memory (`self-knowledge.module.ts`) — importable
  from `AutomationsModule` and `BriefingModule` with **no cycle** (neither is in its
  import graph).
- Web exhaustive tables that WILL break the compile (good — forced updates):
  `TARGET_GLYPH` (`AutomationCard.tsx:33-41`,
  `satisfies Record<Exclude<Target["type"],"task">, IconName>`) and `targetKindKey`
  (`:249+`, exhaustive switch with typed key union); `targetText` branch chain
  (`:108-115`); `Screen.tsx` `resolveTarget` (`:41-58`, has a `spark` fallback —
  optional branch).
- Briefing: `BriefingInput` (`briefing-assembly.ts:17-48`), `assembleBriefing`
  optional-field spread (`:93-111`), `renderBriefingMarkdown` (`:317-368`), service
  gather (`briefing.service.ts:58-110`). F3b will restructure briefing sections —
  F4c stays **strictly additive** (one optional boolean) to avoid conflicts.
- e2e sensitivity: `memory.e2e.test.ts:49` exact node set (correction #2) →
  seed-only-when-empty; `automations.e2e.test.ts` has no count assertions (safe).

### Change list

1. **Committed shelf files** (this repo's vault, 11 files touched):
   - Ten new `.zibby/data/vault/knowledge/subsystem-<id>-moc.md` (forge, puls,
     sentinel, maestro, beacon, scout, herald, loom, codex, ledger). Frontmatter:
     `title: "<Name> — polička"`, `subsystem: <id>`, `type: fact`,
     `tags: [subsystem, <id>, moc]`. Body: the chair's charter paragraph distilled
     from `north-star-2.md` "The Chairs" + the registry mandate, an empty
     `## Poznatky` section (where `updateIndex` appends), and footer links
     `[[zibby-index]] · [[north-star-2]]`.
   - Edit `knowledge/zibby-index.md`: add `subsystem: codex` frontmatter (Codex
     owns the global index) and a `## Subsystémy` section listing all ten
     `- [[subsystem-<id>-moc]] — <mandate one-liner>`.
2. **Empty-vault seeder** (`apps/api/src/memory/`):
   - `vault-seed.content.ts` — pure: `composeSeedNotes(subsystems: readonly Subsystem[]): CreateNoteInput[]`
     returning north-star starter (short mission stub, `id: "north-star"`), the root
     MOC (`zibby-index`, `subsystem: codex`), and one shelf per registry entry
     (content generated from `SUBSYSTEMS` name/tagline/mandate — single source of
     truth, no duplicated prose).
   - `vault-seed.service.ts` — `OnModuleInit`, injects `VaultService`: if
     `(await vault.index()).length === 0` **and** the underlying scan finds zero
     notes (use a `graph()`/scan-backed emptiness check, not just entry points),
     `createNote` each seed (per-note try/catch + `logger.warn`, never fatal to
     boot). Non-empty vault → log-debug no-op. Register in `MemoryModule`
     providers (`memory.module.ts:51-76`) **only** (VAULT_DIR is re-provided
     elsewhere — do not register the seeder twice).
   - Fix the stale doc comment at `memory.module.ts:24-27` while there
     (correction #2).
3. **Contract — automation target** (`automation.schema.ts:43-96`): add
   `z.object({ type: z.literal("self-knowledge") })` with a doc comment (nightly
   deterministic re-compose + AUTO-block merge write of the self-knowledge note;
   not a claude run). Zod addition exactly:
   ```ts
   z.object({ type: z.literal("self-knowledge") }),
   ```
4. **System automation** (`automations.storage.service.ts`): export
   `SELF_KNOWLEDGE_AUTOMATION_ID = "self-knowledge-refresh"`; append to
   `SYSTEM_AUTOMATIONS`:
   `{ id, name: "Obnova sebeznalosti", trigger: { type: "cron", expr: "30 3 * * *" }, target: { type: "self-knowledge" }, enabled: true, system: true }`
   (3:30 — after the 3:00 distill, before the 7:00 briefing).
5. **Scheduler** (`scheduler.service.ts`): inject `SelfKnowledgeService`;
   `AutomationsModule` imports `SelfKnowledgeModule` (no cycle — verified above).
   New dispatch case:
   ```ts
   case "self-knowledge": {
     try {
       const drift = await this.selfKnowledge.check();
       await this.selfKnowledge.write();
       return `self-knowledge:${drift ? "refreshed" : "clean"}`;
     } catch (error) { this.log.warn(...); return "self-knowledge:error"; }
   }
   ```
   (fail-open like `memory-distill` — a vault hiccup must not kill the tick).
6. **Web automations surface** (compile-forced):
   - `AutomationCard.tsx` — `TARGET_GLYPH` += `"self-knowledge": <icon>` (pick from
     `libs/design-system/src/assets/icons/index.ts`; prefer `"eye"`/`"scan"` if
     present, else reuse `"brain"`); `targetKindKey` += case →
     `"targetSelfKnowledge"`; `targetText` chain += branch
     `t("targetSelfKnowledge")`.
   - `Screen.tsx` `resolveTarget` — explicit branch returning the same glyph
     (fallback `spark` would otherwise apply).
   - i18n `automations.targetSelfKnowledge`: **cs** `"Obnova sebeznalosti"`,
     **en** `"Self-knowledge refresh"` (both files; parity test enforces).
7. **Drift in the briefing (additive only — F3b coordination):**
   - `libs/contracts/src/briefing/briefing.schema.ts` — `BriefingSchema` +=
     `selfKnowledgeDrift: z.boolean().optional()`.
   - `briefing-assembly.ts` — `BriefingInput` += `selfKnowledgeDrift?: boolean`;
     `assembleBriefing` spreads it only when `true` (matches the `trend7d` pattern
     `:103`); `renderBriefingMarkdown` appends, when true, a
     `## Memory` line: `- self-knowledge note drifted from the live catalog (nightly refresh may have failed)`.
   - `briefing.service.ts` gather — `BriefingModule` imports `SelfKnowledgeModule`;
     add `this.selfKnowledge.check().catch(() => false)` to the parallel gather
     (`:60-71`). No web briefing change (F3b owns that surface).

### Test list

- `apps/api/src/memory/vault-seed.content.test.ts` — 12 seed notes; every shelf id
  matches the entry-point regex; shelf frontmatter `subsystem` valid; codex owns
  `zibby-index`; mandate text from the registry appears.
- `apps/api/src/memory/vault-seed.service.test.ts` — empty temp vault → seeded, and
  `GroundingService.compose({task:"anything"})` returns a **non-empty** block (the
  roadmap's "fresh-install grounds non-empty", as a service-level test); non-empty
  vault (one fixture note) → file count unchanged, fixture byte-identical; a failing
  note write logs + continues.
- `libs/contracts/src/automations/automations.contract.test.ts` — `self-knowledge`
  target parses; automation with it round-trips; unknown target still rejected.
- `apps/api/src/automations/automations.storage.service.test.ts` — boot seeds
  `self-knowledge-refresh`; operator-edited trigger survives re-seed; delete → 409.
- `apps/api/src/automations/scheduler.service.test.ts` — dispatch calls
  `check` + `write`, returns `self-knowledge:refreshed|clean`; a throwing
  service → `self-knowledge:error`, tick survives.
- `libs/contracts/src/briefing/briefing.contract.test.ts` +
  `apps/api/src/briefing/briefing-assembly.test.ts` — optional boolean; markdown
  line present iff true; absent field = today's exact output (snapshot regression).
- `apps/web/features/automations/components/AutomationCard.test.tsx` — a
  `self-knowledge` automation renders label + glyph.
- Phase gate: `pnpm exec vitest run apps/api/test/memory.e2e.test.ts apps/api/test/automations.e2e.test.ts apps/api/test/self-knowledge.e2e.test.ts apps/api/test/briefing.e2e.test.ts`
  (memory.e2e must be untouched — proves seed-only-when-empty).

Run (scoped): `pnpm exec vitest run apps/api/src/memory apps/api/src/automations apps/api/src/briefing libs/contracts/src/automations libs/contracts/src/briefing apps/web/features/automations`;
`tsc -p` all three packages.

### Commit

`feat(memory): seed the vault, schedule self-knowledge refresh, surface drift in the briefing`

---

## Sequencing & global gotchas

- **Order F4a → F4b → F4c** (F4b's expansion reads shelves F4a writes; F4c's seeds
  use F4a's id scheme). Each subphase: scoped tests green → checkpoint commit;
  repo-wide `pnpm test` + `pnpm check:deps` at phase end only (PROGRESS validation
  policy). Known baseline flakes: `runner-core.test.ts` ENOENT under parallel load;
  2 pre-existing `pipelines.e2e` failures — do not chase.
- **Do not** register `VaultSeedService` anywhere but `MemoryModule` —
  `ProjectsModule` and `MemoryModule` both provide `VAULT_DIR`, but only one module
  may seed.
- **Owner lookups are always `.catch(() => null)`** — a missing/renamed
  agent/pipeline must never fail a record/distill/ground path (the whole memory
  loop is fail-open by charter).
- The two web exhaustive tables (`TARGET_GLYPH`, `targetKindKey`) are the F4c
  compile tripwire — verify with `grep -rn "self-knowledge" apps/web/features/automations`.
- After F1b lands, re-run the F4a distiller/recorder tests against the seeded
  ownership map (delivery→forge, research→scout) to confirm end-to-end.

---

## Orchestrator review addendum (Fable, 2026-07-17) — BINDING

Plan APPROVED with the following rulings:

1. **All seven factual corrections are accepted** — notably #1 (flat
   `knowledge/subsystem-<id>-moc.md`, NOT `vault/subsystems/<id>/MOC.md`) and #2
   (seed only when the vault has zero notes; `memory.e2e.test.ts:49` must pass
   untouched). ROADMAP-2 §F4 is to be read through these corrections.
2. **Hard ordering:** F4 implementation may only start after F1b + F1c are
   committed and their suites are green (owner backfill is what fills the shelves).
   After F1b, run the F4a distiller/recorder tests against the seeded ownership map
   as the plan's last gotcha requires.
3. **F4c briefing changes stay strictly additive** exactly as planned — F3b owns
   the briefing restructure. If F3b has already landed by the time F4c is
   implemented, rebase the drift line onto F3b's section layout instead of adding a
   duplicate `## Memory` section.
4. Commit messages end with the standard Co-Authored-By + Claude-Session footers.
5. Icon for the `self-knowledge` automation target: implementer picks from the
   existing DS icon set (no new SVG asset in this phase); `"brain"` fallback is
   pre-approved.
