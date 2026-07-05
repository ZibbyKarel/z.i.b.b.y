# Chains — pipeline chaining (N2b)

A chain is an **operator-authored composition of pipelines** — the north-star
scenario "research topic X overnight, then build an app from the result". The
operator authors the composition (an explicit entity on disk, no implicit event
subscriptions); the system drives execution: completion-driven, with **the
artifact as the handoff medium** (the N2a registry — see `docs/api/pipelines.md`,
Artifact registry section).

## Definition

One `<id>.json` in `CHAINS_DIR` (default `ZIBBY_DATA_DIR/chains`),
`ChainsStorageService`:

```jsonc
{
  "id": "research-then-build",
  "name": "Research → Build",
  "steps": [{ "pipeline": "nightly-research" }, { "pipeline": "build-feature" }],
  "instructions": "Research topic X…" // input handoff for step 0
}
```

Linear in v1: step N+1 implicitly consumes step N's artifact (a `vault-note` or
`project-file` record keyed by `producedBy.runRef`; a `pr` artifact is a dead
end, not a handoff). Create validates that every step names an existing
pipeline (422).

## Execution (`ChainRunnerService`)

- **Start** (`POST /api/chains/:id/run`): step 0 runs as an ordinary pipeline
  run; `instructions` is written to `<run>/context/input.md` (P1-T3: the shared,
  read-only folder for pipeline-level inputs) and the runner injects it into the
  first stage's `consumes` (the internal `produces` → `consumes` handoff lifted
  to the run boundary — `PipelineRunnerService.start(..., input)`).
- **Advance**: when a step reaches `done`, the runner finds its provenance
  record in the registry, reads its content (a vault note's body / a file in
  the project) and starts the next step with it as input. The last step →
  chain `done`.
- **Park, never crash**: a missing/unreadable/`pr`-only artifact → `parked`
  with a reason. A step in `parked`/`paused-limit` → chain `parked`; a later
  `done` (the operator resumed the run) unparks the chain and it continues. A
  `failed`/`interrupted` step → chain `failed`.
- **Restart**: each chain run is one JSON file in `CHAIN_RUNS_DIR`. Boot
  reconciles from the **artifact registry** (which survives run eviction): a
  record exists → the step finished offline → advance; a run lost with no
  artifact → park (never guesses). A chain is a bounded, operator-started
  sequence (finite steps, no loop), so boot-advance is safe in a place where
  goal `reconstruct()` parks instead (Phase 12.4) — the outer gates remain on
  the pipelines' own outputs: the PR gate itself doesn't change.
- **Audit** (Law 5): `chain-started` / `chain-advanced` / `chain-parked` /
  `chain-finished` in the activity log with `chainRunId`/`chainId` refs.

## HTTP

```
GET    /api/chains               list definitions
POST   /api/chains               create (422 dangling pipeline, 409 duplicate id)
GET    /api/chains/:id           detail
DELETE /api/chains/:id           delete a definition (runs and artifacts untouched)
POST   /api/chains/:id/run       start a run → 201 ChainRun
GET    /api/chains/runs          list runs (newest-first)
GET    /api/chains/runs/:id      a single run
```

Naming a chain = an explicit target — the classifier never participates on this
surface (DNA: explicit target overrides). UI: the `/chains` section (N4a) —
cards → detail, the dialog is create-only, Run/Delete top-right; runs refresh
via the `pipeline-runs` SSE scope (poll only when the stream drops).
