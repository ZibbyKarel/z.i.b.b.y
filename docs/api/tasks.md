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
// TASK_TICK_MS = 60_000 výchozí (0 = disabled, pro testy)
setInterval(() => tick(), TASK_TICK_MS)
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

## Activity záznamy

| Event | Kdy |
|-------|-----|
| `task-created` | Úloha vytvořena |
| `task-dispatched` | Úloha odeslána runneru |
| `task-queued` | Úloha zařazena do fronty (maxConcurrent) |
| `task-held` | Úloha pozastavena pro budget schválení |
| `task-outcome` | Run dokončen, outcome zapsán zpět |
