# Loop progress

> Stav autonomního fázového vývoje (LOOP.md). Jedna iterace = jedna fáze.

## Poslední dokončená fáze

**N4b — CI health povrch** — 2026-07-02, commit `feat(monitors): N4b CI health surface …`

- CI zdraví jako STAV (ne událost): `GithubCiMonitor` počítá červená/zelená z celé
  stažené stránky (`sinceAt` = začátek série), watcher přepisuje atribuovaný
  sidecar `status/<integrace>--<adapter>.json`, read-only
  `GET /api/monitors/status`. Briefing: needs-you kind `ci-red` jen dokud je
  červeno (anti alert-fatigue — linka zmizí sama, nikdy re-alert). Web: chip na
  project detailu — tři indikátory (tone + glyph + „CI červené od HH:MM"),
  invalidace na `monitor-alert` SSE + pomalý stavový poll (zotavení do zelena
  nemá event). Suita 2022/0. Detail: `docs/plans/phase-n4b-ci-health.md`.

**N4a — Chains UI** — 2026-07-02, commit `feat(web): chains section …`

- Sekce `/chains` (nav za pipelines): karty → detail route, Run/Delete vpravo
  nahoře, dialog jen create (NewChainDialog: název→slug id, brief, kroky
  v pořadí). Runs panel: status tag, per-krok stav, parkedReason.
- Data layer dle konvencí; chain-runs invalidace na `pipeline-runs` SSE scope
  (poll jen při výpadku). Gotcha: `rtk npx next typegen` tiše nic nevygeneruje —
  nutno `rtk proxy npx next typegen`. NC deflake: rejected-PR test přes
  vi.waitFor. Suita 2010/0. Detail: `docs/plans/phase-n4a-chains-ui.md`.


**N3 — CI/CD monitoring + MonitorAdapter seam** — 2026-07-02, commit `feat(monitors): …`

- `MonitorAdapter` seam (alerty, ne zprávy; `wants()` opt-in; druhý adapter = jen
  `registry.register()` — Sentry-ready, prokázáno testem). GitHub Actions monitor:
  jede na existující github integraci (`streams: ["ci"]`), dedup
  `ci-<repo>-<runId>-<attempt>`, kurzor per (integrace × adapter).
- Červený run → event → activity `monitor-alert` → dispatch vyšetřovacího tasku
  běžným schedulerem (trustedProjectId, guardy, PR brána). Selhaný dispatch →
  event `new`, další tick retry. Heartbeat `monitorTickMs` (+ /settings pole).
- NC vedlejší: chain transitions serializované na frontě + `settle()` (odstraněn
  under-load flake). Suita 2002/0. Detail: `docs/plans/phase-n3-monitor-seam.md`.

**N2b — chain primitivum (uzavírá N2)** — 2026-07-02, commit `feat(chains): …`

- Contract-first `chainsContract` + `chainRunsContract`; `ChainRunnerService` —
  completion-driven advance: done krok → jeho N2a artifact record → obsah (vault
  body / project file) → vstupní handoff dalšího kroku
  (`PipelineRunnerService.start(..., input)` → `<run>/input.md` → `consumes`).
- Park na rozbitý handoff (chybějící/nečitelný/pr-only artefakt); failed krok →
  chain failed; parked krok → chain parked, pozdější done resumuje. Boot
  rekonciliace z registru artefaktů (ztracený run bez artefaktu → park, nehádá).
- Referenční chain `nightly-research → build-feature` prokázán e2e (demo mode).
  Activity kinds chain-*. Suita 1983/0. Detail: `docs/plans/phase-n2b-chain-primitive.md`.

**N2a — durable artifact registry** — 2026-07-01, commit `feat(artifacts): …`

- Contract-first `artifactsContract` (read-only GET /api/artifacts + /:id) +
  `ArtifactRecordSchema` (kind `vault-note`/`project-file`/`pr`, locator, from,
  producedBy, createdAt). `ArtifactsStorageService` — jeden plain-JSON záznam na
  soubor v `ARTIFACTS_DIR`; stabilní id `<runRef>_<kind>_<slug(from)>` (idempotentní
  re-delivery nahrazuje). Delivery sinks runneru zapisují provenance při delivery;
  best-effort (nikdy neshodí delivery), selhaná delivery nezapisuje nic.
- Suita: 1964 passed / 0 failed. Detail: `docs/plans/phase-n2a-artifact-registry.md`.

**N1b — e2e realignment (21 → 0 failures)** — 2026-07-01, commit `test(e2e): …`

- Žádná změna chování; stale testy srovnány na shipped kontrakt: background-first
  `createTask` (201 `pending`, guardy limit/budget/capacity zůstávají synchronní,
  classify+spawn na pozadí → testy pollují task record), integrations si sídlují
  vlastní projekty (projectId FK), delivery seed bez `n-9` (+ `pr-autor`).
- `task-created` (HTTP trace) a `task-dispatched` (vlastní background trace) korelují
  přes `refs.taskId` — traceId se záměrně liší.
- Celá suita zelená: 1949 passed / 0 failed. Detail: `docs/plans/phase-n1b-e2e-realign.md`.

**N1 — DNA alignment (SSE + explicit-target override)** — 2026-07-01 —
`docs/plans/phase-n1.md` (stage-log SSE tail, SSE-gated polls, classifier-bypass test).

## Zaparkováno / známé dluhy

- (nic)

## Další fáze (návrh)

**N4c — UI grammar audit + migrace**: inventura sekcí proti interakčnímu
kontraktu (edit vpravo nahoře, karta → detail, dialogy jen create/confirm, nic
interaktivního bez labelu) metodou design-system auditu (inventory → categorize
→ inconsistencies → fix; research: Nielsen konzistence + DS audit steps).
Výstup: tabulka odchylek v plánu fáze, migrace nejhorších sekcí s
accessible-name asercemi. Pak zbytek N4 odchylek po dávkách, N5 až nakonec.
