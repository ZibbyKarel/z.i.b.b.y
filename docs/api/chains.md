# Chains — řetězení pipeline (N2b)

Chain je **operátorem autorovaná kompozice pipeline** — north-star scénář „přes noc
prozkoumej téma X, pak z výsledku postav aplikaci". Kompozici autoruje operátor
(explicitní entita na disku, žádné implicitní event subscriptions); exekuci řídí
systém: completion-driven, s **artefaktem jako médiem předání** (registr N2a —
`docs/api/pipelines.md`, sekce Registr artefaktů).

## Definice

Jeden `<id>.json` v `CHAINS_DIR` (default `ZIBBY_DATA_DIR/chains`),
`ChainsStorageService`:

```jsonc
{
  "id": "research-then-build",
  "name": "Research → Build",
  "steps": [{ "pipeline": "nightly-research" }, { "pipeline": "build-feature" }],
  "instructions": "Prozkoumej téma X…" // vstupní handoff kroku 0
}
```

Lineární v1: krok N+1 implicitně konzumuje artefakt kroku N (`vault-note` nebo
`project-file` záznam podle `producedBy.runRef`; `pr` je brána, ne handoff).
Create validuje, že každý krok jmenuje existující pipeline (422).

## Běh (`ChainRunnerService`)

- **Start** (`POST /api/chains/:id/run`): krok 0 běží jako běžný pipeline run;
  `instructions` se zapíší do `<run>/input.md` a runner je vloží do `consumes`
  první fáze (interní `produces` → `consumes` zvednuté na hranici runu —
  `PipelineRunnerService.start(..., input)`).
- **Advance**: krok doběhne `done` → runner najde jeho provenance záznam v registru,
  přečte obsah (tělo vault poznámky / soubor v projektu) a spustí další krok s ním
  jako vstupem. Poslední krok → chain `done`.
- **Park, nikdy crash**: chybějící/nečitelný/`pr`-only artefakt → `parked`
  s důvodem. Krok `parked`/`paused-limit` → chain `parked`; pozdější `done`
  (operátor run resumoval) chain odparkuje a pokračuje. `failed`/`interrupted`
  krok → chain `failed`.
- **Restart**: každý chain run je jeden JSON v `CHAIN_RUNS_DIR`. Boot rekonciliuje
  z **registru artefaktů** (přežije evikci runu): záznam existuje → krok doběhl
  offline → advance; run ztracený bez artefaktu → park (nikdy nehádá). Chain je
  ohraničená, operátorem startovaná sekvence (konečné kroky, žádná smyčka), takže
  boot-advance je bezpečný tam, kde goal reconstruct() parkuje (Phase 12.4 —
  vnější brány zůstávají na outputech pipeline samotných: PR gate se nemění).
- **Audit** (Law 5): `chain-started` / `chain-advanced` / `chain-parked` /
  `chain-finished` v activity logu s refs `chainRunId`/`chainId`.

## HTTP

```
GET    /api/chains               seznam definic
POST   /api/chains               vytvoření (422 dangling pipeline, 409 duplicitní id)
GET    /api/chains/:id           detail
DELETE /api/chains/:id           smazání definice (runy a artefakty nedotčené)
POST   /api/chains/:id/run       start běhu → 201 ChainRun
GET    /api/chains/runs          seznam běhů (newest-first)
GET    /api/chains/runs/:id      jeden běh
```

Pojmenování chainu = explicitní cíl — classifier se na této ploše nikde neúčastní
(DNA: explicit target overrides). UI: sekce `/chains` (N4a) — karty → detail,
dialog jen pro create, Run/Delete vpravo nahoře; běhy se osvěžují přes
`pipeline-runs` SSE scope (poll jen při výpadku streamu).
