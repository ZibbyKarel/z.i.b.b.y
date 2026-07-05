# Stavy běhu úlohy (run states)

> Referenční přehled ke stavům, které se objevují v jednotném feedu
> `GET /api/tasks/runs` (`TaskRunStatus`, `libs/contracts/src/tasks/task-run.schema.ts`).
> Doplňuje [api/tasks.md](./api/tasks.md), [api/agents-runs.md](./api/agents-runs.md)
> a [api/pipelines.md](./api/pipelines.md) — tady je to všechno pohromadě na jednom místě.

## Proč je stavů tolik: tři vrstvy jednoho životního cyklu

`TaskRunStatus` je plochý enum se 11 hodnotami, ale skládá se ze **tří různých
vnitřních modelů**, které se do něj promítají:

1. **`ScheduledTaskStatus`** (`ScheduledTask` — task record, ještě žádný běh) —
   `scheduled | queued | held | pending | dispatched | cancelled | failed |
dead-letter | awaiting-output`. Řeší otázku „kdy a jestli vůbec začít běžet".
2. **`RunStatus`** (sdílený tvar pro agent/skill/stage běh) — `running | done |
error | interrupted | awaiting-approval | paused-limit`. Řeší „co dělá živé dítě".
3. **`PipelineState` / `GoalState`** — nadstavba nad (2) pro víceúrovňové běhy:
   `done | failed | running | paused-limit | parked` (goal navíc odděluje
   `failed` vlastním enumem, ale sémanticky stejně).

`scheduledTaskToView()` a run-mappery v `task-runs.service.ts` tyhle tři vrstvy
sloučí do jednoho plochého stavu pro feed — a **některé vnitřní hodnoty se
schválně přemapují na stejné vnější slovo** (viz sekce Sloučení níže). To je
důvod, proč objevené stavy nejdou 1:1 na žádný jednotlivý zdrojový enum.

## Tabulka: všech 11 stavů z feedu

| Stav                    | Fáze            | Živé dítě? | Přežije restart API?                                 | Co znamená                                                                                                                                                                                                                                                  | Jak se řeší                                                                                                                                                 |
| ----------------------- | --------------- | ---------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`pending`**           | před-dispatch   | ne         | ano (`recoverPending()` na bootstrapu re-dispatchne) | Task byl přijat (interaktivní dialog), ale těžký dispatch — Haiku pojmenování + klasifikace + spawn runu — běží **na pozadí**. Task ještě nemá `runId` (feed ho ukazuje pod `taskId`).                                                                      | Transientní, typicky < 10 s. Přepne se v místě na `running` (spawn uspěl) nebo `error` (dispatch nenašel kam routovat).                                     |
| **`scheduled`**         | před-dispatch   | ne         | ano (leží jako soubor)                               | Task má `scheduledAt` v budoucnosti — čeká na svůj čas.                                                                                                                                                                                                     | Daemon tick (`taskTickMs`) ho vyzvedne, jakmile `scheduledAt <= now`, a zavolá `attemptDispatch`.                                                           |
| **`queued`**            | před-dispatch   | ne         | ano                                                  | Projekt je na `maxConcurrent` (běží už tolik souběžných runů, kolik smí). Čistě kapacitní, **bez schválení** — FIFO.                                                                                                                                        | Kdykoliv doběhne jiný run v projektu, `drain()` posune první `queued` task na dispatch.                                                                     |
| **`held`**              | před-dispatch   | ne         | ano                                                  | Dispatch by překročil budget cap projektu. Založí se `Approval` (`spend-past-cap`) — na rozdíl od `queued` čeká na **operátorské rozhodnutí**, ne na uvolnění kapacity.                                                                                     | `POST /api/tasks/:id/approve-override` → task se vrátí do fronty (budget check se pro toto ID jednou přeskočí).                                             |
| **`running`**           | live            | ano        | ne (dítě zemře s API → reconciliace, viz níže)       | Agent/pipeline/goal/chain skutečně běží.                                                                                                                                                                                                                    | Skončí `done`/`error`, nebo se zaparkuje do jednoho z pauzovacích stavů níže.                                                                               |
| **`awaiting-approval`** | pauza (durable) | ne         | **ano**                                              | Runner založil `Approval` a čeká na Tier-3 rozhodnutí (gate), než provede citlivou akci.                                                                                                                                                                    | Schválení/zamítnutí přes approval endpoint → pokračuje, nebo se zaruší → `interrupted`.                                                                     |
| **`paused-limit`**      | pauza (durable) | ne         | **ano**                                              | Dítě běhu zemřelo na vyčerpaný usage limit předplatného. **Pauza, ne selhání** — nečerpá retry rozpočet, nese `resumeAt` (kdy se okno resetuje).                                                                                                            | `LimitResumeService` daemon automaticky respawnuje po resetu okna — **bez operátora**. Po `LIMIT_RESUME_MAX` pokusech → `parked` (`parkedReason: "limit"`). |
| **`parked`**            | pauza (durable) | ne         | **ano**                                              | Pipeline/goal vyčerpal ohraničené úsilí a čeká na operátorskou poznámku. Důvod (`parkedReason`/`goalParkedReason`) je vlastní podstavba: `retries`/`output`/`approval` (pipeline), `iterations`/`budget`/`limit`/`verifier-scope`/`awaiting-resume` (goal). | `POST .../resume` s poznámkou operátora → pokračuje od zaparkované fáze/iterace.                                                                            |
| **`done`**              | terminál        | —          | —                                                    | Úspěšné dokončení.                                                                                                                                                                                                                                          | Konec.                                                                                                                                                      |
| **`error`**             | terminál        | —          | —                                                    | Neúspěšné dokončení — pád, špatný exit kód, nesplněný verifier, nebo (v pre-dispatch vrstvě) task, který se nepodařilo routovat/zaplatit.                                                                                                                   | Konec (dá se jen znovu zadat jako nová úloha).                                                                                                              |
| **`interrupted`**       | terminál        | —          | —                                                    | Běh byl **záměrně zastaven** — operátorem (stop/reject), nebo systémem při rekonciliaci na startu API (živé dítě zemřelo s procesem a nemá durable stav, ze kterého by šlo pokračovat). Odlišeno od `error`, protože to není selhání práce.                 | Konec.                                                                                                                                                      |

## Odpovědi na „dá se něco sloučit?"

Krátká odpověď: **tři z jedenácti stavů jsou už dnes záměrně sloučené** (viz
níže) a zbytek jde na první pohled sloučit, ale při bližším pohledu každá
dvojice řeší jinou otázku a sloučení by ztratilo informaci, kterou UI někde
jinde potřebuje.

### Co už JE sloučené (schválně, v kódu)

- **`error` kryje i vnitřní `failed`.** Pipeline (`PipelineState`) a goal
  (`GoalState`) mají interně stav `failed`, ne `error` — mapper v
  `task-runs.service.ts` ho na hranici přemapuje na `error`, aby feed měl jedno
  slovo pro "neúspěch" napříč agent/pipeline/goal/chain. Tohle je přesně ten typ
  sloučení, po kterém se ptáš — a už se stalo.
- **`error` kryje i mrtvý task.** `ScheduledTaskStatus` má navíc `failed`,
  `dead-letter` a `awaiting-output`, které feed nerozlišuje — všechny tři (mimo
  `awaiting-output`, který má vlastní gate a než skončí, žije jako `dispatched`)
  padají do `error`, pokud nejde o `cancelled` (→ `interrupted`) nebo aktivní
  stav. Detail: `dead-letter` je terminální varianta "opakovaně selhávající
  dispatch", zajímavá pro briefing, ale feedu navenek splývá s `error`.

### Co se podobá, ale sloučit se **nevyplatí**

- **`awaiting-approval` / `paused-limit` / `parked`** — to je jedna rodina
  ("durable pauza, žádné živé dítě, resumable"), a kód to sám pojmenovává tak
  (`paused-limit` je v komentáři popsán jako "modeled on `awaiting-approval`").
  Liší se ale v tom, **kdo/co je odemkne**:
  - `awaiting-approval` → operátorské ano/ne na konkrétní akci,
  - `paused-limit` → automaticky, časem, bez zásahu operátora,
  - `parked` → jen explicitní poznámka + resume, nikdy automaticky.
    Sloučení do jednoho stavu + `reason` pole (podobně jako `parked` už dnes má
    `parkedReason`) by ušetřilo enum, ale UI (badge, countdown u limitu, tlačítko
    schválení u approvalu, textové pole u parked) by si stejně muselo umět
    odvodit "jak se to řeší" — a to je přesně to, co dnes nese jméno stavu.
- **`queued` / `held`** — obě jsou "task čeká, než se spustí", ale `queued` je
  čistě kapacitní (nikdo se neptá, samo se uvolní) a `held` je rozpočtový a
  **vyžaduje Tier-3 schválení** (visí v `/gates`). Kdyby se sloučily do jednoho
  "blocked" stavu + reason, ztratil by se rozdíl mezi "nic nedělej, počkej" a
  "tohle potřebuje tvoje rozhodnutí" — což je přesně ten rozdíl, co Zákon o
  autonomii (tier 1 vs. tier 3) vyžaduje rozlišovat.
- **`scheduled` / `pending` / `queued`** — všechny tři jsou "ještě neběží", ale
  spouští je tři nezávislé mechanismy: časovač (`scheduledAt`), dokončení
  pozadí-dispatche, a uvolnění kapacity. Nejde o tutéž frontu ani stejný handler.
- **`interrupted` vs. `error`** — vypadají oba jako "neúspěch", ale `interrupted`
  výslovně **nečerpá** nic (není to selhání práce, je to zásah), zatímco `error`
  je skutečné selhání. UI/briefing na to musí reagovat jinak (interrupted se
  neeskaluje jako bug, error ano).

### Praktický závěr

Kdybych měl něco navrhnout ke sjednocení, byl by to spíš **kosmetický refaktor
jmen** než sloučení stavů: `queued`/`held` by mohly nést jednotné `blocked` +
`reason: "capacity" | "budget"` pole (mirror vzoru, co už `parked` používá) —
ale funkčně by se nic nezměnilo, jen by feed měl jednu novou vrstvu indirection
navíc. Vzhledem k tomu, že každý stav dnes 1:1 odpovídá jinému rozhodovacímu
mechanismu (kdo/co ho odemyká), bych zůstal u současného plochého enumu —
je to přesně tak granulární, kolik je za tím reálně odlišných mechanismů, ne víc.

## Zdrojové soubory

| Vrstva                  | Soubor                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Jednotný feed stav      | `libs/contracts/src/tasks/task-run.schema.ts` (`TaskRunStatusSchema`)                               |
| Task pre-dispatch stav  | `libs/contracts/src/tasks/task.schema.ts` (`ScheduledTaskStatusSchema`)                             |
| Sdílený run stav        | `libs/contracts/src/common.schema.ts` (`RunStatusSchema`)                                           |
| Pipeline stav           | `libs/contracts/src/pipelines/pipeline-run.schema.ts` (`PipelineStateSchema`, `ParkedReasonSchema`) |
| Goal stav               | `libs/contracts/src/goals/goal-run.schema.ts` (`GoalStateSchema`, `GoalParkedReasonSchema`)         |
| Mapping do feedu        | `apps/api/src/tasks/task-runs.service.ts` (`scheduledTaskToView`, run-mappery)                      |
| Scheduler rozhodování   | `apps/api/src/tasks/task-scheduler.service.ts` (`attemptDispatch`, `createTask`)                    |
| Reconciliace na restart | `apps/api/src/runner/runner-core.ts` (komentáře u `interrupted`)                                    |
