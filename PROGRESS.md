# Loop progress

> Stav autonomního fázového vývoje (LOOP.md). Jedna iterace = jedna fáze.

## Poslední dokončená fáze

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

**N2 — pipeline chaining** (funkcionalita): durable artifact record na disku
(id + kind + path + producing run + timestamp, plain JSON — žádná graph DB;
vzor in-toto/SLSA provenance + Airflow Datasets) + chain primitivum contract-first;
lift existujících `consumes/produces` na run boundary. Reference chain
`nightly-research → build-feature`; chain přežije restart z artifact recordu;
chybějící artefakt parkuje, nepadá.
