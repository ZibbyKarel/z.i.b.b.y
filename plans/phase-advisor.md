# Phase advisor (`ask_advisor`)

## Why

In run `delivery_1794393281945` (CZ3TDR1-769, cms4 PR #47977) the koder skipped a plan
step. It wrote `schema.ts` by hand instead of running the generator, then claimed it
"matches the generator output". Review passed it and CI went red. An agent that wants to
deviate from the plan needs someone to ask. That should be a stronger model with the
planner's context, not the operator: the operator should only be asked about scope or
acceptance-criteria decisions.

`ask_operator` already exists, but it interrupts the operator for every question. Today
`ZIBBY_STATUS: blocked` marks the run `failed`, and `resumeParked()` cannot resume a failed
run. The advisor is the rung between those two.

## Escalation ladder (agent side)

1. **Decide alone.** Mechanical adjustments that don't change the outcome (a different
   path, an extra flag). Record them in the handoff.
2. **`ask_advisor`.** Any deviation that changes the outcome: different files, different
   behaviour, a skipped check, a generator not run.
3. **`ask_operator`.** Only when the advisor replies that the decision changes scope or
   acceptance criteria, or when no advisor is configured.

## Configuration

`advisor` can be set on the workflow and on a phase. The phase value overrides the
workflow default field by field. `advisor: false` on a phase turns it off.

```yaml
advisor:            # workflow-level default
  model: opus
  thinking: high
  maxCalls: 3
phases:
  - id: koder
    advisor:
      model: opus     # optional override
      from: architekt # optional; default below
```

- `model`, `thinking`: the model the advisor runs on.
- `from`: the phase whose claude session the advisor resumes. **Default: the phase that
  produced the handoff this phase consumes.** For example the koder consumes `plan.md`, so
  it gets the architekt. On a loop retry, where the koder consumes a review's
  `review.failure.txt`, it gets the review phase. If that phase has no captured session,
  fall back to a fresh session.
- `maxCalls`: a per-phase-run cap. Once it is reached, the tool tells the agent to use
  `ask_operator`.

## Mechanics

- **Tool.** `ask_advisor({ question })` on the existing `zibby-run` MCP server
  (`apps/api/src/runner/run-mcp.controller.ts`), next to `ask_operator`. It resolves the
  run and stage from `X-Zibby-Run-Id`, then the effective advisor config of that phase.
- **Session.** `claude -p` with `--resume <from-phase sessionId> --fork-session`, so the
  original phase's session stays untouched (`claude-run-command.service.ts:565` already
  supports `resumeSessionId`). The cwd is the run worktree.
  - **Read-only:** Read, Grep, Glob, and Bash limited to read commands. No Edit or Write.
  - **Prompt:** the question, the asking phase's id and handoff, and the advisor contract
    below.
- **Advisor contract.** Answer within the task's scope. Approve the deviation, reject it,
  or propose another way. If the answer would change scope or the acceptance criteria,
  reply with `ESCALATE: <why>` and nothing else. The tool then tells the agent to call
  `ask_operator`.
- **Audit.** Every call writes `<run>/<stage dir>/advisor/NN.md` with the question, the
  answer, the model, the cost and the duration. The cost counts toward the run budget.
- **Review integration.** The code-reviewer reads the `advisor/` notes. A deviation the
  advisor approved counts as declared and is not a `gap` by itself.

## Risks / verify first

- **MCP tool-call timeout** in the `claude` CLI. An Opus advisor with high thinking can
  take minutes. Measure this first. If the call times out, make it asynchronous: the tool
  returns an id and the agent polls with `get_advice(id)`.
- **Approval hooks.** The PreToolUse classifier must not gate `ask_advisor` the way it
  gates `ask_operator` (no `operator.question` floor).
- **Concurrency.** A fork of a session that is still live can't happen, because the source
  phase has already finished. Even so, never resume a session of a phase that is still
  running.

## Agent bodies to update once it ships

- `fullstack-developer.md` (ZibbyOS data dir), section "Following the plan". Today it says
  "ask_operator for outcome-changing deviations". Change it to the ladder above.
- `code-reviewer.md`, section "Verify, don't trust". Add that advisor-approved deviations
  are declared.

## Done when

- `advisor` is in `libs/contracts/src/workflows/workflow.schema.ts` (workflow and phase
  level), with merge and default-`from` resolution, and has a contract test.
- `ask_advisor` works in a real delivery run: the koder asks, the advisor answers from the
  architekt session, and the note lands in `advisor/`.
- `maxCalls` and `ESCALATE` route to `ask_operator`, with tests for both.
- The cost shows up in the run's `costUsd`.
