# Approval Gates

## Who evaluates, and when

**The evaluator is `GateEvaluatorService`** (`apps/api/src/gates/gate-evaluator.service.ts`). It's a NestJS service — a pure class with no side effects that just takes rules and an action and returns a decision.

It is called by **`AgentRunnerService.onIntent()`** (`apps/api/src/agents/agent-runner.service.ts`), **in the middle of an agent run** — the moment the run announces an action with an external effect (Variant B). The run spawns normally first; gating only happens once the agent actually wants to perform a gated action.

> **Historically** (Variant A), evaluation ran once, at the spawn boundary — the agent didn't start at all until it was approved. That was replaced by Variant B (see below), which can gate individual actions in the middle of a single run.

---

## Step by step: what happens on an intent

### 1. The run announces an intent and blocks

Two mechanisms feed the same handler, depending on what's spawned:

- **Real `claude -p` agent runs (current production path).** A `PreToolUse` hook, `apps/api/src/runner/claude-approval-hook.mjs`, runs before every Bash tool call. It classifies the command against a denylist — the `rm` family / `find … -delete` / `git clean` (→ `delete`), `git push` / a force-push variant (→ `git.push` / `git.force_push`), `gh pr create` (→ `pr.open`), `gh pr merge` (→ `pr.merge`) — and lets anything unrecognized through immediately (exit 0). A gated command is announced by writing `intent-request.json` into the run's sandbox `cwd` (pinned via the `ZIBBY_INTENT_DIR` env var, never the tool call's own `cwd`, so the request lands where the core is actually watching), then the hook **blocks**, polling for `intent-decision.json`. A hook's stdout never reaches the parent process's pipe, so this coordination is entirely file-based. `RunnerCore.watchIntentRequest()` polls the sandbox `cwd` for that request file (every 200 ms), and on seeing one, validates it as an `IntendedAction` and calls `IntentHandler` → `AgentRunnerService.onIntent(runId, action)`.
- **Demo / test children (legacy stdout path).** A demo or test child writes a line to stdout instead:

  ```
  INTENT {"action":"payment","metrics":{"purchase.amount":1200}}
  ```

  and then blocks the same way, polling for `intent-decision.json` in its own sandbox `cwd`. `RunnerCore.wire()` parses that line (line-buffered, so it survives being split across chunks), validates it as an `IntendedAction`, and calls the same `IntentHandler`. This is the path exercised by `runner-core.test.ts`; there is no standalone demo child script on disk any more — `claude-approval-hook.mjs`'s own header comment notes it "replaces the old stdout-`INTENT` gate that demo scripts faked."

Both paths converge on the same handler, so everything from here on is identical regardless of which one fired.

### 2. Load the agent + assemble rules: `rulesForAgent()`

`RunnerCore` is entity-agnostic, so `onIntent` reloads the agent from the run record (`core.get(runId).agentId`):

The evaluator calls `rulesForAgent()`, which returns an **ordered rule list**:

```typescript
const rules = await this.gates.rulesForAgent({
  gates: agent.gates, // agent's own rules (from storage)
  requires_approval: agent.requires_approval, // legacy flag
});
```

Inside `rulesForAgent()` two things happen:

**a) Legacy desugar** — if the agent has no `gates` (an empty array) but has `requires_approval: true`, a synthetic rule is created:

```typescript
{
  id: "legacy-requires-approval",
  match: [{ type: "context", context: "*" }],  // matches everything
  decision: "ask",
  resolve: { type: "human" }
}
```

**b) Concatenation** — the agent's own rules go **before** the system floor:

```
[agent's own rules, agent-0, agent-1, ...]
+
[system rules from POLICY.md — the locked floor]
```

The order is deliberate: an agent can harden the floor (add `ask` where the floor says `allow`), but can never weaken it — `validateHardenOnly()` enforces that.

### 3. Evaluation: `evaluate(rules, action)`

```typescript
const decision = this.gates.evaluate(rules, action).decision;
```

The evaluator walks the rule list **from the start** and checks all of a rule's `match` conditions (AND-ed together) for each rule. **The first rule where every condition matches wins.** The rest are ignored.

If no rule matches → the default is `"allow"`.

#### How each match-condition type works

| Type        | What it checks                        | Example                                                                  |
| ----------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `tool`      | Exact match on tool/skill              | `{ type: "tool", tool: "bash" }`                                         |
| `action`    | Exact match on action + optional branch | `{ type: "action", action: "git.force_push", branch: "main" }`           |
| `scope`     | Prefix wildcard on scope               | `{ type: "scope", scope: "feature/*" }`                                  |
| `context`   | Agent id, or the `"*"` catch-all       | `{ type: "context", context: "*" }`                                      |
| `threshold` | Numeric comparison on `action.metrics` | `{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }` |

All conditions within one rule must hold **simultaneously** (AND). Conditions across rules are OR'd (it's enough for one rule to fully match).

### 4. Decision

Based on `decision`, `onIntent` picks one of three branches (the run stays blocked throughout):

**`"ask"`** — a human must approve:

```
core.holdForApproval(runId) → status "running" → "awaiting-approval" (run stays alive, blocked)
requestApproval()            → ${approvalId}.json on disk + status "pending"
```

On **approve**: `ApprovalsService.approve()` → `runner.resume()` → `core.resume()` writes
`{ decision: "allow" }` to `intent-decision.json`, the run unblocks and continues, status back to `running`.
On **reject**: `runner.cancel()` → `core.cancel()` writes `{ decision: "deny" }` and sets `interrupting`,
the run terminates, status `interrupted`.

**`"deny"`** — blocked by policy (no waiting on a human):

```
core.denyIntent(runId) → interrupting=true + write { decision: "deny" }
child receives deny → process exits non-zero → exit handler → status "interrupted"
```

**`"allow"` or `"notify"`** — let it through:

```
core.allowIntent(runId) → write { decision: "allow" }
run unblocks and performs the action, status stays "running"
```

> **The `interrupting` flag**: a run terminated on deny/reject exits with a non-zero code, but
> its terminal state is `interrupted`, not `error`. A flag on `RunHandle` switches the exit handler to
> `interrupted`. The same flag is used by `shutdown()`, so a graceful stop never marks a run as `error`.

---

## Strength ordering — why an agent can't weaken the floor

Decisions have a fixed strength order:

```
allow (0) < notify (1) < ask (2) < deny (3)
```

`validateHardenOnly()` compares an agent's own rules against the floor before saving: if an agent says `allow` for the **same action** the floor says `ask` for, it returns a `PolicyViolation` and the API answers 422. An agent can only raise the number (harden), never lower it.

---

## Full flow

```
AgentRunnerService.start(agentId, prompt)
  └─ core.start(spec)                       spawns immediately, status "running"

— mid-run, when the run wants to perform a gated action —

Real claude run: PreToolUse hook writes intent-request.json into the sandbox cwd, then blocks.
Demo/test child: writes INTENT {"action":"payment","metrics":{"purchase.amount":1200}} to stdout, then blocks.
  │
RunnerCore.watchIntentRequest() (real) / RunnerCore.wire() (demo/test) → onIntent(runId, action)
  │
AgentRunnerService.onIntent(runId, action)
  ├─ agent = agents.get(core.get(runId).agentId)   reload the agent
  │
  ├─ gates.rulesForAgent({ gates, requires_approval })
  │    ├─ ownRules()  →  legacy desugar + wrap agent-{i} ids
  │    ├─ floor()     →  read POLICY.md
  │    └─ return [...own, ...floor]         own rules FIRST
  │
  ├─ gates.evaluate(rules, action)
  │    └─ for each rule:
  │         └─ every(match condition) → first match → return decision
  │         (no match → "allow")
  │
  ├─ decision === "ask"
  │    ├─ core.holdForApproval(runId)        status → awaiting-approval (run stays alive)
  │    └─ approvals.requestApproval(...)     approval.json, status pending
  │         ├─ approve → core.resume()  →  writes allow, status running, run continues
  │         └─ reject  → core.cancel()  →  writes deny + interrupting, run exits → interrupted
  │
  ├─ decision === "deny"
  │    └─ core.denyIntent(runId)             writes deny + interrupting, run exits → interrupted
  │
  └─ decision === "allow" / "notify"
       └─ core.allowIntent(runId)            writes allow, run continues

(any error inside onIntent — e.g. a deleted agent — fails safe to deny)
```

---

## Mid-run gating: how it works (Variant B)

Gating happens **mid-run** through a coordination file, similar to `PROGRESS <n>`:

1. The run announces a gated, external-effect action — a `PreToolUse` hook writing `intent-request.json` for a real `claude -p` run, or an `INTENT {json}` stdout line for a demo/test child.
2. `RunnerCore` picks it up — `watchIntentRequest()` polling for the request file (real runs) or `wire()`'s line-buffered parser (demo/test) — validates it as an `IntendedAction`, and calls `IntentHandler` (`onIntent`).
3. `onIntent` runs the action through `GateEvaluatorService.evaluate()` and, depending on the decision, writes
   `intent-decision.json` into the run's sandbox `cwd` (`allow`/`deny`), or flips the run to
   `awaiting-approval` and waits on a human decision.
4. The run **blocks** throughout, polling for `intent-decision.json` (200 ms interval; the real-run hook takes its own deadline — see `claude-approval-hook.mjs` — and fails closed to `deny` before Claude Code's own hook timeout would kill it as a silent non-decision).
   `allow` → continues; `deny` → the run exits non-zero.

This enables per-action gating in the middle of a single run: an agent can shop around (benign actions pass through), but a payment over the limit waits for approval.

### Example: "an agent adds items to a cart, then tries to pay"

Mid-run, the run announces `INTENT {"action":"payment","metrics":{"purchase.amount":1200}}`.
The runner evaluates it; a `threshold` rule (`purchase.amount > 500 → ask:human`), or the floor's
`payment → ask`, stops it until a human approves. Benign actions (`add_to_cart`) pass through
as `allow` without interruption.

For a real `claude -p` run doing destructive or publishing work, the equivalent is the hook classifying `rm -rf build/` as `delete`, or `git push origin main` as `git.push`, and pausing on the same `ask`/`deny` floor rules.

### Limitation: restart survival

A mid-run pause (`awaiting-approval` with a live blocked run) **does not survive a backend restart** — the
run is a child of the API process and dies with it, and no spawn spec is stashed for it. On `init()`, such a run
is reconciled to `interrupted` (the distinction: `awaiting-approval` _with_ a stashed spec is a pipeline-stage
pause at the spawn boundary, which does survive and can be resumed; _without_ a spec, it's a dead mid-run pause → `interrupted`).

---

## Key files

| File                                                        | What it does                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/api/src/gates/gate-evaluator.service.ts`               | The whole evaluation engine — `rulesForAgent`, `evaluate`, `matches`, `validateHardenOnly` |
| `apps/api/src/gates/policy.storage.service.ts`                | Reads the locked floor from `POLICY.md`                                                    |
| `apps/api/src/agents/agent-runner.service.ts`                 | `onIntent()` — calls the evaluator mid-run, branches to ask/deny/allow                     |
| `apps/api/src/runner/claude-approval-hook.mjs`                | `PreToolUse` hook for real `claude -p` runs: classifies gated Bash commands, writes `intent-request.json`, blocks on `intent-decision.json` |
| `apps/api/src/runner/runner-core.ts`                          | `watchIntentRequest()` (real runs) / `wire()` (demo, test) intent parsing; `allowIntent`/`denyIntent`/`holdForApproval`; `resume`/`cancel` |
| `apps/api/src/approvals/approvals.service.ts`                 | Creates the `Approval` entity; routes `approve`/`reject` to `resume`/`cancel`              |
| `libs/contracts/src/gates/gate.schema.ts`                     | Types: `GateRule`, `MatchCondition`, `Decision`, `IntendedAction`                          |
| `apps/web/features/approvals/queries/useApprovalsQuery.ts`    | UI: live via the SSE events stream, falling back to a 60 s poll when the stream isn't connected |
