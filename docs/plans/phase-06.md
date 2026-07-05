# Plán: Trillion vzory — self-knowledge, orchestrace, paměť, agent factory

> Motivace: dotáhnout chování existujícího registru/routeru/pipeline enginu/gate
> systému/vaultu blíž k Trillion vzorům (least-privilege conductor, always-loaded
> core knowledge, typovaná deduplikovaná paměť, self-knowledge, agent factory) —
> tam, kde konkrétní schopnost chybí. Nic z jádra se nestaví od nuly; kde stávající
> tvar služby neodpovídá, refaktoruje se.

---

## Zjištění (Fáze 0 nález, ověřeno v kódu)

### 1. Tool scope agentů — VYNUCENÝ pro primárního agenta, deskriptivní pro subagenty

- `tools` pole existuje ve schématu (`libs/contracts/src/agents/agent.schema.ts:44`,
  `z.array(z.string()).optional()`) a agent .md soubory ho deklarují
  (`apps/api/data-test/agents/koder.md` — `tools: ["Read", "Write", ...]`;
  `coder.md` používá interní zkratky `[read, write, bash, git]`).
- Tok vynucení: frontmatter → `Agent.tools` → `ClaudeRunCommandService.buildClaudeCommand()`
  (`apps/api/src/runner/claude-run-command.service.ts:348`, argv
  `--permission-mode dontAsk --allowedTools ...` na řádcích 379–382) →
  `spawn()` v `apps/api/src/runner/runner-core.ts:399,489`. Mapování zkratek:
  `apps/api/src/runner/claude-tools.ts` (`mapTools`, `TOOL_MAP`).
- **Kavea (dokumentovaná v kódu, `claude-tools.ts:49-58`):** `--allowedTools` je
  session-wide **sjednocení** nástrojů primárního agenta a všech subagentů
  v `--agents` katalogu (`buildCatalog()`, řádky 438–487). Individuální `tools`
  subagenta v katalogu je jen deskriptivní — reálnou hranicí je unie. To je
  strukturální omezení `dontAsk` + `--allowedTools`, ne opomenutí.
- **Verdikt pro Fázi 2:** invocation wrapper se NEpřepisuje (enforcement existuje
  a je testovaný — `claude-run-command.service.test.ts:197-230`). Per-subagent
  izolaci CLI neumí; mitigace jde přes gate vrstvu (viz Zjištění 3) a zůstává
  zčásti TODO pro operátora.

### 2. Agents/pipelines storage — žádná cache, čistý read-through → hot-reload už funguje

- `AgentsStorageService` i `PipelinesStorageService` dědí z
  `MarkdownEntityStore` → `EntityFileStore`
  (`apps/api/src/shared/file-storage/entity-file-store.ts`): `get()` (ř. 108–120)
  a `list()` (ř. 122–136) čtou disk při **každém** volání, `onModuleInit` jen
  `ensureDir()`. Žádný `fs.watch`, žádná Map, žádné TTL.
- Všichni konzumenti (`agents.controller.ts:27,34`, `task-classifier.service.ts:184-185`,
  `pipeline-runner.service.ts` — opakované `agents.get()`/`pipelines.get()` i uvnitř
  běhu) volají storage přímo → externě přidaný .md soubor funguje bez restartu už dnes.
- **Verdikt pro Fázi 2:** žádný refaktor. Přidá se pouze regresní test, který
  hot-reload chování zafixuje (nový soubor na disku → viditelný bez restartu),
  protože na něm Fáze 4 (aktivace schváleného agenta) stojí.

### 3. Orchestrátor ⇄ gate — delegace gate vrstvu z velké části OBCHÁZÍ

- Delegace neprobíhá přes NestJS — děje se **uvnitř jednoho spawnutého `claude -p`
  procesu** přes `--agents` katalog + `Task` tool. Backend jednotlivé handoffy
  nevidí (`agent-runner.service.ts:188-208` `startOrchestrator`;
  `claude-run-command.service.ts:438-486` `buildCatalog`, max 16 agentů).
- Jediné realtime vynucení je `PreToolUse` hook **jen na `Bash`**
  (`claude-run-command.service.ts:195-201`; `claude-approval-hook.mjs:252-260`
  `classify()` zná jen `delete`, `git.push`, `git.force_push`, `pr.open`, `pr.merge`).
- **Tři díry:**
  - **(a)** Per-agent hardening (`gates`/`requires_approval` subagenta) se při
    delegaci zahodí: `AgentRunnerService.evaluateIntent`
    (`agent-runner.service.ts:391-449`) resolvuje pravidla podle top-level
    `rec.agentId` (= `ORCHESTRATOR_ID`), nikdy podle skutečně jednajícího subagenta.
  - **(b)** Tool-scope unie (Zjištění 1) — úzce scopovaný subagent běží pod širší
    session unií.
  - **(c)** Hook zachytává jen Bash — `Write`/`Edit`/`WebFetch`/MCP toolům se gate
    nevyhodnocuje vůbec; floor pravidla `purchase`/`payment`/`send_email`
    (`policy.storage.service.ts:78-93`) nemají pro živý běh žádný emitor.
- **Verdikt pro Fázi 2:** přepsat delegační cestu tak, aby (i) samotný handoff
  (volání `Task` toolu) emitoval intent `agent.delegate` přes stejný
  intent-request protokol a šel přes gate-evaluator, a (ii) `evaluateIntent`
  orchestrátorského běhu vyhodnocoval **nejpřísnější sjednocení** pravidel
  orchestrátoru + všech katalogových subagentů (konzervativní mitigace (a),
  dokud CLI neumí per-subagent identitu). Bod (c) nad rámec delegace = TODO
  operátor (rozšíření classify() na Write/Edit/WebFetch/MCP je samostatné téma).

### 4. Core-knowledge injektáž — UŽ EXISTUJE, jen se rozšíří

- `GroundingService.compose` (`apps/api/src/memory/grounding.service.ts:76-107`)
  se volá **per stage** z `pipeline-runner.service.ts:1766` (`buildStageCommand`)
  i z `agent-runner.service.ts:240` a prependuje do system promptu: North Star
  (`NORTH_STAR_ID`, vždy), ≤2 term-matched MOC, poznámku aktivního projektu.
  Budgety: `NOTE_BUDGET=2000`, `BLOCK_BUDGET=8000`. Fail-open.
- **Verdikt pro Fáze 1+3:** žádné nové místo skládání promptu — Self-Knowledge
  se přidá jako druhá vždy-nahraná poznámka do `GroundingService.compose`.

### 5. Paměť — bez typování, bez dedupe

- `NoteSchema`/`CreateNoteSchema` (`libs/contracts/src/memory/memory.schema.ts`)
  mají `frontmatter: z.record(z.string(), z.unknown())` — žádné typované pole.
  Jediný sémantický klíč je `type: "project"` (`vault.service.ts:57`).
- Dedupe neexistuje: `createNote` (`vault.service.ts:213-223`) hlídá jen **přesnou
  kolizi id** → `DuplicateNoteError`; distiller na ni reaguje slepým
  `appendToNote` (`memory-distiller.service.ts:230-243`), `run-recorder` ji polyká
  (`run-recorder.service.ts:142-156`). LLM prompt distilleru dedupuje jen uvnitř
  jedné dávky, nikdy proti vaultu.
- MOC zápis: `vault.service.ts:updateIndex()` (ř. 262–298) je idempotentní
  (nahrazuje existující wikilink řádek) a lockovaný — dedupe se do něj napojí čistě.
- **Verdikt pro Fázi 3:** rozšíření kontraktu (`type`, `tags`) + heuristický
  `findSimilar` ve VaultService + `SimilarNoteError` a merge-místo-duplicity
  v distilleru/recorderu. Rozšíření, ne nová služba.

### 6. Resume po pádu — crash-durable jen pro zaparkované stavy

- Persistence: per-stage sidecar `<runId>.json` atomicky při **přechodech stavů**
  (`runner-core.ts:1102-1106`); pipeline agregát `run.json` na hranicích fází —
  ale **neatomicky** (plain `fs.writeFile`, `pipeline-runner.service.ts:1848-1857`).
  Git checkpoint jen po `done` fázi (`checkpointPhase`, ř. 1390–1420).
- Boot recovery: `RunnerCore.init()` (`runner-core.ts:246-326`) umí přeživší
  orphan process (živý pgid → reattach monitor), ale
  `PipelineRunnerService.reconstruct()` (ř. 1859–1900) každý agregát ve stavu
  `running` **bezpodmínečně** označí `failed` — orphan-survival výsledek zahodí.
- `kill -9` uprostřed stage: fáze se ztrácí celá (retry od poslední dokončené),
  zaparkované stavy (`retries`/`paused-limit`/`output`) přežívají korektně.
- **Verdikt pro Fázi 3:** dva chirurgické zásahy — (i) `writeAggregate` atomicky
  (`writeFileAtomic` už existuje v `file-utils.ts`), (ii) `reconstruct()` se před
  označením `failed` zeptá `RunnerCore` na živý orphan aktuální stage. Mid-stage
  checkpointing (sub-krokové commity) = TODO operátor — velký zásah, nejasná cena/užitek.

### 7. Agent Factory — sousední infrastruktura existuje, detekce ne

- `gap-detector.service.ts` (vzor: activity scan, ≥3 výskyty, vault note),
  `pattern-extractor.service.ts`, `idea-generator.service.ts` — všechny vault-note-only,
  dispatchované přes `automations/scheduler.service.ts:140-181`.
- **`ProposedTaskFlowService`** (`apps/api/src/discovery/proposed-task-flow.service.ts`)
  je přesná šablona schvalovacího toku: `ApprovalsService.register(kind, runner)`,
  `park()` → approval, `resume()` na approve, `cancel()` na reject.
- Chybí: telemetrie orchestrator fallbacků (`ActivityKindSchema` je uzavřený enum
  bez takového kind; `task-classifier.service.ts:94-110` fallback jen loguje),
  `status` pole v `AgentSchema`, `ApprovalRunKindSchema` položka pro agent
  proposal, detekční služba, generátor kandidátního .md.
- UI: approvals fronta (`useApprovalsQuery` → `GET /api/approvals?status=pending`,
  `ApprovalCard`) rendruje nový kind **zdarma** (fallback na plain-text `detail`,
  volitelně enrichment JSON přes `parseApprovalDetail`,
  `apps/web/features/approvals/approval.ts:79-94`). Gates segment ukazuje floor
  z POLICY.md automaticky. Žádná nová obrazovka.

---

## Cíl

1. **Self-Knowledge Layer:** ZIBBY má strojově generovanou, driftem hlídanou
   poznámku o sobě (agenti, pipeliny, gate/tier pravidla, zapojené integrace),
   dostupnou přes API a vždy nahranou do fázových promptů.
2. **Orchestrace:** každý orchestrátorský handoff prochází gate vrstvou; per-agent
   hardening se při delegaci neztrácí (nejpřísnější unie); hot-reload a bounded
   execution zafixované testy.
3. **Paměť:** typované poznámky (`decision|preference|fact|pattern` + `tags`),
   heuristický dedupe před zápisem, atomický agregát a orphan-aware boot recovery.
4. **Agent Factory:** opakované orchestrator fallbacky → kandidátní agent .md se
   `status: proposed` → Tier 3 approval (`agent.propose_new` ve floor) → aktivace
   přes existující hot-reload. Vše přes existující approvals/gates UI.

Mimo rozsah: voice-first, per-subagent tool izolace uvnitř CLI (strukturální),
mid-stage checkpointing, rozšíření approval hooku na Write/Edit/WebFetch/MCP.

---

## Fáze 1 — Self-Knowledge Layer ✅ (hotovo)

**Kontrakt (`libs/contracts`):**
- Nový resource `self-knowledge`: `SelfKnowledgeSchema` —
  `{ markdown: string, generatedAt: string (ISO), drift: boolean, sections: { agents: number, pipelines: number, gateRules: number, channels: number } }`.
- `selfKnowledgeContract`: `GET /self-knowledge` → 200 `SelfKnowledgeSchema`.
  Registrace do root kontraktu vedle `health` (referenční vzor nového resource
  dle `libs/contracts/README.md`).

**Composer (`apps/api/src/self-knowledge/self-knowledge.composer.ts`):**
- Čisté funkce bez DI: vstup `{ agents: Agent[], pipelines: Pipeline[], gateRules, policyFloor, channelKinds: string[] }` →
  markdown s block-parser značkami:
  `<!-- AUTO:AGENTS:START -->…<!-- AUTO:AGENTS:END -->`, analogicky `PIPELINES`,
  `GATES`, `CHANNELS`, + `GENERATED:META` (timestamp se do porovnávání driftu
  nezapočítává). Obsah mimo AUTO bloky (ruční poznámky operátora) zůstává netknutý —
  merge funkce `mergeAutoBlocks(existing, generated)`.
- Poznámka žije ve vaultu jako `knowledge/self-knowledge.md` (id `self-knowledge`,
  tier `knowledge`) — vault nemá složku `North-Star/`, id-první struktura tieru
  je závazná (Zjištění 4 + `vault.service.ts:tierDir`); zadání
  „North-Star/Self-Knowledge.md" se mapuje na toto umístění.

**Service + controller (`apps/api/src/self-knowledge/`):**
- `SelfKnowledgeService` (DI: `AgentsStorageService`, `PipelinesStorageService`,
  `GateRulesStorage`/`PolicyStorageService`, seznam channel adaptérů z channels
  modulu, `VaultService`): `compose()`, `write()` (přes `vault.createNote`/`updateNote`
  s merge AUTO bloků), `check()` → drift boolean (porovnání AUTO bloků bez META).
- `SelfKnowledgeController` implementuje kontrakt; `SelfKnowledgeModule` do `AppModule`.

**CLI (`tools/self-knowledge/generate.ts`):**
- Tenký wrapper: `NestFactory.createApplicationContext(AppModule)` → `SelfKnowledgeService`
  → `--check` mód (exit 1 při driftu) nebo generate mód (zapíše).
- Skripty v root `package.json`:
  `"self-knowledge:generate": "ts-node -P apps/api/tsconfig.json tools/self-knowledge/generate.ts"`,
  `"self-knowledge:check": "… --check"`.
- Pre-commit: `.githooks/pre-commit` (spouští check) + `"prepare": "git config core.hooksPath .githooks"`.
- CI: nový step `pnpm self-knowledge:check` v `.github/workflows/ci.yml`.

**Grounding:** `GroundingService.compose` — po North Star vždy `add(SELF_KNOWLEDGE_ID)`
(`self-knowledge`), stejný fail-open a budgety. Tím je splněno „always-loaded
core-knowledge" bez nového místa skládání promptu.

**UI:** žádný nový segment — sekce v existující `settings` stránce (read-only
markdown náhled + drift badge, DS komponenty, TanStack query
`features/self-knowledge/queries/useSelfKnowledgeQuery.ts`). Poznámka je zároveň
vidět v `memory` segmentu jako běžná vault poznámka — to je konzistentní
s „files are source of truth, UI je view".

**Testy:** composer (AUTO bloky, zachování ručního obsahu, drift bez META),
service (introspekce fixtures), controller e2e vzor dle `health`.

---

## Fáze 2 — Orchestrace: gate na handoff, strictest-union, fixační testy ✅ (hotovo)

**2a. Handoff přes gate (přepis delegační cesty):**
- `claude-approval-hook.mjs`: matcher hooku rozšířit z `"Bash"` na `"Bash|Task"`
  (`approvalGroup`, `claude-run-command.service.ts:195-201`; pozor na
  `hookCatchesBash` heuristiku ř. 205+). `classify()` pro `Task` tool →
  `{ action: "agent.delegate", scope: <subagent_type>, context: <prompt zkrácený> }`.
- Intent jde existujícím `intent-request.json` protokolem →
  `RunnerCore.watchIntentRequest` → `evaluateIntent`. Default floor: `agent.delegate`
  = `allow` (Tier 1, jen zalogované) — POLICY.md floor se nerozšiřuje o ask,
  ale operátor může přidat vlastní `ask` pravidlo v `gate-rules.json`
  (matcher `action: agent.delegate`), a to bude fungovat okamžitě. Tím „každý
  handoff prochází stejnou gate vrstvou" — rozhodnutí zůstává na pravidlech,
  žádné tiché řetězení.
- Aktivita: handoff se zaloguje (activity log) → splňuje Tier 1 „logged, not announced".

**2b. Strictest-union pravidel při orchestrátorském běhu:**
- `AgentRunnerService.evaluateIntent` (`agent-runner.service.ts:391-449`): když
  `rec.agentId === ORCHESTRATOR_ID`, sestavit pravidla jako
  `rulesForAgent(orchestrator)` + sjednocení `gates`/`requires_approval` všech
  agentů zařazených do katalogu běhu (katalogové id uložit do run recordu při
  spawnu — rozšířit record o `catalogAgentIds: string[]` v `buildClaudeCommand`
  výstupu / `launch()`). Nejpřísnější rozhodnutí vyhrává (deny > ask > allow) —
  využít existující skládání v `GateEvaluatorService` (`rulesForAgent` +
  `validateHardenOnly` sémantika: unie může jen přitvrdit).
- Tím se per-agent hardening při delegaci nezahazuje (mitigace díry (a)),
  bez závislosti na per-subagent identitě, kterou CLI neposkytuje.

**2c. Fixační testy (žádná změna chování):**
- Hot-reload: test nad `AgentsStorageService` — zápis nového .md přímo na disk
  (mimo API) → `list()` ho vrátí bez restartu.
- Bounded execution přes classifier fallback: test, že běh spuštěný přes
  `task-classifier → ORCHESTRATOR_TARGET` podléhá stejným limitům/gate jako
  explicitně jmenovaný agent (evaluateIntent path, ne pipeline-only).
- Tool-scope: existující testy enforcementu se doplní o test dokumentující
  session-union chování (fixace kavey ze Zjištění 1).

---

## Fáze 3 — Paměť: typování, dedupe, crash-hardening ✅ (hotovo)

**3a. Kontrakt (`libs/contracts/src/memory/memory.schema.ts`):**
- `NoteTypeSchema = z.enum(["decision","preference","fact","pattern"])`.
- `CreateNoteSchema` + `NoteSchema`: `type?: NoteTypeSchema`, `tags?: z.array(z.string())`
  (top-level typovaná pole; `vault.createNote` je složí do frontmatteru vedle
  `title` — vzor `vault.service.ts:218`).

**3b. Dedupe (`vault.service.ts` + volající):**
- `VaultService.findSimilar(input): Promise<Note | undefined>` — skóre:
  přesná shoda title (case-insensitive) 0.4 + Jaccard tag overlap 0.3 + Jaccard
  body tokenů 0.3; práh `SIMILARITY_THRESHOLD = 0.75`; porovnává se jen uvnitř
  stejného tieru. Čistá heuristika, žádné ML.
- Nová `SimilarNoteError(existingId)` (409-styl, vedle `DuplicateNoteError`).
  `createNote` volá `findSimilar` opt-in parametrem `dedupe?: boolean` (default
  false — API chování se nemění), distiller a run-recorder volají s `dedupe: true`
  a na `SimilarNoteError`/`DuplicateNoteError` shodně reagují `appendToNote` na
  **existující** poznámku + `updateIndex` na její id (místo dnešního slepého appendu
  jen u id kolize).
- Distiller: rozšířit výstupní schéma `claude-cli-distiller` o `type` + `tags`
  per learning (Zod-validované, fallback `fact` / `[]`), propsat do `createNote`.

**3c. Crash-hardening (`pipeline-runner.service.ts`):**
- `writeAggregate` → `writeFileAtomic` (import z `shared/file-storage/file-utils.ts`).
- `reconstruct()`: před označením `running` agregátu za `failed` zkusit
  `core.get(run.currentStageRunId)` — pokud je stage record po `core.init()`
  stále `running` (přeživší orphan), agregát ponechat `running` a nechat exit
  monitor doběhnout normálně. Jinak `failed` jako dnes.
- Testy: atomicita (temp+rename), reconstruct s živým/mrtvým orphanem (mock core).

**TODO operátor:** mid-stage checkpointing (sub-krokové git commity uvnitř fáze).

---

## Fáze 4 — Agent Factory / Sub-Agent Spawner

**4a. Telemetrie fallbacků:**
- `ActivityKindSchema` (`libs/contracts/src/activity/activity.schema.ts`): nový
  kind `"orchestrator-fallback"`.
- `TaskSchedulerService.dispatch` (kolem `task-scheduler.service.ts:743-845`):
  když classifier vrátí orchestrator target (ne explicitní override), zapsat
  aktivitu s refs `{ summary: normalizovaný text, terms: matchedTerms }`.

**4b. Detekce + návrh (`apps/api/src/agent-factory/`):**
- `AgentFactoryService.detect()` — vzor `gap-detector.service.ts`: scan aktivity
  30 dní, kind `orchestrator-fallback`, seskupení podle normalizovaného summary/terms,
  ≥3 výskyty bez existujícího agenta pokrývajícího dominantní terms → kandidát.
- Deterministický generátor kandidátního .md (žádné LLM — testovatelné):
  `id` z dominantních terms, `name`, `description` a `instructions` ze
  seskupených task summaries, `tools: [read]` (least-privilege start),
  `category: "Proposed"`, `status: "proposed"`.
- Dispatch: nový case `"agent-factory"` v `automations/scheduler.service.ts`
  (vzor `gap-detect`).

**4c. Status pole + registr:**
- `AgentSchema`: `status: z.enum(["proposed","active"]).optional()` (chybějící =
  `active`, zpětně kompatibilní).
- `AgentsStorageService.listActive()` (nebo filter param) — **classifier katalog
  a `selectCatalogAgents` konzumují jen aktivní**; controller `list()` vrací vše
  (UI může proposed zobrazit, ale žádná nová obrazovka se nestaví).

**4d. Schválení přes existující Tier 3 flow:**
- `ApprovalRunKindSchema` += `"agent-proposal"`.
- POLICY.md floor (`policy.storage.service.ts:78-93` + `apps/api/data-test/POLICY.md`):
  nové floor pravidlo `action: agent.propose_new → ask:human` (hardening-only,
  projde `validateHardenOnly`).
- `AgentProposalFlowService` (vzor `ProposedTaskFlowService`): `propose()` zapíše
  kandidátní .md (`status: proposed`), vyhodnotí `agent.propose_new` přes
  `GateEvaluatorService` a zaparkuje approval s enrichment JSON detailem
  (summary + preview frontmatteru pro `parseApprovalDetail`); `resume()` na
  approve přepne `status: active` (viditelné okamžitě — read-through storage,
  Zjištění 2); `cancel()` na reject kandidátní soubor smaže (approval záznam
  zůstává jako stopa).
- UI: nic nového — approval vyplave v existující approvals frontě (Overview/gates
  okruh), floor pravidlo se ukáže v `SystemFloorPanel` automaticky.

**Testy:** detekce (≥3 similar fallbacků, ignorace pokrytých terms), generátor
(.md tvar, Zod validní), flow (propose → pending approval → approve → active /
reject → smazáno), classifier nevidí proposed agenty.

---

## Pořadí a proces

Fáze 1 → 2 → 3 → 4, každá: implementace (sonnet subagenti) → `pnpm lint &&
pnpm typecheck && pnpm test` zelené → commit s odškrtnutím v tomto souboru.

## Otevřené otázky / TODO pro operátora

- **Per-subagent tool izolace uvnitř jednoho `claude` procesu** — strukturálně
  nejde přes `--allowedTools` (session-wide); vyžaduje upstream podporu CLI.
  Mitigováno strictest-union gate pravidly (Fáze 2b).
- **Rozšíření approval hooku na `Write|Edit|WebFetch|mcp__*`** — floor pravidla
  `purchase`/`payment`/`send_email` dnes nemají živý emitor; samostatná fáze.
- **Mid-stage checkpointing** — dnes je nejmenší resumovatelná jednotka fáze;
  sub-krokové checkpointy jsou velký zásah do runner smyčky.
- **LLM-asistovaný návrh instructions kandidátního agenta** — Fáze 4 generuje
  deterministicky; LLM vylepšení (přes `claude-cli-router` vzor) lze přidat později.
