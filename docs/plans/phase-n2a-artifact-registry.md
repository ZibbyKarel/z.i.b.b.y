# Phase N2a — durable artifact registry (first half of N2 pipeline chaining)

> ROADMAP N2 gap: "no durable artifact registry across runs". This phase builds the
> registry; the chain primitive that CONSUMES it is N2b. Split deliberately — small
> completable phases over one big diff.

## Design (research-backed: in-toto/SLSA provenance records, Airflow Datasets)

A plain-JSON **provenance record per durable output**, written at delivery time by the
pipeline delivery sinks. Files are the source of truth — one record per file in
`ARTIFACTS_DIR` (default `dataDir("artifacts")`), no graph DB.

```jsonc
{
  "id": "delivery_1782..._research-report",   // <runRef>_<slug(from)> — unique per run+artifact
  "kind": "vault-note" | "project-file" | "pr",
  "locator": "research/topic-x" | "docs/report.md" | "https://github.com/.../pull/42",
  "from": "research-report.md",               // the phase handoff name it came from
  "producedBy": { "runRef": "delivery_1782...", "pipelineId": "delivery", "taskId": "task_...", "projectId": "acme" },
  "createdAt": "2026-07-01T..."
}
```

## Build

1. **Contract-first** — `libs/contracts/src/artifacts/`:
   - `artifact.schema.ts`: `ArtifactRecordSchema` (+ kind enum, producedBy).
   - `artifacts.contract.ts`: `GET /api/artifacts` (optional `?projectId=&pipelineId=`),
     `GET /api/artifacts/:id`. Registered in `app.contract.ts` + `index.ts`.
2. **API** — `apps/api/src/artifacts/`:
   - `ArtifactsStorageService`: `record()` (idempotent by id — re-delivery replaces),
     `list()` (newest-first, optional filters), `get()`. `ARTIFACTS_DIR` env override,
     `dataDir("artifacts")` fallback (test isolation rides `ZIBBY_DATA_DIR`).
   - `ArtifactsController` (ts-rest), `ArtifactsModule` (exports the storage).
3. **Recording seams** (fire-and-forget — a registry write NEVER fails a delivery):
   - `deliverFileOutput` → on success record `vault-note` / `project-file`.
   - `openPrOutput` → on success record `pr` with the PR URL.
4. **Docs**: this plan + ROADMAP note (N2 split a/b).

## Tests (definition of done)

- [ ] contracts: `ArtifactRecordSchema` round-trip + rejects bad kind (contract test).
- [ ] api `artifacts.storage.service.test.ts`: record → list/get; replace on same id;
      filter by projectId/pipelineId; corrupt file skipped, listing survives.
- [ ] api pipeline-runner outputs tests: a delivered vault output records a
      `vault-note` artifact; a project file output records `project-file`; an opened
      PR records `pr`; a FAILED delivery records nothing.
- [ ] api e2e (artifacts endpoint): list + get over HTTP (extend an existing suite or
      minimal new one).

## Out of scope (→ N2b)

- The chain primitive (downstream input binding, park-on-missing-artifact, restart
  resume, reference chain `nightly-research → build-feature`).
- Chain-authoring UI (N4 surface).
