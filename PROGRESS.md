# Loop progress

> Stav autonomního fázového vývoje (LOOP.md). Jedna iterace = jedna fáze.

## Poslední dokončená fáze

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

**N2b — chain primitivum** (funkcionalita, dokončí N2): operátorem autorovaný chain
(explicitní kompozice, žádné implicitní event subscriptions — north-star: "Composition
is the operator's to author"). Completion-driven handoff s artefaktem jako médiem
(Union.ai reactive-workflows vzor): krok N doběhne → jeho artifact record z registru
(N2a) se materializuje jako `consumes` vstup kroku N+1. Contract-first chain entita;
resume po restartu čte artifact record (idempotentní); chybějící/nevalidní artefakt
→ park, ne crash. Reference chain `nightly-research → build-feature`.
