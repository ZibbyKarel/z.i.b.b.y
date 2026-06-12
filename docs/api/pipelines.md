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
```

Tělo `.md` souboru jsou instrukce pro celou pipeline (kontextová nápověda).

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
running → done       (všechny fáze prošly)
        → failed     (fáze selhala a retry/eskalace se vyčerpaly a then.fail chybí)
        → parked     (smyčka se vyčerpala → durable parking pro human review)
```

### Polling logů

```
GET /api/pipelines/:id/runs/:runId              stav runu
GET /api/pipelines/:id/runs/:runId/log?offset=  chunk logu
```

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
