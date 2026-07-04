# Plán: Řetězec jako plnohodnotný TaskTarget

> Motivace: chci moct spustit řetězec (chain) úplně stejně jako agenta nebo
> pipelinu — přes New Task dialog, s možností target explicitně zvolit. Run
> tlačítko na `/chains/:id` má dialog otevřít s předvyplněným targetem na
> daný řetězec (stejný vzor jako agent/pipeline detail dnes), místo aby chain
> spouštělo přímo bez dialogu. **Tohle ruší dřívější rozhodnutí zapsané v
> [`docs/plans/phase-04.md`](./phase-04.md)** (Zjištění, "Chain se spouští
> úplně jinak než agent/pipeline — bez dialogu... potvrzeno operátorem") —
> operátor to rozhodnutí obrací. Fáze 04 je pořád jen nekomitovaný draft, ne
> hotová implementace, takže žádný kód se nemusí vracet zpátky — jen se
> `phase-04.md` musí opravit (Fáze 8 tohoto plánu), než se na něm začne
> stavět.

---

## Zjištění (současný stav, ověřeno v kódu)

- **`TaskTargetSchema` je diskriminovaná unie 4 variant** —
  `libs/contracts/src/tasks/task.schema.ts:33-79`: `agent | pipeline | goal |
  orchestrator`, každá (kromě `orchestrator`, syntetického) nese
  `id: AgentIdSchema` + sdílený `taskTargetDisplayShape` (`name`, `glyph?`,
  `category?`). `CatalogTaskTarget` (řádek 83) je `Extract<TaskTarget, {kind:
  "agent"|"pipeline"}>` — jen tyhle dvě druhy jsou klasifikátorem
  routovatelné; `goal` je **explicit-only** (nikdy není v katalogu, klasifikátor
  na něj nikdy neukáže — `task-classifier.service.ts:217`,
  `isCoherent()`). Chain jde touhle stejnou cestou — 5. varianta, stejně
  `explicit-only`, stejný `id`-nesoucí tvar.
- **Explicitní target vždy obchází klasifikaci — to je obecný mechanismus,
  ne goal-specifický.** `task-scheduler.service.ts:226-263`
  (`createTask(input, ..., explicitTarget?, ...)`) → `target = explicitTarget
  ?? input.target` → `dispatch(...)` (řádky 743-845):
  ```ts
  if (explicitTarget) {
    target = explicitTarget;
    matchedTerms = [];
  } else {
    const routing = await this.classifier.classify({ text, paths });
    ...
  }
  ```
  `target: { kind: "chain", id }` odeslaný z `NewTaskDialog` (přes
  `initialTarget` → `chosenTarget` → `toApiTarget`) půjde přesně touhle
  cestou — klasifikace se pro něj vůbec nespustí.
- **Proč chain MUSÍ být plnohodnotný 5. `RunKind`, ne jen "spustit a
  zapomenout".** `dispatch()`'s `target.kind === "pipeline"`/`"goal"` větve
  vrací `{ runRef: run.pipelineRunId, target }`/`{ runRef: run.goalRunId,
  target }` — tohle `runRef` se persistuje na `ScheduledTask` a je to přesně
  ten `runId`, kterým `TaskRunsService.kindOf()`/`getTaskRun()`
  (`task-runs.service.ts:93-98,168-176`) dohledává detail dispatchnutého
  úkolu. Kdyby chain vracel `runRef` ukazující na krok 0 (jeho vnitřní
  pipeline run), pak jakmile krok 0 doběhne a krok 1 se spustí pod **novým**
  pipeline runId (`ChainRunnerService.startStep`, `chain-runner.service.ts:
  227-243`), by task detail četl "hotovo" uprostřed běžícího řetězce — `kindOf`
  by navíc pro neznámý `chainRunId` **vyhodil `TaskRunNotFoundError`**, pokud
  chain není mezi rozeznávanými kindy vůbec. Musí se tedy stát skutečnou 5.
  položkou v `RunKindSchema`, ne obejít.
- **`ChainRunnerService.start(chainId)` dnes nemá `taskId`, `onRunStatus` ani
  `listAll()`** (`apps/api/src/chains/chain-runner.service.ts:115-134`) — na
  rozdíl od `agentRunner`/`pipelineRunner`/`goalRunner`, které všechny mají
  všechny tři. Tohle je ten jediný skutečně neschematický kus práce v celém
  plánu (zbytek je mechanické rozšíření existujících switchů — viz níže).
  Dvě věci jsou ale levnější, než vypadají:
  - **`listAll()` je triviální alias.** Chainy se nikdy neevikují z paměti —
    `loadPersisted()` (řádky 78-92, 309-318) načte při bootu úplně všechno
    z disku do `this.runs` a nechá to tam navždy (na rozdíl od
    agent/pipeline runů s `RETENTION_MS` evikcí). `list()` (řádek 136-138)
    už vrací přesně tohle — `listAll()` je jen jeho druhé jméno.
  - **Fold řetězcových kroků do detailu má hotový precedens** — goal
    iterace (Fáze 27/29, `GoalIteration.makerRunRef`/`verifier.runRef`) se
    dnes stejným způsobem foldují do stage timeline inline
    (`RunDetail.tsx:434-440`, `GoalDetailPanel`). `ChainRunStep.runRef`
    (`libs/contracts/src/chains/chain.schema.ts`, řádek u `ChainRunStepSchema`)
    je strukturálně to samé — jeden krok = jeden pipeline `runRef`. Tenhle
    plán ten fold vzor **znovu použije**, ne vymýšlí nový.
- **`ChainRunnerService.persist()` je jediné tranzitní místo** (`chain-runner.
  service.ts:302-307`) — volá se z `start()`, `advance()`, `onPipelineTransition()`
  a `reconcile()`, pokaždé hned po mutaci `run.status`/`steps[]`. Přesně
  jako `PipelineRunnerService.writeAggregate()` (`pipeline-runner.service.ts:
  1729-1738`, `this.events.emit("status", run)` hned po zápisu), je `persist()`
  to jediné místo, kam patří `emit("status", run)` pro nový `onRunStatus`.
- **`ChainRun` schema nemá `taskId`** (`libs/contracts/src/chains/
  chain.schema.ts`, `ChainRunSchema`) — na rozdíl od `AgentRun`/`PipelineRun`/
  `GoalRun`, všechny mají. Bez něj `writeChainOutcome` (nová, viz Fáze 3) nemá
  jak najít úkol, na který se má zapsat výsledek.
- **Dispatch switch** — `task-scheduler.service.ts:789-845` — `if (target.kind
  === "agent")`/`"pipeline"`/`"goal")`, jinak terminální `orchestrator`
  fallback. Nová `if (target.kind === "chain")` větev patří před terminální
  fallback, po `"goal"` větvi.
- **Outcome write-back + drain-queue subscription** —
  `onModuleInit()` (řádky 126-143): tři `onRunStatus` subscribe bloky, jeden
  na runner. `TERMINAL_AGENT`/`TERMINAL_PIPELINE`/`TERMINAL_GOAL` (řádky
  67-71) — potřeba `TERMINAL_CHAIN = new Set<ChainRun["status"]>(["done",
  "failed"])`. `writePipelineOutcome`/`writeGoalOutcome` (řádky 1013-1072) —
  potřeba `writeChainOutcome` analogicky (`summary: \`${run.steps.length}
  steps, ${run.status}\``).
- **`targetIdOf`/`refForTarget`** (řádky 1084-1094) — `targetIdOf` je už
  obecný (`orchestrator` speciál, jinak `target.id`) — chain nepotřebuje
  úpravu. `refForTarget` vrací jen `{agentId?, pipelineId?}` — potřeba
  přidat `chainId?` arm (aktivita už dnes používá `chainId` jako ref klíč
  jinde — `ChainRunnerService.record()`, řádek 325, `refs: { chainRunId,
  chainId, status }` — konzistentní jméno).
- **DI: `TaskSchedulerService`/`TaskRunsService` neznají `ChainRunnerService`,
  `TasksModule` nemá `ChainsModule` v importech.** Constructor
  `TaskSchedulerService` (řádky 104-121) injektuje `agentRunner`,
  `pipelineRunner`, `goalRunner` přímo — přidat `chainRunner:
  ChainRunnerService`. `TaskRunsService` (`task-runs.service.ts:65-73`)
  stejně tak. `ChainsModule` (`apps/api/src/chains/chains.module.ts:29-42`)
  už exportuje `ChainRunnerService` (řádek 40) — stačí ho přidat do
  `TasksModule.imports` (`apps/api/src/tasks/tasks.module.ts:36-48`). Žádné
  cyklické importy — `ChainsModule` importuje jen `PipelinesModule,
  ArtifactsModule, MemoryModule, ProjectsModule`, nic z `tasks/`.
- **Unifikovaný run feed** (`task-runs.service.ts`) je největší dotčená
  plocha na backendu:
  - `collect()` (řádky 183-223) — přidat `this.chainRunner.listAll()` vedle
    `agentRunner.listAll()`/`pipelineRunner.listAll()`/`goalRunner.listAll()`,
    novou `chainRunToView` mapovací funkci a `chainsStore.list()` pro
    jméno-lookup (`NameMaps`, řádky 47-51, potřebuje `chain:
    ReadonlyMap<string,string>`).
  - `kindOf()` (řádky 168-176) — přidat `if (tryGet(() =>
    this.chainRunner.get(runId))) return "chain";`.
  - `getArtifact`/`resume`/`delete`/`stop` (řádky 100-160) — chain run **sám
    nemá** vlastní log/artefakt/resume/stop (to všechno patří kroku — jeho
    vnitřnímu pipeline runu, který je už plně obsloužený jako `kind:
    "pipeline"`). Tyhle čtyři switche mohou chain nechat mimo (padne do
    existujícího `throw`/`return null` finálního větve) — žádná nová
    "chain-run-level" operace se nevymýšlí (viz Cíl, mimo scope).
  - `processorFor()` (řádky 243-249) — dnes `if (kind === "agent" ||
    "pipeline" || "goal")`; přidat `"chain"`. `ProcessorSchema.kind`
    (`libs/contracts/src/tasks/task-run.schema.ts:55-59`) rozšířit o
    `"chain"`.
  - `RunKindSchema` (`task-run.schema.ts:19`) — rozšířit `z.enum(["agent",
    "pipeline", "goal", "scheduled"])` o `"chain"`.
  - `TaskRunSchema` (`task-run.schema.ts:72-137`) — nová optional pole pro
    detail: `chainId?`, `steps?: ChainRunStepSchema[]`
    (analogicky ke goal's `goalId`/`iterations`, řádky 128-131).
- **Frontend `TaskTarget` typ je užší než kontrakt** — `apps/web/features/
  tasks/task.ts:98-100`:
  ```ts
  export type TaskTarget =
    | (TaskTargetDisplay & { kind: "agent" | "pipeline" | "goal"; id: string })
    | (TaskTargetDisplay & { kind: "orchestrator" });
  ```
  Potřeba přidat `"chain"` do prvního union arm. Stejný soubor: `
  TaskTargetKind` (řádek 59, `"agent" | "pipeline" | "goal" |
  "orchestrator"`), `KIND_FALLBACK_GLYPH` (řádky 130-135, exhaustivní
  `Record<TaskTargetKind, IconName>` — `chain: "link"`, stejná ikona jako
  `chains/Screen.tsx`/`NewChainDialog.tsx` používají všude jinde),
  `toClientTarget`/`toApiTarget`/`targetKey` jsou už obecné (větví jen na
  `"orchestrator"` vs. ostatní) — žádná úprava potřeba mimo typ.
- **`NewTaskDialog`'s target picker nepotřebuje žádnou vlastní chain
  logiku.** Picker (`NewTaskDialog.tsx:270-276`, `SelectField` nad
  `targetOptions`, řádky 222-225) čte z `allTargets`
  (`useTaskClassification.ts:109-123`) — což je čistě `initialTarget` +
  klasifikátorovy `candidates`, deduplikováno. Protože chain (jako goal)
  nikdy nebude v `candidates` (klasifikátor ho nesmí nabízet — viz
  `isCoherent`), objeví se v pickeru **jen** když je `initialTarget`
  nastavený — přesně tak, jak to dnes funguje pro goal. **To je vědomý
  předpoklad tohoto plánu** (chain je "Run-button-prefill-only", ne
  všeobecně vybíratelný z prázdného pickeru) — viz Otevřené otázky.
- **`TaskContext.tsx`'s `open()`/`key` výpočet nepotřebuje žádnou úpravu** —
  `open: (initialText?, initialTarget?: TaskTarget, initialContext?) => void`
  (řádek 30) a dialog `key` (řádek 91, `initialTarget?.id ?? ""`) jsou už
  obecné nad `TaskTarget`. Jakmile `task.ts`'s typ zná `"chain"`, projde to
  beze změny.
- **`chains/Screen.tsx`'s Run tlačítko (řádky 184-192) volá `startChain.
  mutate(...)` přímo, žádný dialog.** Nahradit `onClick` za
  `openNewTask(undefined, { kind: "chain", id: selected.id, name:
  selected.name ?? selected.id, glyph: "link" })` — přesný vzor jako
  `AgentDetailScreen.tsx:108-114` (`openNewTask(undefined, { kind: "agent",
  id: agent.id, name, glyph: "bot" })`) a `pipelines/Screen.tsx:196-201`.
  **Není to bezešvá záměna** — `chains/Screen.test.tsx:85-89` dnes tvrdě
  testuje starý přímý mutate:
  ```ts
  it("Run starts the chain via the mutation (top-right primary action)", async () => {
    ...
    expect(hooks.start).toHaveBeenCalledWith({ params: { id: "research-then-build" }, body: {} });
  });
  ```
  musí se přepsat na assert nad `openNewTask` (mock vzor viz
  `agents/DetailScreen.test.tsx:31,48`: `vi.mock("../tasks", () => ({
  useNewTask: () => ({ open: hooks.openNewTask }) ... }))`).
  `useStartChainMutation`/`startChain` v `Screen.tsx` se stanou nepoužívané
  (import + proměnná pryč) — samotná mutace/kontrakt/`POST /api/chains/:id/
  run` endpoint **zůstávají** (žádný jiný current caller je neruší; je to
  rozumná přímá cesta i nadále, mimoto na ní stojí vlastní kontraktové
  testy).
- **`chat-tools.service.ts`'s `describeTarget()` (řádky 103-112) je
  exhaustivní `switch` bez `default`** — TS ho po přidání 5. kindu odmítne
  zkompilovat, dokud nepřibude `case "chain": return \`řetězec
  ${target.name}\`;`. Kompilátor tenhle touch-point sám vynutí.
- **`task-classifier.service.ts`'s `isCoherent()` (řádek 217)** — dnes `if
  (target.kind === "orchestrator" || target.kind === "goal") return false;`
  — přidat `|| target.kind === "chain"` (stejná pozice, stejný komentář-styl:
  "chain je explicit-only, nikdy v routovatelném katalogu").
- **`discovery/proposed-task-flow.service.ts`'s `toTaskTarget()` (řádky
  11-19)** a `SuggestedTargetSchema` (`libs/contracts/src/discovery/
  proposal.schema.ts:13`, `kind: z.enum(["agent","pipeline","goal",
  "orchestrator"])`) — **mimo scope tohoto plánu** (viz Cíl) — discovery
  nikdy chain nenavrhuje jako suggested target; rozšíření by šlo přidat
  později samostatně, pokud by to bylo žádoucí.

---

## Cíl

1. `TaskTargetSchema` zná `chain` jako 5. variantu (`id`-nesoucí, stejný tvar
   jako `pipeline`/`goal`) — explicit-only, nikdy klasifikátorem navrhovaný.
2. Task s `target.kind === "chain"` se dispatchne přes
   `ChainRunnerService.start(chainId, taskId)`, jeho outcome se zapíše zpátky
   na úkol stejně jako u agenta/pipeliny/goalu (terminální stav → `writeChain
   Outcome`), a jeho běh je plnohodnotná položka v unifikovaném `/runs`
   feedu (`kind: "chain"`), ne jen vnitřní pipeline run bez vlastní
   identity.
3. Detail chain-kind běhu na `/runs` zobrazí fold jeho kroků (každý krok =
   jeden pipeline run) — stejný vzor jako goal iterace dnes.
4. Run tlačítko na `/chains/:id` otevře `NewTaskDialog` s předvyplněným
   targetem na daný chain (target zůstává změnitelný, stejně jako u
   agent/pipeline Run tlačítek) — **místo** dnešního přímého
   `startChain.mutate(...)`.
5. **Mimo scope**: obecný "vyber libovolný chain" picker nezávislý na
   Run tlačítku (chain je jako goal — explicit-only, viz Otevřené otázky);
   chain-run-level `delete`/`resume`/`stop`/log/artefakt operace (patří
   kroku, ne řetězci); discovery `SuggestedTarget` s `kind: "chain"`.

---

## Fáze 1 — Kontrakt: `chain` jako `TaskTarget` + `ChainRun.taskId`

- [x] `libs/contracts/src/tasks/task.schema.ts`: přidat vedle
      `GoalTaskTargetSchema` (řádky ~33-79):
      ```ts
      export const ChainTaskTargetSchema = z.object({
        kind: z.literal("chain"),
        id: AgentIdSchema,
        ...taskTargetDisplayShape,
      });
      ```
      a do `TaskTargetSchema`'s `z.discriminatedUnion("kind", [...])` přidat
      `ChainTaskTargetSchema`. `CatalogTaskTarget` (řádek 83) beze změny —
      chain do katalogu nepatří, stejně jako goal.
- [x] `libs/contracts/src/chains/chain.schema.ts`: do `ChainRunSchema`
      přidat `taskId: z.string().optional()` (vedle `parkedReason`), s
      komentářem "Úkol, ze kterého byl řetězec dispatchnutý — chybí pro
      přímý `POST /chains/:id/run` mimo task flow."
- [x] `libs/contracts/src/tasks/task-run.schema.ts`:
  - `RunKindSchema` (řádek 19): `z.enum(["agent", "pipeline", "goal",
    "chain", "scheduled"])`.
  - `ProcessorSchema.kind` (řádek 56): přidat `"chain"`.
  - `TaskRunSchema` (řádky 72-137): přidat vedle goal polí (`goalId`,
    `iterations`) analogické `chainId: z.string().optional()` a `steps:
    z.array(ChainRunStepSchema).optional()` (import `ChainRunStepSchema` z
    `../chains/chain.schema`).
- [x] `pnpm typecheck` — očekávat chyby v exhaustivních switchích
      (`chat-tools.service.ts` popsáno níže) — to je záměr, ne regrese.

## Fáze 2 — Backend: `ChainRunnerService` — `taskId`, `onRunStatus`, `listAll`

- [x] `apps/api/src/chains/chain-runner.service.ts`: import `EventEmitter`
      z `node:events`; přidat `private readonly events = new EventEmitter();`
      vedle `private queue`.
- [x] `start(chainId: string, taskId?: string): Promise<ChainRun>` (řádek
      115) — přidat `taskId` param, uložit na `run.taskId = taskId` v
      konstruovaném objektu (řádky 118-129).
- [x] Nová veřejná metoda vedle `list()`/`get()` (řádky 136-144):
      ```ts
      /** Subscribe to every chain run's status transitions (mirrors PipelineRunnerService.onRunStatus). */
      onRunStatus(listener: (run: ChainRun) => void): () => void {
        this.events.on("status", listener);
        return () => this.events.off("status", listener);
      }

      /** Chains never evict from memory (loadPersisted keeps every run), so this is `list()` by another name — the shape TaskRunsService expects from every runner. */
      listAll(): ChainRun[] {
        return this.list();
      }
      ```
- [x] `persist()` (řádky 302-307): po `writeFileAtomic(...)` přidat
      `this.events.emit("status", run);` — jediné tranzitní místo, pokrývá
      `start`/`advance`/`onPipelineTransition`/`reconcile` najednou.
- [x] `pnpm test` pro `apps/api/src/chains/` (existující chain-runner testy
      nesmí se rozbít — `onModuleInit`'s `this.pipelineRunner.onRunStatus`
      subscribe zůstává beze změny).

## Fáze 3 — Backend: `TaskSchedulerService` — dispatch + outcome + DI

- [x] `apps/api/src/tasks/tasks.module.ts`: přidat `ChainsModule` do
      `imports` (řádky 36-48, vedle `GoalsModule`).
- [x] `apps/api/src/tasks/task-scheduler.service.ts`:
  - Constructor (řádky 104-121): přidat `private readonly chainRunner:
    ChainRunnerService,` vedle `goalRunner`.
  - `TERMINAL_*` konstanty (řádky 67-71): přidat `const TERMINAL_CHAIN = new
    Set<ChainRun["status"]>(["done", "failed"]);`.
  - `onModuleInit()` (řádky 126-143): přidat čtvrtý subscribe blok:
    ```ts
    this.chainRunner.onRunStatus((run) => {
      if (run.taskId) void this.writeChainOutcome(run.taskId, run);
      if (TERMINAL_CHAIN.has(run.status)) void this.drainQueues();
    }),
    ```
  - `dispatch()` (řádky 789-845): přidat novou větev po `"goal"`, před
    terminální orchestrator fallback:
    ```ts
    if (target.kind === "chain") {
      const run = await this.chainRunner.start(target.id, taskId);
      return { runRef: run.chainRunId, target };
    }
    ```
  - Nová `writeChainOutcome` (vedle `writeGoalOutcome`, řádky 1045-1072),
    stejná kostra:
    ```ts
    private async writeChainOutcome(taskId: string, run: ChainRun): Promise<void> {
      if (run.status !== "done" && run.status !== "failed") return;
      const outcome: TaskOutcome = {
        status: run.status === "done" ? "done" : "error",
        summary: `${run.steps.length} steps, ${run.status}`,
        finishedAt: new Date().toISOString(),
      };
      try {
        const task = await this.storage.writeOutcome(taskId, outcome);
        this.log.info("task outcome written", { taskId, runRef: run.chainRunId, status: run.status });
        void this.activity.record({
          kind: "task-outcome",
          summary: `task ${outcome.status}: ${outcome.summary}`,
          refs: {
            taskId,
            runRef: run.chainRunId,
            status: outcome.status,
            ...(task.projectId ? { projectId: task.projectId } : {}),
          },
        });
      } catch (error) {
        this.log.debug("task outcome write skipped", {
          taskId,
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
    ```
  - `refForTarget()` (řádky 1090-1094): přidat `if (target.kind === "chain")
    return { chainId: target.id };` (a rozšířit návratový typ o `chainId?:
    string`). `targetIdOf()` beze změny (`target.id` už pokrývá chain).
- [x] `pnpm typecheck && pnpm test` pro `apps/api/src/tasks/`.

## Fáze 4 — Backend: unifikovaný `/runs` feed (`TaskRunsService`)

- [x] Constructor (`task-runs.service.ts:65-73`): přidat `private readonly
      chainRunner: ChainRunnerService,` a `private readonly chainsStore:
      ChainsStorageService,` (pro jméno-lookup, vzor `pipelinesStore`).
- [x] `NameMaps` (řádky 47-51): přidat `chain: ReadonlyMap<string, string>;`.
- [x] `collect()` (řádky 183-223): přidat `this.chainRunner.listAll()` do
      `Promise.all(...)`, `this.chainsStore.list()` pro `names.chain`, a
      novou mapovací funkci `chainRunToView` do `runs: TaskRun[]` pole.
- [x] `kindOf()` (řádky 168-176): přidat `if (tryGet(() =>
      this.chainRunner.get(runId))) return "chain";` (před fallback na
      `collect()`).
- [x] `processorFor()` (řádky 243-249): rozšířit podmínku o `"chain"`.
- [x] Nová pure converter funkce (vedle `goalRunToView`, řádky 305-335):
      ```ts
      function chainRunToView(r: ChainRun): TaskRun {
        const status: TaskRun["status"] =
          r.status === "parked" ? "parked" : r.status === "failed" ? "error" : r.status === "done" ? "done" : "running";
        return {
          runId: r.chainRunId,
          kind: "chain",
          owner: r.chainId,
          status,
          pct: null,
          title: "",
          prompt: r.currentStep != null ? `krok ${r.currentStep + 1}/${r.steps.length}` : "",
          project: "",
          startedAt: r.startedAt,
          logBase: null,
          taskId: r.taskId,
          chainId: r.chainId,
          steps: r.steps,
        };
      }
      ```
      (`project: ""` — na rozdíl od pipeline/goal runů chain run nemá
      vlastní `cwd`; každý krok má svůj vlastní pipeline `cwd`, dostupný
      přes jeho vlastní `kind: "pipeline"` feed položku, pokud je potřeba.)
- [x] `getArtifact`/`resume`/`delete`/`stop` (řádky 100-160): **beze
      změny** — chain run padne do existujícího `throw`/`return null`
      finálního větve (viz Zjištění, "mimo scope").
- [x] `pnpm typecheck && pnpm test` pro `apps/api/src/tasks/`.

## Fáze 5 — Backend: zbylé exhaustivní switche + testy

- [x] `apps/api/src/chat/chat-tools.service.ts`, `describeTarget()` (řádky
      103-112): přidat `case "chain": return \`řetězec ${target.name}\`;`.
- [x] `apps/api/src/tasks/task-classifier.service.ts`, `isCoherent()`
      (řádek 217): rozšířit `if (target.kind === "orchestrator" ||
      target.kind === "goal") return false;` na `|| target.kind ===
      "chain"`, se stejným komentářem "explicit-only, nikdy v routovatelném
      katalogu".
- [x] Nové testy:
  - `apps/api/src/tasks/task-scheduler.service.test.ts` (nebo nejbližší
    existující test na `dispatch`): task s `target: {kind: "chain", id}`
    → `chainRunner.start` zavolané s `taskId`; terminální chain run (mock
    `onRunStatus` emit `status: "done"`) → `writeOutcome` zavolané se
    summary `"N steps, done"`.
  - `apps/api/src/tasks/task-runs.service.test.ts`: chain run se objeví v
    `listTaskRuns()` s `kind: "chain"`; `kindOf` rozpozná chain runId.
  - `apps/api/src/chains/chain-runner.service.test.ts`: `start(chainId,
    taskId)` → `run.taskId` nastavené; `onRunStatus` listener dostane
    emit po `start`/`advance`/parku/failu (aspoň jeden scénář z každého).
  - `apps/api/src/tasks/task-classifier.service.test.ts`: `isCoherent` s
    `target.kind === "chain"` → `false` (nikdy klasifikováno).
- [x] `pnpm test` (celá `apps/api` suita), `pnpm typecheck`.

## Fáze 6 — Frontend: `task.ts` — `TaskTarget`/`TaskTargetKind` rozšíření

- [x] `apps/web/features/tasks/task.ts`:
  - `TaskTargetKind` (řádek 59): `"agent" | "pipeline" | "goal" | "chain" |
    "orchestrator"`.
  - `TaskTarget` (řádky 98-100): první union arm rozšířit na `kind: "agent"
    | "pipeline" | "goal" | "chain"`.
  - `KIND_FALLBACK_GLYPH` (řádky 130-135): přidat `chain: "link",` (stejná
    ikona jako `chains/Screen.tsx:124`/`NewChainDialog.tsx:68`).
  - `targetKey`/`toApiTarget`/`toClientTarget` — **beze změny**, jsou už
    obecné nad `kind !== "orchestrator"`.
- [x] `pnpm typecheck` pro `apps/web`.

## Fáze 7 — Frontend: Run tlačítko na `/chains/:id` → prefill dialog

- [x] `apps/web/features/chains/Screen.tsx`:
  - Import `useNewTask` z `../tasks` (barrel).
  - Odebrat `useStartChainMutation` import/proměnnou `startChain` (řádky
    16, 55) — po téhle změně je to jediný zbylý spotřebitel v `apps/web`
    (mutace/kontrakt/endpoint samotné zůstávají, viz Zjištění).
  - Run tlačítko (řádky 184-192): `onClick={() => openNewTask(undefined, {
    kind: "chain", id: selected.id, name: selected.name ?? selected.id,
    glyph: "link" })}` — `disabled={startChain.isPending}` pryč (dialog
    otevření není async).
- [x] `apps/web/features/chains/Screen.test.tsx:85-89`: přepsat test —
      mockovat `useNewTask` (vzor `agents/DetailScreen.test.tsx:31,48`:
      `vi.mock("../tasks", () => ({ useNewTask: () => ({ open: hooks.
      openNewTask }) }))`), assert `hooks.openNewTask` zavolané s
      `(undefined, { kind: "chain", id: "research-then-build", name: ...,
      glyph: "link" })`.
- [x] `pnpm lint && pnpm typecheck`.

## Fáze 8 — Frontend: `RunDetail` chain-kind fold + oprava `phase-04.md`

- [x] `apps/web/features/runs/run.ts`, `KIND_GLYPH` (řádek 165, exhaustivní
      `Record<RunKind, IconName>`): přidat `chain: "link",`.
- [x] `apps/web/features/runs/components/RunDetail.tsx` (řádky 434-441,
      goal/pipeline fold): přidat třetí větev **před** `run.kind ===
      "pipeline"` (chain se jinak nikdy nedostane, protože samo o sobě
      nemá stage log):
      ```tsx
      ) : run.kind === "chain" ? (
        // Fold chain steps the same way a goal folds maker/verifier iterations —
        // each step's runRef is a pipeline run with its own stage timeline.
        <ChainStepsPanel run={run} />
      ) : run.kind === "pipeline" ? (
      ```
      Nová `ChainStepsPanel` (vedle `GoalDetailPanel`) renderuje
      `run.steps` (z Fáze 4) — pro každý krok se `runRef` deleguje na
      existující `PipelineStageTimeline`/log-otevírání komponentu, kterou
      goal iterace pro maker/verifier už používají — najít přesný název
      komponenty při implementaci (`GoalDetailPanel.tsx` import).
  - Meta řádek (řádky 382-394): `run.owner && run.kind !== "agent"` už
    pokrývá chain (`MetaCell` s `t("metaTarget")`, stejně jako goal) —
    beze změny.
- [x] **Opravit `docs/plans/phase-04.md`** — přidat poznámku na začátek
      souboru (hned pod nadpis/motivaci), že fáze 05 tohle rozhodnutí ruší,
      a zjednodušit Fáze 6 (`QuickLaunchPanel`) tak, aby chain **nebyl**
      speciální případ — jakmile je `chain` normální `TaskTarget`, RUN na
      připnuté chain kartě volá **stejné** `openNewTask(undefined, {kind:
      "chain", ...})` jako agent/pipeline, žádné `if (item.kind ===
      "chain") startChain.mutate(...)` větvení. (Fáze 04 je nekomitovaný
      draft — tahle oprava je bezpečná, nic neimplementovaného se
      "vrací".)
- [x] Nové/upravené testy:
  - `apps/web/features/runs/run.ts`'s `KIND_GLYPH` — pokud existuje
    tabulkový test, doplnit `chain` řádek.
  - `apps/web/features/runs/components/RunDetail.test.tsx`: nový test —
    `run.kind === "chain"` s `run.steps` → `ChainStepsPanel` (nebo její
    obsah) se vyrenderuje, ne `GoalDetailPanel`/stage timeline pro
    pipeline.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` (celá suita).
- [ ] Manuální smoke test: `/chains/:id` → Run → `NewTaskDialog` se otevře
      s targetem předvyplněným na daný chain (viditelný v "Edit" pickeru) →
      odeslat → task se dispatchne → `/runs` ukáže novou položku s `kind:
      "chain"` → po doběhnutí kroku 0 se prompt/steps aktualizuje → po
      celém řetězci `taskOutcome` na tasku odpovídá `"N steps, done"`.
  - _Pozn. (2026-07-04): odloženo na operátora — vyžaduje reálný `claude` běh
    přes celý řetězec pipelin; chování kryjí unit/komponentové testy
    (task-scheduler: chain dispatch + outcome "N steps, done"; task-runs:
    chain jako `kind: "chain"` řádek + `kindOf`; chain-runner: `taskId` +
    `onRunStatus`; classifier: chain je explicit-only; chains/Screen:
    Run → prefill dialog; RunDetail: chain fold)._

---

## Otevřené otázky (rozhodnout před/během implementace)

- **Chain jako obecná položka v pickeru (ne jen Run-button-prefill).**
  Operátorova formulace ("v new task dialogu by měla být možnost vyplnit
  jako target i řetězec") jde přečíst dvěma způsoby: (a) chain se objeví
  v pickeru, když je předvyplněný přes Run tlačítko (tenhle plán, goal
  model — **doporučeno**, konzistentní s tím, jak goal funguje dnes), nebo
  (b) chain by měl být vybíratelný z prázdného pickeru i bez předvyplnění
  (vyžadovalo by novou `useChainsQuery`-backed sekci v `allTargets`
  nezávislou na `initialTarget`/klasifikátoru — širší, samostatná změna
  `useTaskClassification.ts`). Tenhle plán staví na (a); pokud operátor
  chce i (b), je to čistě aditivní rozšíření nad touhle fází, ne redesign.
- **Chain-run-level delete/resume/stop zůstávají nepodporované** (viz Cíl,
  mimo scope) — pokud se v praxi ukáže potřeba smazat/resumnout celý
  chain run (ne jeho aktuální krok) přímo z `/runs`, jde o malé aditivní
  rozšíření `kindOf`-switchů ve Fázi 4.
- **`ChainStepsPanel`'s přesná komponenta pro per-step fold** — Fáze 8
  odkazuje na existující vzor z `GoalDetailPanel`, ale přesné jméno/props
  sdílené komponenty (pravděpodobně nějaká `PipelineStageTimeline`-obálka)
  je potřeba ověřit přímo v `GoalDetailPanel.tsx` při implementaci, ne
  předpokládat ze jména.
- **Discovery `SuggestedTarget` s `kind: "chain"`** — mimo scope (viz Cíl);
  žádný current use-case ho nevyžaduje (discovery dnes chainy nenavrhuje).
