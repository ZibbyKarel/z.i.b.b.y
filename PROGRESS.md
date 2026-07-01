# Loop progress

> Stav autonomního fázového vývoje (LOOP.md). Jedna iterace = jedna fáze.

## Poslední dokončená fáze

**N1 — DNA alignment (SSE + explicit-target override)** — 2026-07-01, commit `feat(n1): …`

- Explicit-target bypass byl už implementovaný end-to-end; dostal pojmenovaný regresní
  test (dispatch s targetem nikdy nevolá classifier; bez targetu klasifikuje).
- SSE audit: živý stage log streamuje (`…/stages/:phaseId/logs/stream` + `useLogTail`),
  approvals/budget pollují jen při výpadku streamu, `approval-*` activity invaliduje
  approvals. Klíče extrahované do `queries/keys.ts` (acyklické runEvents).
- Detail: `docs/plans/phase-n1.md`.

## Zaparkováno / známé dluhy

- **21 pre-existing API e2e failures na HEAD** (ověřeno čistým worktree — nulové regrese
  z N1): stale testy vs. záměrné změny (background-first `createTask` vrací `pending`;
  integrations přesunuté pod projekty → 404 na starých cestách). Soubory: tasks, budget,
  budget-restart, integrations, activity, limit-pause, parallel, pipelines (e2e).
  → NEJBLIŽŠÍ FÁZE: realign e2e na shipped chování (priorita 4 — tvrdě blokuje
  verifikační bránu všech dalších fází).

## Další fáze (návrh)

1. **E2E realignment** (bug fix) — viz výše.
2. **N2 — pipeline chaining** (funkcionalita): durable artifact record na disku
   (path + kind + producing run) + chain primitivum contract-first; vzor = Airflow
   Datasets / Union.ai artifacts (data-aware trigger nad artefaktem), lift existujících
   `consumes/produces` na run boundary. Reference chain `nightly-research → build-feature`.
