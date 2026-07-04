# Plán: Cena běhu (odhad USD) na `/runs` + rozpad podle fází pipeliny

> Motivace: chci mít u každého běhu na `/runs` přehled, kolik mě (odhadem) stál —
> abych viděl, kde se nejvíce pálí tokeny. U pipeline běhu navíc chci vidět cenu
> rozpadlou po jednotlivých fázích, ne jen souhrn za celý běh. Průzkum ukázal, že
> **žádné sledování ceny dnes neexistuje** — `formatClaudeStreamLine` zahazuje
> přesně ta pole `claude -p --output-format stream-json` výstupu, která by šlo
> použít (empiricky ověřeno spuštěním reálného `claude` CLI, viz Zjištění). Tenhle
> plán přidává zachycení ceny z výstupu, její persistenci napříč restarty a
> zobrazení na `/runs` (souhrn běhu + rozpad po fázích u pipelin).

---

## Zjištění (současný stav, ověřeno v kódu i empiricky)

- **`claude -p --output-format stream-json` už cenu počítá a posílá** — ověřeno
  přímým spuštěním (`claude -p "say hi" --output-format stream-json --verbose`).
  Poslední řádek streamu je `{"type":"result", ...}` a obsahuje mj.:
  ```json
  {
    "type": "result", "subtype": "success", "is_error": false,
    "duration_ms": 7214, "num_turns": 1,
    "total_cost_usd": 0.2934669,
    "usage": {
      "input_tokens": 2, "output_tokens": 87,
      "cache_creation_input_tokens": 47495, "cache_read_input_tokens": 23953,
      "server_tool_use": { "web_search_requests": 0, "web_fetch_requests": 0 }
    },
    "modelUsage": { "claude-sonnet-5": { "costUSD": 0.2934669, ... } }
  }
  ```
  `total_cost_usd` je přesně ta hodnota, kterou tenhle plán chce zobrazit — žádný
  vlastní pricing výpočet není potřeba, jen ji vytáhnout z výstupu.
- **Dnes se tahle hodnota zahazuje.** `formatClaudeStreamLine`
  (`apps/api/src/runner/claude-stream-format.ts:30-54`) parsuje `stream-json`
  řádky jen na zobrazení v logu; `formatResult()` (řádky 128-134) čte z
  `result` eventu pouze `duration_ms` a `subtype` — `total_cost_usd`/`usage` se
  nikam neukládá.
- **Kde řádky výstupu skutečně protékají**: `RunnerCore.wire()`
  (`apps/api/src/runner/runner-core.ts:886-995`) čte stdout/stderr po chunkách,
  rozseká na kompletní řádky (`residual` buffer, řádky 896-905) a pro každý
  kompletní řádek volá `this.formatLine` (jen pro log) a zvlášť regexem parsuje
  řídicí signály (`PROGRESS`, `INTENT`, řádky 911-937) přímo do `run` (mutace
  živého objektu, stejně jako `run.pct`). Cenu je potřeba parsovat stejným
  způsobem — vedle `PROGRESS`/`INTENT`, ne přes `formatLine` (ten jen renderuje
  log, nesmí nic mutovat na `run`).
- **Past: poslední řádek běhu (`result`) může skončit bez trailing newline** —
  `flushResidual()` (řádky 963-971) v tom případě pustí zbytek jen přes
  `this.formatLine` (kvůli logu), **ne** přes hlavní smyčku, kde by parsing ceny
  normálně seděl vedle `PROGRESS`/`INTENT`. Pokud se parsing ceny napíše jen do
  `onChunk`, na doběhnutý run bez koncového `\n` se nikdy nespustí. Řešení:
  vytáhnout parsing ceny do jedné sdílené funkce a zavolat ji z obou míst
  (`onChunk` i `flushResidual`).
- **Limit-pause respawn NEPOUŽÍVÁ `--resume`** — `RunnerCore.resume()`
  (`runner-core.ts:462-509`) na paused-limit běhu znovu spustí **stejné
  `spec.args`** jako při prvním spawnu (řádek 489, `spawn(spec.command,
  spec.args, ...)`), na **stejný `runId`** a se **stejným log souborem**
  (`flags: "a"`, řádek 497 — append, ne přepis). `--resume <session-id>` používá
  jen `chat-session.service.ts:106` (Chat-UI persona, jiná feature) — agent i
  pipeline runner ho nikde nevolá. Důsledek: jeden `runId`/`BaseRun` může za svůj
  život vidět **víc než jeden `result` event** (jeden na respawn), a každý je
  **nezávislá** claude relace, ne pokračování — `total_cost_usd` v druhém eventu
  není kumulativní součet za celou historii runId, je to cena jen toho
  respawnu. **Cenu je tedy nutné SČÍTAT přes respawny, ne přepisovat** poslední
  hodnotou.
- **`BaseRun`** (`apps/api/src/runner/runner-core.types.ts:30-52`) je sdílený typ
  přes všechny druhy běhů (agent, pipeline-stage) — přirozené místo pro nové pole
  `costUsd?: number`, mutované stejně jako `pct`.
- **Schema round-trip při restartu ořízne nedeklarovaná pole.** `assemble()`
  (`KindStrategy.assemble`) sice `...base` rozbalí do výsledného záznamu
  (`agent-run.record.ts:41-54`, `pipeline-stage.record.ts:35-43`), ale při
  restartu backendu se sidecar JSON validuje přes `schema.parse()`
  (`RunnerCore` konstruktor, `strategy.schema`) — nedeklarované pole se ztratí.
  Musí se tedy přidat i do:
  - `AgentRunSchema` (`libs/contracts/src/agents/agent-run.schema.ts:30-79`) —
    `AgentRunRecordSchema` ho jen `.extend()`-uje (`agent-run.record.ts:11-22`),
    takže pole musí být na kontraktu, jinak ho `toAgentRun()`
    (`agent-run.record.ts:34-36`, `AgentRunSchema.parse(rec)`) při projekci na
    web smaže.
  - `PipelineStageRecordSchema` (`apps/api/src/pipelines/pipeline-stage.record.ts:10-28`)
    — je to samostatný zod objekt (nerozšiřuje nic), pole musí být přímo tady.
- **Kde se cena jedné fáze dostane do agregátu pipeline běhu**: `runStage()`
  (`apps/api/src/pipelines/pipeline-runner.service.ts:1362-1407`) po
  `waitForStage()` (řádek 1405) vrací `StageRun` objekt (řádek 1406,
  `return { phaseId: phase.id, runId: rec.runId, attempt, status }`) — tady
  chybí `costUsd`. Finální `PipelineStageRecord` (s doběhlou cenou) je
  dostupný přes `this.core.get(rec.runId)` — stejný vzor už kód používá jinde
  (`pipeline-runner.service.ts:806`, `const stageRec =
  this.core.get(stageRun.runId)`).
- **`StageRunSchema`** (`libs/contracts/src/pipelines/pipeline-run.schema.ts:46-54`)
  potřebuje nové optional pole `costUsd`, aby se cena fáze dostala přes
  `run.stageRuns` (pole na `PipelineRun`, řádek 116) až na frontend.
- **`PipelineRunSchema` nepotřebuje vlastní `costUsd` pole** — celkovou cenu
  pipeline běhu lze vždy dopočítat součtem `stageRuns[].costUsd` v místě, kde se
  `PipelineRun` promítá na unifikovaný feed (`pipelineRunToView`, viz níže) —
  jeden zdroj pravdy, žádná duplicitní perzistovaná hodnota, která by se mohla
  rozejít.
- **Unifikovaný `/runs` feed**: `TaskRunSchema`
  (`libs/contracts/src/tasks/task-run.schema.ts`) je řádek, který `/runs`
  skutečně zobrazuje — potřebuje nové optional pole `costUsd`. Frontend
  `RunView` je **přímý alias** `TaskRun` (`apps/web/features/runs/run.ts:14`,
  `export type RunView = TaskRun;`), takže jakmile je pole na kontraktu, web ho
  vidí bez dalších typových úprav.
- **Projekce na `TaskRun`** (`apps/api/src/tasks/task-runs.service.ts`):
  - `agentRunToView(r)` (řádky 253-269) — prostě `costUsd: r.costUsd`.
  - `pipelineRunToView(r)` (řádky 271-303) — dopočítat součet
    `r.stageRuns.reduce((sum, s) => sum + (s.costUsd ?? 0), 0)`, ale nastavit
    `costUsd` jen když **aspoň jedna** fáze cenu má (jinak by starý pipeline běh
    z doby před touhle featurou ukazoval zavádějící `$0.00` místo "žádná data").
  - `goalRunToView(r)` (řádky 305-335) — **mimo scope**, viz Otevřené otázky.
- **Co "cena" reálně znamená**: komentář u `OPERATING_CONTRACT`
  (`apps/api/src/runner/claude-run-command.service.ts:333`, "This runs under the
  Max subscription with no extra API/classifier cost") potvrzuje, že operátor
  neplatí per-token — `total_cost_usd` je **odhad podle API ceníku**, ne reálně
  utracené peníze. Pro účel "kde se pálí tokeny" je to dobrý monotónní proxy
  metrik, ale UI popisek to musí říkat na rovinu (viz Cíl bod 3), ne tvářit se
  jako skutečný účet.
- **Žádný formátovač peněz na webu neexistuje.** `apps/web/utils/` má jen
  `slug.ts` a `time.ts` (`relativeTime`, `resumeEta`) — analogický vzor pro
  nový `cost.ts`.
- **Místa v UI, kam cena patří**:
  - `RunDetail.tsx` — hlavička běhu má řádek `MetaCell` dlaždic
    (`MetaCell` komponenta řádky 102-113, použití v `Stack` na řádcích 382-414:
    `metaProject`, `metaStarted`/`metaScheduled`, `metaPipeline`/`metaTarget`,
    `metaTask`). Sem patří `MetaCell` s celkovou cenou běhu.
  - `TaskCard.tsx` — patička karty v seznamu (řádky 89-111) už ukazuje
    `owner`/`project`/`startedLabel` — sem patří krátký cenový štítek, aby šlo
    "kde se pálí tokeny" odhalit i bez otevření detailu.
  - `PipelineStageTimeline.tsx` — řádek jedné fáze (řádky 156-207) má vedle
    `RunStateBadge` (řádky 184-188) i `verdict` `Tag`; sem patří cenový `Tag`/
    `Typography` pro tu konkrétní fázi.
- **i18n konvence** (`apps/web/i18n/messages/{cs,en}.json`, namespace `runs`
  přes `useTranslations("runs")`): existující klíče typu `metaProject`
  (cs.json:875), `metaStarted` (876), `metaPipeline` (879), `stageAttempt`
  (976) — nové klíče `metaCost`/`stageCost` půjdou vedle nich.

---

## Cíl

1. Úspěšně dokončený agent i pipeline běh dostane na `/runs` **celkovou cenu
   (odhad v USD)** — v hlavičce detailu a jako krátký štítek na kartě v
   seznamu.
2. U pipeline běhu navíc rozpad **cena za jednotlivou fázi** přímo ve stage
   timeline (vedle stavu dané fáze).
3. Cena je **odhad podle API ceníku** (`total_cost_usd` z `claude -p`), ne
   reálné vyúčtování (operátor běží na Max subscription) — popisek v UI to
   musí říkat, ne tvářit se jako účet.
4. Mimo scope: goal běhy (mají jiný, existující koncept "ceny" —
   iterace/`maxIterations`, viz `GoalDetailPanel.tsx:26-27,63-100`) a
   rozpad podle typu tokenu (input/output/cache) — viz Otevřené otázky.

---

## Fáze 1 — Backend: zachytit cenu z výstupu `claude -p`

- [ ] V `apps/api/src/runner/runner-core.types.ts` přidat do `BaseRun`
      (řádky 30-52) nové optional pole:
      ```ts
      /**
       * Souhrnná cena běhu v USD (odhad podle API ceníku, `total_cost_usd` z
       * `claude -p --output-format stream-json`). Akumuluje se přes respawny
       * (limit-pause resume spouští stejný runId znovu BEZ `--resume`, takže
       * jde o nezávislé relace, ne pokračování — viz Zjištění). Absent, dokud
       * run neuvidí svůj první `result` event; absent i pro demo/test běhy bez
       * `formatLine`.
       */
      costUsd?: number;
      ```
- [ ] V `apps/api/src/runner/runner-core.ts` přidat privátní metodu (blízko
      `wire()`, řádek 886):
      ```ts
      /**
       * Vytáhne `total_cost_usd` z jednoho stream-json `result` řádku, nebo
       * `null`, pokud řádek není platný `result` event. Levný substring check
       * před `JSON.parse`, aby se neparsovaly všechny ostatní řádky výstupu.
       */
      private extractResultCost(raw: string): number | null {
        const line = raw.trim();
        if (!line.startsWith("{") || !line.includes('"total_cost_usd"')) return null;
        try {
          const evt = JSON.parse(line);
          return evt?.type === "result" && typeof evt.total_cost_usd === "number"
            ? evt.total_cost_usd
            : null;
        } catch {
          return null; // not JSON / malformed — ignore
        }
      }
      ```
- [ ] V `wire()` (`onChunk`, řádky 897-953) přidat volání vedle
      `PROGRESS`/`INTENT` parsování (po bloku řádků 911-937), jen když je
      `this.formatLine` nastavený (reálný claude běh, ne demo/test):
      ```ts
      if (this.formatLine) {
        const cost = this.extractResultCost(raw);
        if (cost !== null) run.costUsd = (run.costUsd ?? 0) + cost;
      }
      ```
- [ ] V `flushResidual()` (řádky 963-971) přidat stejné volání na `residual`
      **před** jeho vynulováním, aby se nepřišlo o `result` event, který dorazí
      jako poslední řádek bez trailing newline:
      ```ts
      const flushResidual = () => {
        if (this.formatLine && residual) {
          const cost = this.extractResultCost(residual);
          if (cost !== null) run.costUsd = (run.costUsd ?? 0) + cost;
          const formatted = this.formatLine(residual);
          if (formatted !== null) log.write(`${formatted}\n`);
          residual = "";
        }
      };
      ```
- [ ] `pnpm typecheck`.

## Fáze 2 — Persistence napříč restarty (schémata)

- [ ] V `libs/contracts/src/agents/agent-run.schema.ts` přidat do
      `AgentRunSchema` (řádky 30-79, vedle `limitResumeCycles`) nové optional
      pole `costUsd: z.number().optional()` s komentářem "Souhrnná cena běhu
      (odhad USD, viz runner-core.types.ts `BaseRun.costUsd`)."
- [ ] V `apps/api/src/pipelines/pipeline-stage.record.ts` přidat do
      `PipelineStageRecordSchema` (řádky 10-28, vedle `limitResumeCycles`)
      stejné pole `costUsd: z.number().optional()`.
- [ ] V `libs/contracts/src/pipelines/pipeline-run.schema.ts` přidat do
      `StageRunSchema` (řádky 46-54, vedle `verdict`) pole
      `costUsd: z.number().optional()` — "Cena téhle fáze (odhad USD),
      zkopírovaná z dokončeného `PipelineStageRecord` po `waitForStage()`."
- [ ] V `apps/api/src/pipelines/pipeline-runner.service.ts`, `runStage()`
      (řádky 1362-1407): po `const status = await this.waitForStage(rec.runId);`
      (řádek 1405) načíst dokončený záznam a promítnout cenu do vraceného
      `StageRun`:
      ```ts
      const status = await this.waitForStage(rec.runId);
      const finishedRec = this.core.get(rec.runId);
      return {
        phaseId: phase.id,
        runId: rec.runId,
        attempt,
        status,
        ...(finishedRec.costUsd != null ? { costUsd: finishedRec.costUsd } : {}),
      };
      ```
- [ ] `pnpm typecheck` — ověřit, že `this.core.get()` (stejná signatura jako na
      řádku 806) vrací typ obsahující `costUsd` po úpravě `PipelineStageRecord`.

## Fáze 3 — Unifikovaný `/runs` feed

- [ ] V `libs/contracts/src/tasks/task-run.schema.ts` přidat do `TaskRunSchema`
      nové optional pole `costUsd: z.number().optional()` — "Souhrnná cena běhu
      (odhad USD): pro agent běh přímo z `AgentRun.costUsd`, pro pipeline běh
      součet `stageRuns[].costUsd`. Absent = žádná data (starý běh před touhle
      featurou), ne nula." Umístit vedle `checkpoints`/`stageRuns`.
- [ ] V `apps/api/src/tasks/task-runs.service.ts`:
  - `agentRunToView(r)` (řádky 253-269): přidat `costUsd: r.costUsd,`.
  - `pipelineRunToView(r)` (řádky 271-303): před `return` dopočítat
    ```ts
    const stageCosts = r.stageRuns.filter((s) => s.costUsd != null);
    const costUsd = stageCosts.length
      ? stageCosts.reduce((sum, s) => sum + (s.costUsd ?? 0), 0)
      : undefined;
    ```
    a do vraceného objektu přidat `costUsd,`.
- [ ] `pnpm typecheck`.

## Fáze 4 — Frontend: formátování a zobrazení

- [ ] Vytvořit `apps/web/utils/cost.ts` (vzor `time.ts`):
      ```ts
      /**
       * Formátuje odhad ceny v USD pro zobrazení: pod half-cent zaokrouhlené
       * "< $0.01" (aby drobné běhy neukazovaly zavádějící "$0.00"), jinak dvě
       * desetinná místa.
       */
      export function formatCostUsd(usd: number): string {
        if (usd < 0.005) return "< $0.01";
        return `$${usd.toFixed(2)}`;
      }
      ```
- [ ] `apps/web/utils/cost.test.ts` (vzor `time.test.ts`): tabulkový test —
      `0` → `"< $0.01"`, `0.0034` → `"< $0.01"`, `0.2934669` → `"$0.29"`,
      `12.5` → `"$12.50"`.
- [ ] V `apps/web/features/runs/components/RunDetail.tsx` přidat do meta pruhu
      hlavičky (`Stack` řádky 382-414, vedle `metaTask`/`metaProject`):
      ```tsx
      {run.costUsd != null && (
        <MetaCell label={t("metaCost")} value={formatCostUsd(run.costUsd)} />
      )}
      ```
      Import `formatCostUsd` z `../../../utils/cost`.
- [ ] V `apps/web/features/runs/components/TaskCard.tsx` přidat do patičky
      karty (`Stack` řádky 103-110, vedle `owner`/`project`/`startedLabel`)
      krátký cenový štítek, jen když je hodnota k dispozici:
      ```tsx
      {run.costUsd != null && (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {formatCostUsd(run.costUsd)}
        </Typography>
      )}
      ```
      (Umístit před stávající `Typography` s `owner`/`project`/`startedLabel`,
      nebo za ni — vizuální doladění při implementaci; funkčně nezáleží.)
- [ ] V `apps/web/features/runs/components/PipelineStageTimeline.tsx` přidat
      do řádku fáze (`Stack` řádky 174-188, vedle `RunStateBadge`) cenu té
      fáze, jen když ji stage má:
      ```tsx
      {s.costUsd != null && (
        <Typography mono size="2xs" type="note" variant="tertiary">
          {formatCostUsd(s.costUsd)}
        </Typography>
      )}
      ```
- [ ] Do `apps/web/i18n/messages/cs.json` a `en.json` (namespace `runs`,
      vedle `metaProject`/`metaPipeline` na řádcích ~875-879) přidat:
      - cs: `"metaCost": "cena (odhad)"`
      - en: `"metaCost": "cost (est.)"`
      (Odhadní charakter musí být v popisku vidět — viz Cíl bod 3; per-fázový
      cenový štítek v `PipelineStageTimeline` žádný vlastní label nepotřebuje,
      čte se v kontextu řádku fáze.)
- [ ] `pnpm lint && pnpm typecheck`.

## Fáze 5 — Testy

- [ ] `apps/api/src/runner/runner-core.test.ts` (nebo nejbližší existující
      test souboru pro `RunnerCore`): nový test — dvoufázový child (demo/mock),
      který na stdout pošle `result` řádek s `total_cost_usd: 0.1`, pak (po
      simulovaném limit-pause `resume()`) druhý respawn se svým vlastním
      `result` řádkem `total_cost_usd: 0.2` na **stejném** `runId` → očekávat
      `run.costUsd === 0.3` (součet, ne přepis — ověřuje klíčové zjištění o
      respawnu bez `--resume`).
  - Druhý test: `result` event jako poslední řádek streamu **bez** trailing
    newline → `run.costUsd` je po doběhnutí runu přesto nastavené (ověřuje
    `flushResidual` opravu).
  - Třetí test: demo/test běh bez `formatLine` → `run.costUsd` zůstává
    `undefined` (žádný false-positive parsing na neformátovaném výstupu).
- [ ] `apps/api/src/pipelines/pipeline-runner.service.test.ts` (nebo
      `pipeline-runner.outputs.test.ts`): stage s doběhlou cenou → vrácený
      `StageRun.costUsd` odpovídá `PipelineStageRecord.costUsd` z `this.core`.
- [ ] `apps/api/src/tasks/task-runs.service.test.ts` (nebo nejbližší existující
      test na `pipelineRunToView`/`agentRunToView`): pipeline run se dvěma
      fázemi, jen jedna má `costUsd` → výsledný `TaskRun.costUsd` je součet jen
      té jedné (ne `NaN`, ne `0`); pipeline run bez jediné fáze s cenou →
      `TaskRun.costUsd` je `undefined`, ne `0`.
- [ ] `apps/web/utils/cost.test.ts` — viz Fáze 4.
- [ ] `apps/web/features/runs/components/RunDetail.test.tsx`: nový test —
      `run.costUsd` nastaveno → `MetaCell` s formátovanou cenou v hlavičce;
      `run.costUsd` `undefined` → dlaždice se nerenderuje vůbec (ne prázdná
      hodnota).
- [ ] `apps/web/features/runs/components/PipelineStageTimeline.test.tsx`:
      nový test — `stageRuns[i].costUsd` nastaveno → cena vidět v řádku té
      fáze; jiná fáze bez ceny → žádný cenový text v jejím řádku.
- [ ] `pnpm test` (celá suita), `pnpm typecheck`, `pnpm lint`.
- [ ] Manuální smoke test: spustit libovolný agent/pipeline task, počkat na
      `done`, otevřít `/runs` → ověřit cenu v hlavičce detailu, na kartě v
      seznamu, a (u pipeline běhu) u každé fáze ve stage timeline.

---

## Otevřené otázky (rozhodnout před/během implementace)

- **Goal běhy zůstávají mimo scope.** `GoalDetailPanel` už "cenu" zobrazuje,
  ale znamená tím **iterace/`maxIterations`**, ne USD
  (`GoalDetailPanel.tsx:26-27,63-100`). Skutečná USD cena goal běhu by musela
  rekurzivně sečíst cenu maker/verifier pipeline i agent běhů napříč všemi
  iteracemi (`GoalIterationSchema`) — širší zásah, samostatný plán, pokud bude
  operátor chtít.
- **Rozpad podle typu tokenu (input/output/cache) se nepersistuje.** `usage`
  objekt z `result` eventu (`input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`) tenhle plán
  nezachytává — jen souhrnnou `total_cost_usd`. Pro "kde se pálí tokeny" je
  cena sama o sobě dost dobrý proxy; pokud by operátor chtěl přesný rozpad
  podle typu tokenu, jde o rozšíření stejného mechanismu (přidat další pole do
  `BaseRun`/schémat) — ne redesign.
- **Přesnost zaokrouhlení pod cent** — `formatCostUsd` navrhuje práh `< $0.01`
  pro cokoliv pod půl centu; potvrdit při implementaci, že to operátorovi dává
  smysl (alternativa: víc desetinných míst u drobných částek, např. `$0.003`).
- **Cenový štítek na `TaskCard`** (seznam běhů) — zahrnuto v Cíl 1, protože
  přesně odpovídá use-case "odhalit, kde se pálí tokeny" bez nutnosti otevírat
  každý běh zvlášť. Pokud se při implementaci ukáže jako vizuálně přeplácané,
  jde snadno vynechat bez dopadu na zbytek plánu (Fáze 1-3 a hlavička v Fázi 4
  fungují samostatně).
