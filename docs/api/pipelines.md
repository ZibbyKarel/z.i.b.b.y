# Pipeline orchestrace

## Pipeline — definice

Pipeline je Markdown soubor s YAML frontmatter v `apps/api/data/pipelines/<id>.pipeline.md`.

### Frontmatter pole

```yaml
id: delivery-loop
name: Delivery Loop
desc: "Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor"
phases:
  - id: architekt
    type: agent
    agent: architekt
    model: opus          # přepisuje default model agenta pro tuto fázi
    thinking: high
    produces: spec.md    # handoff soubor pro další fázi

  - id: kodér
    type: agent
    agent: kodér
    consumes: spec.md    # vstup z předchozí fáze
    produces: diff.patch
    loop:
      to: code-review    # zpětná hrana při selhání
      maxRetries: 3
      escalation:
        - rung: 1
          model: sonnet
          thinking: medium
        - rung: 2
          model: opus
          thinking: high

  - id: code-review
    type: agent
    agent: code-reviewer
    consumes: diff.patch
    then:
      pass: tester       # při OK → jdi na tester
      fail: kodér        # při FAIL → zpět na kodér

  - id: tester
    type: verify          # deterministická fáze, žádné tokeny
    commands:
      - pnpm typecheck
      - pnpm test
    then:
      pass: dokumentátor
      fail: kodér

  - id: dokumentátor
    type: agent
    agent: dokumentátor
    produces: docs.md

outputs:                 # co se stane s hotovou prací (delivery sinks)
  - type: pr             # otevře PR z docs.md (gated — „PR je brána")
    from: docs.md
  - type: file           # zapíše review.md do projektu (jede na zibby/* branchi)
    from: review.md
    dest: project
    to: reports/review.md
```

Tělo `.md` souboru jsou instrukce pro celou pipeline (kontextová nápověda).

### Výstupy (`outputs`) — delivery sinks

Co se stane s hotovou prací **nedělá žádný agent** (dřív to byl agent `pr-autor`),
ale je to konfigurace na úrovni pipeline. `outputs` je pole terminálních sinků, které
runner zpracuje po zelené fázové smyčce — deterministicky, vlastněné systémem (žádný
agent, žádný model, žádné tokeny; výstupní obdoba `verify` fáze). Pipeline jich může
mít víc (otevřít PR _a_ zároveň zapsat report). Každý sink čerpá z `from` — relativní
cesty, kterou některá fáze `produces`.

| `type` | Pole | Co dělá |
|--------|------|---------|
| `pr` | `from` | Z `from` (Markdown `# titulek` + tělo) složí PR a otevře ho přes `git push && gh pr create`. **Vždy zaparkuje na schválení** — PR je brána, vynucená strukturálně systémem (Law 3), ne configem agenta. |
| `file` | `from`, `dest`, `to` | Zkopíruje `from` do `to` — do projektového worktree (`dest: project`, jede na `zibby/*` branchi) nebo jako poznámku ve vaultu (`dest: vault`, trvalý druhý mozek pro pipeline, jejichž výsledek je informace, ne kód). |

PR sink zaparkuje aggregate s `parkedReason: "output"` (durable přes restart — fázová
smyčka už doběhla, žádné živé dítě), zapíše `pr-draft.md` + `diffstat.txt` jako
rozhodovací plochu a založí approval `kind: "pipeline-output"` (runId = pipelineRunId).
Schválení → systém spustí gated push a běh doběhne `done`; zamítnutí → práce zůstane na
branchi bez PR (běh je stejně `done`). `file` sinky jsou Tier-1 a běží hned.

**Per-run override.** Když je pipeline cílem directed tasku, který nese vlastní
`output` (dialog Nový task — viz `docs/api/tasks.md`), tato volba **přepíše**
deklarované `outputs:` pro daný běh: uloží se jako `PipelineRun.outputsOverride`
(`void` → `[]`, potlačí i deklarovaný PR) a runner čte `outputsOverride ?? outputs`.
`from` se dopočítá z posledního `produces` pipeline (task žádné `from` nenese).

### CRUD API

```
GET    /api/pipelines           seznam všech pipelines
POST   /api/pipelines           vytvoření pipeline
GET    /api/pipelines/:id       detail pipeline
PUT    /api/pipelines/:id       aktualizace pipeline
DELETE /api/pipelines/:id       smazání pipeline
```

## Spouštění pipeline runu

```
POST /api/pipelines/:id/runs
Body: {
  prompt: string       # popis úlohy pro celou pipeline
  project?: string     # ID projektu
  title?: string
}
```

### Pipeline Run lifecycle

```
running → done       (všechny fáze prošly + výstupy doručeny)
        → failed     (fáze selhala a retry/eskalace se vyčerpaly a then.fail chybí)
        → parked     (smyčka se vyčerpala → durable parking pro human review;
                      nebo `pr` output čeká na schválení brány → parkedReason "output")
```

### Polling logů

```
GET /api/pipelines/:id/runs/:runId              stav runu
GET /api/pipelines/:id/runs/:runId/log?offset=  chunk logu
GET /api/pipelines/runs/:pipelineRunId/stages/:phaseId/logs?offset=
                                                log jedné fáze (po fázích)
```

**Živý log běžící fáze.** Stage se do `stageRuns` zapíše až ve chvíli, kdy dosáhne
terminálního stavu, takže běžící fázi v něm nelze najít. Po dobu jejího běhu ji
runner vystavuje přes `currentStageRunId` (RunnerCore run id právě běžícího dítěte)
a `readStageLog` nejprve zkusí tuhle živou stopu — frontend tak může tailovat log
běžící fáze, jak roste, místo aby ho viděl až po jejím doběhnutí. Při retry to vrací
log _aktuálního_ pokusu, ne staršího terminálního. `currentStageRunId` se vyčistí,
jakmile fáze skončí (log už je dosažitelný ze `stageRuns`).

## PipelineRunnerService

**Soubor:** `apps/api/src/pipelines/pipeline-runner.service.ts` (37.3 KB)

### Fáze: agent

1. Načte handoff soubor (`consumes`) z předchozí fáze (pokud existuje)
2. Sestaví prompt = pipeline prompt + fáze instrukce + obsah handoff souboru
3. Zavolá `RunnerCore.spawn()` pro `pipeline-stage` kind
4. Čeká na ukončení (polling sidecar status)
5. Přečte výstup z `produces` souboru (nebo posledních N řádků logu)
6. Vyhodnotí výsledek (úspěch / neúspěch)

### Fáze: verify

Deterministické příkazy — žádný agent, žádné tokeny, žádné záměry:

1. Spustí každý command z `commands` array (v sekvenci)
2. Exit code 0 = pass, jinak fail
3. Logy příkazů přidávány do pipeline run logu

### Smyčka (loop) a eskalace

```
Fáze selhala + má loop.to
  → počet retry < loop.maxRetries?
      Ano → najdi escalation rung pro aktuální retry count
            přidej failure context do promptu
            znovu spusť fázi s (možná vyšším) model/thinking
      Ne  → PARKED nebo then.fail (pokud existuje)
```

**Escalation ladder** — postupné "rungs":
- rung 1 po prvním selhání: například `sonnet` + `medium`
- rung 2 po druhém selhání: například `opus` + `high`

Rung definice jsou volitelné — pokud chybí, fáze se opakuje se stejným modelem.

### Handoff soubory (consumes / produces)

Soubory sdílené mezi fázemi pipeline runu:
- Uloženy v sandbox adresáři pipeline runu
- `produces: spec.md` → tato fáze zapíše `spec.md`
- `consumes: spec.md` → tato fáze přečte `spec.md` jako vstup

### Parking

Parked stav nastane když:
- smyčka (`loop`) se vyčerpá (`maxRetries` dosaženo) a není `then.fail`
- nebo explicitně v `then: { fail: park }`

Parked pipeline run:
- Je durable (přežije restart API)
- Zobrazí se v UI s možností human review
- Operátor může ručně rozhodnout (resume / abandon)
- `pipeline-parked` event se zapíše do activity logu

## Konzistence po restartu

Stejně jako u agent runů: `PipelineRunnerService` při init kontroluje běžící stage runy
a reconciliuje orphaned `running` → `interrupted`.
