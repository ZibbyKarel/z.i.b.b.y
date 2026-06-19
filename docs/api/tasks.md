# Task scheduling & routing

## Co je Task

`ScheduledTask` je odložená nebo okamžitá úloha zadaná operátorem.
Při dispatch prochází klasifikací → routingem → stejnými runnery jako přímé spuštění agenta.

## Task lifecycle

```
scheduled    ← vytvořen s budoucím scheduledAt
    ↓
  tick()     ← daemon jednou za minutu
    ↓
queued       ← projekt dosáhl maxConcurrent (FIFO, bez schválení)
held         ← výdaj přesáhl budget cap (čeká na approve-override)
dispatched   ← přiřazen runneru
    ↓
awaiting-output ← run doběhl `done` a zvolený `pr` výstup čeká na bránu
    ↓             (durable; approve/reject → outcome zapsán, zpět na dispatched)
success | failed | cancelled
```

`TaskSchedulerService` spravuje celý lifecycle.

## Vytvoření úlohy

```
POST /api/tasks
Body: {
  title: string
  text: string               # popis úlohy (klasifikátor to přečte)
  paths?: string[]           # soubory / adresáře
  scheduledAt?: number       # epoch ms; pokud chybí nebo v minulosti → okamžitý dispatch
  projectId?: string         # explicitní přiřazení projektu (přeskočí matchování)
  target?: TaskTarget        # Phase 11: předem zvolený cíl, který přeskočí klasifikaci
                             # (naplánovaný loop nese { kind: "goal", id }; scheduler ho
                             # při ticku znovu nasadí na tento cíl místo re-klasifikace)
  output?: TaskOutput        # co se stane s hotovou prací (PR / soubor / void).
                             # Chybí = zdědit (pipeline si nechá svoje outputs, agent
                             # nic). Viz „Výstup úkolu" níže.
}
```

`scheduledAt` bez hodnoty nebo v minulosti → `createTask` spustí okamžitou klasifikaci + dispatch.

## Klasifikace (TaskClassifierService)

**Soubor:** `apps/api/src/tasks/task-classifier.service.ts`

Klasifikátor najde nejlepší cíl pro text úlohy:

1. Načte všechny agenty a pipeline (jejich `description` pole)
2. Keyword scoring — počítá překryv slov mezi textem úlohy a popis
3. Vrátí `TaskRouting`:
   ```typescript
   {
     target: "agent" | "pipeline" | "orchestrator"
     id?: string        // ID agenta nebo pipeline (orchestrator ID nemá)
     confidence: number // 0–1
     reason: string     // proč tento cíl
   }
   ```
4. Pokud katalog je prázdný → `EmptyCatalogError` → HTTP 422

Operátor může také volat `POST /api/tasks/classify` pro testování klasifikace bez vytvoření úlohy.

## Budget guard

Před každým dispatchem (okamžitým i ze scheduleru):

1. `matchProject(task, projects)` — přiřadí projekt k úloze (deterministické, bez tokenů)
2. `BudgetService.checkCap(projectId)` — ověří denní/měsíční budget
3. Přesáhl cap → task přejde do **held** stavu:
   - Vytvoří se `Approval` druhu `task` s `action: "spend-past-cap"`
   - Operátor schválí přes `POST /api/tasks/:id/approve-override`
   - Po schválení se task vrátí do fronty (budget check se přeskočí jednou pro toto ID)

## Concurrency guard

Každý projekt má `maxConcurrent` (kolik runů může běžet najednou):

1. `countActiveRuns(projectId)` — počítá běžící agent + pipeline runy projektu
2. Dosáhlo limitu → task přejde do **queued** stavu (bez schválení)
3. Při každém terminálu runu → `drain(projectId)` — přesune první queued task do dispatch

`budgetApproved: Set<string>` v paměti — IDs úloh s approve-override; drain tyto úlohy přeskočí budget check, pak je z setu odstraní.

## Daemon tick

```typescript
// taskTickMs (runtime system config) = 30_000 výchozí (0 = disabled, pro testy);
// scheduler se přearmuje naživo přes SystemConfigStore.onChange při změně configu.
setInterval(() => tick(), systemConfig.current().taskTickMs)
```

`tick()`:
1. Načte všechny `scheduled` úlohy s `scheduledAt <= now`
2. Pro každou volá `attemptDispatch(task)`
3. `attemptDispatch` → budget check → concurrency check → route → dispatch

## Routing a dispatch

| Target | Dispatcher |
|--------|-----------|
| `agent` | `AgentRunnerService.startRun(agentId, { prompt, project })` |
| `pipeline` | `PipelineRunnerService.startRun(pipelineId, { prompt, project })` |
| `orchestrator` | `AgentRunnerService.startRun(ORCHESTRATOR_ID, { prompt })` |

Po dispatchun se zapíše `runRef` do task recordu.

## Výsledek (outcome)

Daemon sleduje terminal stav run:
- `AgentRun.status: done | error | interrupted` → task dostane `outcome: { status, summary }`
- `PipelineRun.status: done | failed` → totéž
- `summary` je zkrácen na `SUMMARY_MAX_CHARS = 200` znaků

## API endpoints

```
GET    /api/tasks                     seznam (filtrovatelný podle status)
POST   /api/tasks                     vytvoření / okamžitý dispatch
PUT    /api/tasks/:id                 aktualizace naplánované úlohy
DELETE /api/tasks/:id                 zrušení (jen scheduled | queued | held)
POST   /api/tasks/:id/approve-override   odemkni held úlohu (spend-past-cap)
POST   /api/tasks/classify            klasifikuj text bez vytvoření úlohy
```

## Jednotný run povrch (`/api/tasks/runs`)

Úkol je entita, která běží; procesor (agent / pipeline / goal) je metadata.
Všechny operace nad během žijí pod jedním povrchem — žádné per-kind run routy.
Run se spouští **jen** vytvořením úlohy (`POST /api/tasks`); start není součástí
tohoto povrchu. `TaskRunSchema` je nadmnožina feed-řádku + volitelný
`processor: { kind, id, name }` (název padá zpět na id, když byla definice
smazána). Goal maker/verifier child runy jsou z feedu složeny dovnitř (nejsou
peer řádky), ale zůstávají dosažitelné v detailu cíle.

```
GET    /api/tasks/runs                          jednotný feed (newest-first; agent/pipeline/goal/scheduled)
GET    /api/tasks/runs/:runId                   detail jednoho běhu
GET    /api/tasks/runs/:runId/logs?offset=      chunk logu od byte offsetu
GET    /api/tasks/runs/:runId/logs/stream       SSE tail (fallback na offset-poll)
GET    /api/tasks/runs/:runId/stages/:phaseId/logs?offset=   log jedné pipeline fáze
GET    /api/tasks/runs/:runId/artifacts/:name   whitelistovaný artefakt (pr-draft.md, verdict.txt, …)
POST   /api/tasks/runs/:runId/stop              zastavení běžícího runu
POST   /api/tasks/runs/:runId/resume            pokračování parkovaného runu (s poznámkou)
DELETE /api/tasks/runs/:runId                   smazání běhu + artefaktů
```

Resolver podle `runId` dispatchne na vlastnícího runnera. Jediné per-kind run
endpointy, které zůstaly, jsou katalogové živosti `GET /api/agents/running` a
`GET /api/pipelines/runs` (badge/počítadla v katalogu) — viz
[agents-runs.md](./agents-runs.md) a [pipelines.md](./pipelines.md).

## Výstup úkolu (`output`)

Operátor v dialogu Nový task volí, **co se stane s hotovou prací** — protějšek
pipeline bloku `outputs:`. Je to deterministické a vlastněné systémem (žádný agent,
žádné tokeny); výstupní strana „PR je brána". `TaskOutput` je diskriminovaná unie:

| `type` | Pole | Co dělá |
|--------|------|---------|
| `pr` | — | Otevře PR z branche hotového runu. **Vždy zaparkuje** za approvalem `task-output`, než pushne (PR je brána, strukturálně). |
| `file` | `dest`, `to` | Zapíše výsledek (shrnutí runu) do souboru — do projektového worktree (`dest: project`) nebo jako poznámku ve vaultu (`dest: vault`). Tier-1, hned. |
| `void` | — | Explicitně žádný výstup (potlačí i pipeline deklarovaný `pr`). |

**Chybějící pole = zdědit, ne void.** U pipeline cíle se použijí jeho vlastní
`outputs:`, u agenta/orchestrátoru se nic nedoručí (dnešní chování). „Nezvolil" a
„zvolil void" jsou dva různé stavy.

**Dvě cesty, jedna brána.**

- **Pipeline cíl** — `output` se předá runneru jako per-run override deklarovaných
  `outputs:` (uloženo jako `PipelineRun.outputsOverride`; `void` → `[]`). Zbytek
  obstará existující pipeline output gate (`parkedReason: "output"`).
- **Agent / orchestrátor cíl** — gate žije na úrovni tasku (`TaskOutputService`),
  protože agent runy nemají vlastní durable park. Když run skončí `done`:
  - `file` se doručí hned (Tier-1), outcome se zapíše normálně.
  - `pr` **commitne** branch (`checkpoint` — `git add -A && commit`, vlastněno
    systémem, nezávisle na agentovi; commit ≠ push), zachytí `branch` + `repoPath`
    do `pendingOutput`, založí approval `task-output` (runId = taskId) a task přejde
    na `awaiting-output`. Tahle parkovací stav je **durable** (run už doběhl, žádné
    živé dítě — `ScheduledTask` record JE ten stav, přežije restart zadarmo). Po
    schválení systém pushne z `repoPath` proti `branch` (ref přežije i úklid
    worktree) a zapíše outcome; zamítnutí nechá práci na branchi bez PR. Když branch
    nemá žádné commity nebo run nemá worktree → soft no-op (žádná brána, outcome jako
    obvykle).

## Phase 11 — sjednocené zadání (loop shape + path scoping)

Klasifikace zůstává **bez vedlejších efektů** a katalog dál routuje jen na
agent/pipeline/orchestrator (`isCoherent` cíl `goal` nadále vylučuje). `TaskRouting`
ale nese tři přídavná, zpětně kompatibilní pole (starý klient je ignoruje):

```typescript
{
  // …target, confidence, reason, matchedTerms, candidates…
  mode: "single" | "loop"            // default "single"
  proposedGoal: ProposedGoal | null  // syntéza goalu, když mode === "loop"
  paths: ResolvedPath[]              // detekované cesty přiřazené k projektům
}
```

- **Loop detekce (dvě nohy).** LLM router smí vrátit `loop: true` (anotace na svém
  agent/pipeline výběru), nebo deterministický `detectLoopCue(text)` (cs+en, fold
  diakritiky) najde cue typu „dokud", „keep retrying", „until it passes". Když platí
  kterákoli a existuje konkrétní maker, klasifikátor sestaví `proposedGoal`
  (`synthesizeGoal`): `objective`/`instructions` = surový text úlohy (Law 4 — data,
  ne příkaz), `maker` = zvolený agent/pipeline (orchestrator → první pipeline z
  katalogu, jinak `mode` zpět na `single`), `verifier: { kind: "checks" }` (výchozí
  kontroly projektu), `maxIterations = DEFAULT_GOAL_ITERATIONS`. **Nic se nezapisuje**
  — `.goal.md` vznikne až při submitu z webu (createGoal → startGoalRun, u
  naplánovaného loopu createGoal → createTask s `target: goal`).

- **Path scoping.** Klasifikátor přes `matchProject` přiřadí každou `paths[]` cestu k
  projektu (read-only atribuce). Web vykreslí „v projektu <name>", nebo u cesty mimo
  projekt nabídne **povolit přístup** — operátorský confirm zavolá `createProject`
  (registruje složku jako workspace root). Žádný autonomní tok grant nevolá (Law 1).
  Negitová udělená složka běží přímo jako cwd (bez worktree, bez `WorkspaceSetupError`).

## Activity záznamy

| Event | Kdy |
|-------|-----|
| `task-created` | Úloha vytvořena |
| `task-dispatched` | Úloha odeslána runneru |
| `task-queued` | Úloha zařazena do fronty (maxConcurrent) |
| `task-held` | Úloha pozastavena pro budget schválení |
| `task-outcome` | Run dokončen, outcome zapsán zpět |
