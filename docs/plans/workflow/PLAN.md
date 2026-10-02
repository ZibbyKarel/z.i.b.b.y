# Workflow — sub-runs, signal automations, pipeline → workflow rename

Operator decisions (2026-10-02):

1. A sub-run shares the parent's spend cap (its spend counts toward the parent).
2. A parked sub-run makes the parent wait; the parent continues once the child resolves.
3. Chains / handoff rules are removed; automations take over signal-triggered work.
4. "Pipeline" is renamed to "Workflow" everywhere — UI, API, code, data on disk.
5. Human review after any step stays `approval: ask` on the phase (already exists).

Order: A → B → C. C (rename) goes last so the new features land and are tested before
the mechanical churn. Everything is committed straight to `main` (no PRs).

## A. Sub-workflow phase (`type: pipeline`, renamed in C)

- Contract: phase type `pipeline` with `pipeline: <id>`, required `consumes` + `produces`;
  forbids `agent`/`model`/`thinking`/`commands`; cannot reference itself.
- Run aggregate: `parentRunId?` on the child, `childRunId?` on the parent's `StageRun`,
  new `parkedReason: "child"` (durable).
- Runner (`drive()`): a `pipeline` phase starts the child via `start()` with the
  parent's workspace, the handoff file content as `input`, no `taskId`, and a budget of
  the parent's remaining cap. The parent waits on `onRunStatus`:
  - child `done` → its latest produced file is copied to `<stage>/<produces>`, the
    child's total spend is the stage's cost, the parent continues;
  - child `parked` → parent `parked` (`child`); resumes when the child resumes;
  - child `failed`/`interrupted` → the stage fails (normal loop/park/fail rules).
- Cycle guard: an ancestor chain check plus a max depth of 3.
- Restart: a parent parked on `child` survives while the child is durable; a child that
  is failed on boot fails the stage.
- Stop on the parent stops the child. Child runs are hidden from run lists and shown
  nested under the parent's stage.
- Web: editor palette gets a "workflow" step (pick the child), the timeline links to the
  child run.

## B. Signals → automations, chains removed

- Automation trigger `signal { from?, kind, minSeverity? }`; optional
  `approval: "ask"` on the automation (Tier 3: an approval before dispatch).
- `SignalBus` in automations: `emit(signal) → { runRefs }`; per-(automation,
  fingerprint) dedupe store; the signal title/body is appended to the dispatched prompt.
- Emitters (security, arch, post-merge-watch, rnd artifacts) call the bus instead of
  `HandoffService`.
- The 4 system handoff rules become 4 system automations.
- Removed: handoff + chains contracts, API module, web features (chains, handoff,
  signals registry), the chain task target, `defaultChainId`, docs/tests. Old enum
  values on disk (`source: "chain"|"handoff"`, activity `handoff`) still parse.

## C. Rename pipeline → workflow

- Codemod with explicit exclusions (CI/CD prose, `.claude/**`, `pnpm-lock.yaml`,
  roadmap imports, `.github/workflows`, GitHub monitor's `WorkflowRun`, the CLI
  `Workflow` tool name in the reply-draft deny-list).
- Data: `.zibby/data/pipelines/` → `.zibby/data/workflows/`, `*.pipeline.md` →
  `*.workflow.md`; a one-shot `tools/migrate/workflow-rename.mjs` rewrites persisted
  JSON (run aggregates, stage records, tasks, approvals, activity, ledger, automations,
  goals, activity-view); a boot backfill moves a stray old dir.
- Env vars keep reading the old names as a fallback.
