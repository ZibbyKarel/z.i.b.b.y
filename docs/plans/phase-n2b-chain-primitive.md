# Phase N2b — chain primitive (completes ROADMAP N2 pipeline chaining)

> Consumes the N2a artifact registry. Operator-authored, completion-driven, linear:
> step N's pipeline finishes → its durable artifact record becomes step N+1's input
> handoff. "Composition is the operator's to author" (north-star) — chains are
> explicit entities, never implicit event subscriptions.

## Design decisions

- **Linear v1.** `steps: [{ pipeline }]` — step N+1 implicitly binds to step N's
  delivered artifact (`vault-note` or `project-file` record by `producedBy.runRef`).
  Explicit per-step bindings can come later without breaking the schema.
- **Completion-driven advance.** The chain runner subscribes to
  `PipelineRunnerService.onRunStatus`; a step run reaching `done` advances the chain,
  `failed` fails it, `parked` parks it (and a later un-park + `done` resumes it).
- **Artifact as the medium.** Advance resolves the step's artifact record from the
  registry, reads its content (vault note body / project file), and starts the next
  pipeline with it as the initial handoff (`input.md` → first phase's `consumes`).
- **Park, never crash.** Missing/unreadable/unsupported (`pr`) artifact → chain
  `parked` with a reason. Restart: chain runs persist as JSON; boot reconciles from
  the artifact record (the registry survives run eviction) and continues. A chain is
  a BOUNDED operator-started sequence (finite steps, no loop), so boot-advance is
  safe where a goal's unbounded reconstruct() had to park (Phase 12.4 posture kept).
- **Input seam, not new machinery.** `PipelineRunnerService.start` gains optional
  `input` content — written to `<run>/input.md` and threaded as the initial
  `handoffSource`, so `placeHandoff` copies it into the first stage's `consumes`
  exactly like any inner-pipeline handoff (consumes/produces lifted to run boundary).

## Build

1. Contract-first `libs/contracts/src/chains/`: `ChainSchema` (id, name?, desc?,
   steps min 1), `ChainRunSchema` (chainRunId, chainId, status
   running|parked|done|failed, currentStep, steps[{index, pipeline, runRef?,
   artifactId?, status}], startedAt, parkedReason?); `chainsContract` (CRUD minus
   update) + `chainRunsContract` (start, list, get). Registered in app contract.
2. API `apps/api/src/chains/`: `ChainsStorageService` (EntityFileStore JSON,
   `CHAINS_DIR`), `ChainRunnerService` (`CHAIN_RUNS_DIR`; in-memory map + JSON
   persistence; subscribe/advance/park/reconcile), controllers (runs controller
   declared first — same route-order trick as pipelines), module wiring.
3. Runner seam: `start(..., input?)` + initial handoff threading.
4. Create-time validation: every step's pipeline must exist (422).
5. Docs: `docs/api/pipelines.md` chain section (or new `docs/api/chains.md`).

## Tests (definition of done)

- [ ] contracts: chain + chain-run schema validation; read-only run surface.
- [ ] api `chains.storage.service.test.ts`: CRUD + corrupt tolerance.
- [ ] api `chain-runner.service.test.ts` (doubles): done step + artifact → next
      pipeline started with the artifact content as input; missing artifact → park;
      failed step → chain failed; parked step → chain parked, later done → resumes;
      last step done → chain done; boot reconcile advances a chain whose step
      finished while the API was down.
- [ ] api `pipeline-runner` test: `start` with `input` seeds the first stage's
      `consumes` file.
- [ ] api e2e `chains.e2e.test.ts`: the REFERENCE CHAIN — `nightly-research →
      build-feature` in demo mode: research delivers a vault-note artifact, the
      chain hands it to build-feature's first phase, chain lands `done`.

## Out of scope

- Chain-authoring UI (N4 surface) — API-first here.
- A `chain` TaskTarget kind / classifier routing (naming a chain is already an
  explicit start via its endpoint; dispatch integration can follow with N4).
- Fan-out/join (non-linear) chains.
