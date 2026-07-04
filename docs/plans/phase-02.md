# Plán: Preview výstupu běhu + navázání nového úkolu na výstup

> Motivace: na `/runs` u úspěšně dokončeného běhu (`RunDetail`) chci (1) tlačítko,
> které otevře New Task dialog s výstupem běhu předvyplněným jako kontext nového
> úkolu, a (2) možnost prohlédnout si samotný vyprodukovaný `.md` výstup na místě
> (jednoduchý preview, ne otevírání souboru mimo appku). Průzkum ukázal, že **obě
> věci už z větší části existují** — jen jsou nekompletní pro jeden konkrétní a
> běžný případ: pipeline s `file` výstupem (typicky vlastní pipeliny jako
> `code-audit`, které nekončí PR, ale zprávou uloženou do vaultu/projektu). Tento
> plán tu díru zacelí a sjednotí zobrazení napříč `agent`/`orchestrator` a
> `pipeline` běhy.

---

## Zjištění (současný stav, ověřeno v kódu)

- **"Continue in a new task" už existuje** jako celá funkce: `NewTaskDialog`
  (`apps/web/features/tasks/components/NewTaskDialog.tsx:45-50`) přijímá
  `initialContext`, zobrazí ho přes `TaskContextPanel` a při submitu ho vloží do
  `composedText` (řádky 126-133). `TaskContext.tsx` (`useNewTask().open(text,
  target, context)`) tohle už umí obecně, ne jen pro runy.
- **Tlačítko na `/runs` už existuje**: `RunOutputPanel` v
  `apps/web/features/runs/components/RunDetail.tsx:133-211` renderuje pro
  `run.status === "done"` buď panel s "Otevřít výstup" (PR) + "Pokračovat v
  novém úkolu" (`data-testid="continue-task"`, řádek 162-172), voláním
  `openNewTask(undefined, undefined, context)`.
- **Problém #1 — pipeline s `file` výstupem nemá vůbec žádný panel.**
  `RunOutputPanel` (řádky 137-150) detekuje pipeline výstup takto:
  ```
  const pipelineDone = run.status === "done" && run.kind === "pipeline";
  const { data: prDraft } = useRunArtifactQuery(run.runId, "pr-draft.md", pipelineDone);
  const pipelineOutput = pipelineDone && !!prDraft?.content;
  ```
  Jméno artefaktu je **natvrdo `"pr-draft.md"`** — soubor, který se zapisuje
  jen když `pipeline.outputs[]`/`taskOutput` je typu `"pr"`
  (`pipeline-runner.service.ts:968-971`, `parkOnPrOutput`/`openPrOutput`). Když
  úkol zvolí `file` výstup, běží místo toho `deliverFileOutput`
  (`pipeline-runner.service.ts:972`, `1026-1090`), které `pr-draft.md`
  **nikdy nezapíše**. Dotaz na `pr-draft.md` tedy vždy vrátí 404 → `pipelineOutput
  = false` → celý `RunOutputPanel` skončí na `if (!agentOutput && !pipelineOutput)
  return null;` (řádek 150) a nezobrazí se vůbec nic. Přesně tenhle případ je
  `.zibby/data/pipelines/code-audit.pipeline.md` spuštěná s výstupem do
  vaultu/projektu (žádná `outputs:` v definici → jede jen přes úkolem zvolený
  `TaskOutput`).
- **Vedlejší nález — bug v aktuálním fallbacku.** Protože `taskOutcomeSummary`/
  `taskOutputKind` se obohacují ze `ScheduledTask` úplně stejně pro pipeline i
  agent běhy (`enrichRunWithTask`, `task-runs.service.ts:337-350`), a pro
  pipeline běh je `taskOutcomeSummary` jen generický řetězec typu
  `"5 stages, done"` (`writePipelineOutcome`, `task-scheduler.service.ts:1013-1019`,
  žádný skutečný obsah), tak když `pipelineOutput` vyjde `false` a
  `taskOutputKind` je `"pr"` nebo `"file"`, spadne se dnes do větve
  `agentOutput` (řádek 138-141 nekontroluje `run.kind`) a zobrazí se
  zavádějící panel s tlačítkem "Pokračovat", které do nového úkolu nacpe
  nesmyslný kontext `"Výstup: 5 stages, done"`. Tohle je potřeba opravit
  zároveň (pipeline běh nemá do "agent-shaped" větve padat nikdy — jeho
  jediný smysluplný výstup je artefakt, ne `taskOutcomeSummary`).
- **Artefakty pipeline běhu přežívají dokončení runu** — `readArtifact`
  (`pipeline-runner.service.ts:683-711`) čte přímo ze složky běhu na disku
  (`run.cwd` + fázové podsložky), ne z in-memory registru; komentář na řádku
  641-644 potvrzuje, že běh po `RETENTION_MS` zmizí z registru, ale
  agregát + soubory na disku zůstávají. Čtení funguje i po dokončení běhu —
  proto `RunPrGatePanel` (`components/RunPrGatePanel.tsx`) může sloužit i jako
  "produced output" panel na hotovém běhu, ne jen na PR bráně.
- **Allowlist je ale natvrdo daný globální enum**, ne odvozený z konkrétní
  pipeliny: `PIPELINE_RUN_ARTIFACTS` (`libs/contracts/src/pipelines/
  pipelines.contract.ts:12-23`) obsahuje jen jména z delivery-loop pipeliny
  (`pr-draft.md`, `diffstat.txt`, `plan.md`, `implementation.md`, `review.md`,
  `docs.md`, `learned.md`). Libovolná jiná pipelina (např. `code-audit` s
  `produces: audit-report.md`) na tenhle seznam nikdy netrefí — `readArtifact`
  (řádek 687) rovnou vrátí `null`, i kdyby se jméno artefaktu na frontendu
  opravilo.
- **Jméno skutečně doručeného souboru už ale pipeline runner zná a persistuje
  ho**: `run.outputsOverride` (`PipelineRunSchema`, `pipeline-run.schema.ts:162`,
  typ `PipelineOutputSchema` z `pipeline.schema.ts:91-110`) se zapisuje při
  `start()` (`pipeline-runner.service.ts:262`,
  `this.toOutputsOverride(taskOutput, pipeline)`) a pro `file` výstup má tvar
  `{ type: "file", from, dest, to }` (`toOutputsOverride`, řádky 989-994) — `from`
  je přesně jméno artefaktu (`phase.produces` poslední produkující fáze, nebo
  `"result.md"` fallback), který `deliverFileOutput` čte a doručuje
  (`resolveOutputSource`, řádky 997-1005). Tahle hodnota na `PipelineRun` už
  existuje, jen se nikam neposílá na web.
- **Agent/orchestrator `file` výstup nepotřebuje nový backend endpoint** —
  `TaskOutputService.deliverFile` (`apps/api/src/tasks/task-output.service.ts:
  87-131`) zapisuje do vaultu/projektu přesně `summary.trim()` (řádek 96), a
  `summary` je tentýž parametr, který `writeAgentOutcome`
  (`task-scheduler.service.ts:973-1011`) zapisuje jako `task.outcome.summary`.
  `run.taskOutcomeSummary` je tedy **bajtově totéž**, co bylo doručeno do
  souboru — pro agent/orchestrator běhy žádný nový fetch není potřeba, jen
  hezčí zobrazení (viz Fáze 3).
- **Goal běhy nemají `TaskOutput` vůbec** — `goal-runner.service.ts` nikde
  nevolá `TaskOutputService`/nemá `pr`/`file` sink, `writeGoalOutcome`
  (`task-scheduler.service.ts:1045-`) píše jen generický souhrn iterací.
  `NewTaskDialog` navíc `TaskOutputField` schovává pro loop úkoly
  (`{!isLoop && <TaskOutputField .../>}`, `NewTaskDialog.tsx:281-290`). Goal
  běhy jsou tedy mimo scope tohoto plánu (nemají co previewovat).
- **Případ "pipeline bez `taskOutput` override, s vlastním `outputs:` v
  definici"** (`run.outputsOverride` je `undefined`, doručuje se přes
  `pipeline.outputs` default) zůstává mimo scope — `pipelineRunToView`
  (`task-runs.service.ts:271-303`) dostává jen `PipelineRun`, ne definici
  `Pipeline`, takže by vyžadovalo extra načtení pipeline definice jen kvůli
  téhle větvi. V praxi se výstup dnes vždy volí v New Task dialogu
  (`TaskOutputField`), takže `outputsOverride` je vždy nastavený, když operátor
  něco zvolil — viz Otevřené otázky.

---

## Cíl

1. Úspěšně dokončený **pipeline běh s `file` výstupem** dostane stejný panel
   jako dnes PR výstup: preview obsahu + tlačítko "Pokračovat v novém úkolu"
   s výstupem předvyplněným jako kontext.
2. Sjednotit zobrazení: agent/orchestrator i pipeline výstup se ukazuje ve
   stejném vizuálním tvaru (`CodeBlock` se scrollem), ne jako holý odstavec
   textu u agenta a `CodeBlock` u pipeliny.
3. Opravit vedlejší bug: pipeline běh s výstupem, který se nepodařilo najít
   (chybějící/nedoručený artefakt), nesmí spadnout do "agent-shaped" větve a
   nabídnout pokračování s nesmyslným textem `"N stages, done"`.
4. Beze změny: umístění (detail vybraného běhu na `/runs`, ne řádek v seznamu),
   PR-výstupová cesta (`RunPrGatePanel`), goal běhy, atributy `output/`
   restrukturalizace z `docs/plans/pipeline-run-restrukturalizace.md` (samostatný,
   neimplementovaný plán — tenhle plán na něm nestaví ani ho nenahrazuje).

---

## Fáze 1 — Backend: zpřístupnit jméno doručeného artefaktu

- [x] V `libs/contracts/src/tasks/task-run.schema.ts` přidat do `TaskRunSchema`
      nové optional pole `outputArtifactName: z.string().optional()` — "Enriched
      z pipeline runu: jméno artefaktu doručeného jako `file` výstup (viz
      `PipelineOutput`), pro frontend preview." Umístit vedle `taskOutputKind`.
- [x] V `apps/api/src/tasks/task-runs.service.ts`, `pipelineRunToView(r)`
      (řádky 271-303): dopočítat
      `const fileOutput = r.outputsOverride?.find((o) => o.type === "file");`
      a přidat do vraceného objektu `outputArtifactName: fileOutput?.from`.
- [x] V `apps/api/src/pipelines/pipeline-runner.service.ts`, `readArtifact()`
      (řádky 683-711): přehodit pořadí — nejdřív načíst `run`, pak teprve
      kontrolovat allowlist, aby šlo povolit i jméno mimo globální
      `PIPELINE_RUN_ARTIFACTS`:
      ```
      const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId));
      const fileOutputName = run?.outputsOverride?.find((o) => o.type === "file")?.from;
      const isAllowed =
        (PIPELINE_RUN_ARTIFACTS as readonly string[]).includes(name) || name === fileOutputName;
      if (!isAllowed) return null;
      ```
      Zbytek funkce (traversal guard přes `resolveInside`, hledání v
      `root`/fázových složkách) zůstává beze změny — `fileOutputName` je vždy
      jméno, které runner sám dopočítal z `phase.produces`, nikdy vstup z
      requestu.
- [x] Rozšířit `PipelineRunArtifactSchema.name` (`libs/contracts/src/pipelines/
      pipelines.contract.ts:26-30`) z `z.enum(PIPELINE_RUN_ARTIFACTS)` na
      `z.string()` — jméno teď může být i mimo pevný seznam. Ověřit, že
      `readArtifact`'s návratový typ `Promise<{ name: PipelineRunArtifact["name"]; ... }>`
      po téhle změně dál typuje (stane se `string`, žádná další úprava by
      neměla být potřeba) a že se nikde jinde nepattern-matchuje na konkrétní
      literály `PipelineRunArtifact["name"]` (zkontrolovat greppem před
      commitem: `grep -rn "PipelineRunArtifact\[" apps/`).
- [x] `pnpm typecheck` — ověřit, že úprava schématu nerozbije žádné jiné
      místo, které dnes spoléhá na uzavřený enum.

## Fáze 2 — Frontend: `RunOutputPanel` — preview + continue pro pipeline `file` výstup

- [x] V `apps/web/features/runs/components/RunDetail.tsx` upravit
      `RunOutputPanel` (řádky 133-211):
  - Přidat druhý dotaz vedle stávajícího `prDraft`:
    ```
    const { data: fileArtifact } = useRunArtifactQuery(
      run.runId,
      run.outputArtifactName ?? "",
      pipelineDone && !!run.outputArtifactName,
    );
    ```
  - `pipelineOutput` rozšířit na `pipelineDone && !!(prDraft?.content || fileArtifact?.content)`.
  - `agentOutput` gate doplnit o `&& run.kind !== "pipeline"` — pipeline běh se
    už NIKDY nezobrazuje přes "agent-shaped" větev (opravuje vedlejší bug ze
    Zjištění).
  - V renderu: když je `pipelineOutput` true a je to `fileArtifact` (ne
    `prDraft`), nerenderovat `RunPrGatePanel` (ten je specifický pro PR —
    ukazuje i diffstat, který u `file` výstupu nedává smysl), ale nový lehký
    blok se stejnou kostrou jako dnešní PR větev:
    ```tsx
    if (fileArtifact?.content) {
      return (
        <HudPanel padding="250" title={t("producedOutputTitle")}>
          <Stack gap="200">
            <CodeBlock maxHeight="md" text={fileArtifact.content} />
            <Stack align="center" direction="row" gap="100">{continueButton}</Stack>
          </Stack>
        </HudPanel>
      );
    }
    ```
    (import `CodeBlock` z `@zibby/design-system`, už se v souboru nepoužívá,
    přidat do stávajícího importu na řádku 3-15.)
  - `rawOutput`/`output`/`context` (řádky 152-160, feed pro `continueButton`)
    přepočítat tak, aby pro tuhle větev braly `fileArtifact.content` místo
    `prDraft?.content` (dnes bere `prDraft?.content` natvrdo pro "pipelineOutput"
    případ — potřeba rozlišit, který ze dvou artefaktů skutečně přišel).
- [x] `pnpm typecheck && pnpm lint`.

## Fáze 3 — Frontend: sjednotit preview i pro agent/orchestrator výstup

- [x] Ve stejné komponentě (agent-shaped větev, řádky 186-210): nahradit
      `<Typography size="sm" type="text" variant="secondary">{summary}</Typography>`
      za `<CodeBlock maxHeight="md" text={summary ?? ""} />`, aby dlouhý
      výstup (agentův wrap-up text doručený do vaultu/projektu jako `file`
      výstup) měl stejné scrollované "jednoduché preview" jako pipeline
      výstup, místo neomezeně rostoucího odstavce.
  - Zachovat "Otevřít výstup" tlačítko (PR case, `firstUrl(summary)`) beze
    změny — jede dál nad/vedle `CodeBlock`.
- [x] `pnpm typecheck && pnpm lint`.

## Fáze 4 — Testy

- [x] `apps/web/features/runs/components/RunDetail.test.tsx`: rozšířit mock
      `useRunArtifactQuery` (řádky 24-28) tak, aby uměl vracet obsah i pro
      libovolné jiné jméno než `"pr-draft.md"` (test bude parametrizovat jméno
      přes `run.outputArtifactName`).
  - Nový test: pipeline běh se `status: "done"`, `taskOutputKind: "file"`,
    `outputArtifactName: "audit-report.md"` → očekávat `CodeBlock` s obsahem
    a `data-testid="continue-task"` tlačítko; kliknutí na něj zavolá
    `openNewTask` s kontextem obsahujícím obsah artefaktu (ne
    `taskOutcomeSummary`).
  - Nový test: stejný běh, ale `useRunArtifactQuery` vrátí `undefined`
    (artefakt zmizel/nenalezen) → `RunOutputPanel` nesmí renderovat nic (ne
    fallback s `"N stages, done"`) — ověřuje opravu vedlejšího bugu z Fáze 2.
  - Upravit/doplnit test agent-shaped větve tak, aby ověřil `CodeBlock`
    (ne `Typography`) jako nositele `summary` textu.
- [x] `apps/api/src/pipelines/pipeline-runner.service.test.ts` (nebo
      `pipeline-runner.outputs.test.ts`, podle toho, kde dnes žijí testy na
      `deliverFileOutput`/`readArtifact`): nový test — pipeline s `file`
      výstupem a `from` mimo `PIPELINE_RUN_ARTIFACTS` (např. vlastní
      `produces: "custom-report.md"`) → `readArtifact(runId, "custom-report.md")`
      vrátí obsah; `readArtifact(runId, "nejaky-jiny-nazev.md")` (mimo allowlist
      i mimo `outputsOverride`) dál vrací `null`.
- [x] `apps/api/src/tasks/task-runs.service.test.ts` (pokud existuje pro
      `pipelineRunToView`) nebo nejbližší existující test na
      `getTaskRun`/`listTaskRuns` pro pipeline: ověřit, že `outputArtifactName`
      se objeví na `TaskRun` právě a jen když `run.outputsOverride` obsahuje
      `type: "file"` položku.
- [x] `pnpm test` (celá suita) a `pnpm typecheck`.
- [ ] Manuální smoke test: spustit `code-audit` pipeline (nebo jinou
      nedelivery-loop pipelinu) přes New Task dialog s výstupem `file` →
      `dest: vault`, počkat na dokončení, otevřít běh na `/runs`, ověřit že se
      zobrazí preview zprávy a "Pokračovat v novém úkolu" otevře dialog s
      touhle zprávou v kontextu.
  - _Pozn. (2026-07-04): odloženo na operátora — vyžaduje reálný `claude` běh; chování kryjí web testy (RunDetail.test.tsx: file-artifact preview, continue-context z artefaktu, žádný "N stages, done" fallback)._

---

## Otevřené otázky (rozhodnout před/během implementace)

- **Pipeline bez task-side output override, s vlastním `outputs:` v definici**
  (viz Zjištění, poslední bod) — dnešní plán ho nepokrývá (`outputArtifactName`
  vyjde `undefined`). Pokud operátor v praxi definuje pipeliny s natvrdo
  zapsaným `outputs: [{ type: file, ... }]` (ne přes dialog), bude potřeba
  buď (a) `pipelineRunToView` doplnit o načtení `Pipeline` definice
  (async, mění signaturu/volající kód), nebo (b) při `start()` vždy
  materializovat efektivní `outputsOverride` na `run` i když pochází z
  `pipeline.outputs` (jednodušší — jedno místo zápisu, `pipelineRunToView`
  zůstává synchronní). Doporučení: (b), pokud se ukáže potřeba.
- **`CodeBlock` vs. plnohodnotný markdown renderer** — `.md` výstupy se dnes
  všude na `/runs` (PR draft, diffstat) zobrazují jako prostý text v
  `CodeBlock`, ne renderované (na rozdíl od `/memory` note vieweru z fáze 34,
  který používá `@uiw/react-md-editor`). Tenhle plán drží konzistenci se
  stávajícím `RunPrGatePanel` vzorem ("jednoduché", jak žádal operátor) —
  pokud by časem bylo žádoucí skutečné markdown rendrování i tady, je to
  samostatná, oddělená změna (dotkla by se `RunPrGatePanel` i téhle nové
  větve stejně).
- **`PipelineRunArtifactSchema.name` na `z.string()`** — potvrdit greppem
  před implementací, že žádný current caller nespoléhá na uzavřený literál
  union (typescript `switch`/exhaustiveness check na `.name`). Pokud ano,
  zvážit místo širšího `z.string()` přidat konkrétní `from` hodnotu do
  existujícího enumu dynamicky není možné (enum je compile-time) — pak by
  bylo nutné řešit typovou stránku jinak (branded type / union rozšíření).
