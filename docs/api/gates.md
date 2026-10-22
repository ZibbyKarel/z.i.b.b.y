# Gate policy engine

The gate system is a **structural** safety layer — every agent intent is evaluated
before it executes. It is not config, and it cannot be turned off by conversation.

## One list of global rules, plus an agent's own

### 1. Global rules (`gate-rules.json`)

```
GET    /api/gate-rules           list every rule (system rules flagged `system: true`)
POST   /api/gate-rules           add a rule
POST   /api/gate-rules/reorder   reorder by a full list of rule ids
PUT    /api/gate-rules/:id       edit a rule in place
DELETE /api/gate-rules/:id       remove a rule (409 for a system rule)
```

File: `gate-rules.json` at the API data root (`GATE_RULES_DIR` overrides it). One list
holds both the **built-in system rules** (`SYSTEM_RULES` in
`gate-rules.storage.service.ts`, ids `floor-*`, the former `POLICY.md` floor) and the
operator's own rules. A rule (`GlobalGateRule`) is a `GateRuleInput` plus `id`, an
optional `name`/`desc`, an optional `department` and the derived `system` flag.

- **Untagged rules apply to every run.** `PolicyStorageService.floor()` serves them as
  the locked `source: "system"` bucket the evaluator has always called "the floor".
  Within that bucket the **strictest** matching rule wins, so their order doesn't matter.
- **System rules** can be edited and moved to another decision, but never deleted
  (`SystemGateRuleError` → 409). A system rule missing from the file is put back on
  read and written back at startup. `system` is derived from the id and never stored.
- **Department-tagged rules** form the department bucket (see _Per-department bucket_
  below) and are not part of the global bucket. Order matters there (first match wins).
- On `/governance/gates` every rule sits in a decision column (ask / deny / notify /
  allow). Dragging a card to another column, or using its "move to…" menu, is an
  `updateGateRule` with the new `decision`: a move into `ask` defaults `resolve` to
  `human` and a move out drops it. Moving a rule to **allow** is how it gets switched
  off. It still matches, so the fail-closed `ask` never kicks in, but it decides `allow`,
  and own or department rules can still harden it. Every system rule can be moved,
  `pr.merge` included; this was the operator's explicit choice.
- File effects from the approval hook: `floor-delete` (ask), `floor-overwrite` (**allow**
  by default, since agents mostly rewrite files they made themselves; this also covers a
  Write/Edit outside the free zone, which is classified as `overwrite`) and `floor-move`
  (ask). Before these rules existed, `overwrite`/`move` had no rule and fell through to
  the fail-closed `ask`.
- Agents and skills can carry `gateRuleIds: [...]` naming rules by id. This is
  **composed on the client** only, and the evaluator never reads `gateRuleIds`.

**Migration.** On startup, a legacy `POLICY.md` in `POLICY_DIR` has its operator
`decisions` overrides applied to the matching system rules and is then renamed to
`POLICY.md.migrated`. Hand-added `policy` entries are not carried over.

### 2. An agent's own rules

Defined in the agent's frontmatter (`gates: [...]`):

```yaml
gates:
  - match:
      - type: action
        action: git.push
        branch: main
    decision: ask
    resolve:
      type: human
```

An agent's own rules are their own bucket (first match wins inside it). They can
harden the global rules, never weaken them: the strictest bucket decides. If an own
rule would weaken a **system** rule for the same action, the write fails with
`PolicyViolation` (422).

## Rule schema (GateRule)

### MatchCondition (discriminated union)

```typescript
// A specific tool (MCP / bash / edit / ...)
{ type: "tool", tool: "bash" }

// An action with an optional branch qualifier
{ type: "action", action: "git.push", branch?: "main" }

// A numeric metric with a comparison operator
{ type: "threshold", metric: "purchase.amount", op: "gt", value: 1000 }

// A scope (e.g. files under a given directory)
{ type: "scope", scope: "apps/web/**" }

// A context (a free-form text pattern)
{ type: "context", context: "production" }
```

The `match` array is **AND**-ed — every condition must hold.

### Decision

| Value    | Behavior                                                       |
| -------- | -------------------------------------------------------------- |
| `allow`  | Silent allow, no record                                        |
| `notify` | Allowed, but recorded to the activity log                      |
| `ask`    | The run pauses, an `Approval` is created, waits for a decision |
| `deny`   | The run is terminated immediately (`interrupted`)              |

### Resolve (only for `ask`)

A resolver tree — `ask` without `resolve` is a validation error.

```typescript
{ type: "human" }                        // waits for the operator
{ type: "check", check: "ci-green" }     // waits for an automated check
{ type: "agent", agent: "reviewer" }     // waits for a reviewing agent
{ type: "all", all: [Resolve, ...] }     // ALL must say yes
{ type: "any", any: [Resolve, ...] }     // ANY one is enough
```

## GateEvaluatorService

**File:** `apps/api/src/gates/gate-evaluator.service.ts`

Pure with respect to entities — it reads only the global rules (the "floor" bucket,
via `PolicyStorageService`), the department-tagged rules (NS2 F3a, via
`GateRulesStorageService`, read-only) and whatever rules a caller hands it, so it
has no dependency on the agents store.

### Rule priority

```
rulesForAgent(input)                        = [...ownRules(input), ...floor()]
rulesForAgentInDepartment(input, department?) = [...ownRules(input), ...departmentRules(department), ...floor()]
```

Matching buckets the list into own / department / floor. Own and department take the
first match inside the bucket, and the floor (the global rules) takes its strictest
match. Then the **strictest** bucket winner decides (`deny > ask > notify > allow`), so
an agent or a department rule can harden the global rules, never weaken them.
`departmentId` absent degrades to exactly the two-bucket `rulesForAgent` result.

### Per-department bucket (NS2 F3a)

`departmentRules(id)` = every catalog rule tagged `department === id`
(re-sourced `source: "department"`, never locked), plus the department's static
tier-default catch-all from `DEPARTMENT_TIER_DEFAULT` (contracts): all `null`
except `incident → ask` (its mandate IS Tier-3 surface-and-wait), appended as a
`{type: "context", context: "*"}` rule. The bucket applies **only** to runs of
units owned by that department — the acting department derives from the owned unit
(`agent.department` for a non-orchestrator agent run,
`workflow.department` for a workflow stage), never from the task
classification. Out of scope by decision: `evaluateForOrchestrator` (the
orchestrator is synthetic/unowned) and the floor-only call sites
(agent-proposal, task-scheduler budget guard). There is no write-time 422 for a
weakening department-tagged catalog rule (the evaluator sits downstream of the
gate-rules module; injecting it back would cycle) — `matchOnce`'s
strictest-of-buckets makes a weakening rule inert at eval time, which is the
actual security boundary.

### Default decision

If no rule in any bucket matches → fail closed to `ask` (`resolve: human`).

### Evaluation

```typescript
evaluate(rules: GateRule[], action: IntendedAction): GateEvaluation
```

Returns `{ decision, ruleId?, resolve? }`. Every rule that actually fires (a real
decision, not the silent default allow) is recorded to the activity log as a
`gate-decision` entry, scoped to the active run via `AsyncLocalStorage`.

### `validateHardenOnly`

Called on `PUT /api/agents/:id/gates` (replacing an agent's own rules):

- Walks every proposed rule against the built-in system rules (not the operator's
  own global rules: a broad scope-only `notify` would otherwise reject every unrelated
  agent `allow`; the runtime strictest-of-buckets still covers all of them)
- If a rule would weaken a system rule for the same action → `PolicyViolation`

## Orchestrátorská delegace — strictest union (Fáze 2)

Delegace (subagent přes `Task`/Agent tool) probíhá uvnitř jednoho spawnutého
`claude -p` procesu — backend nevidí jednotlivé handoffy jinak než přes
`PreToolUse` hook s matcherem `Bash|Task` (viz `docs/api/extensibility.md`).
Hook klasifikuje `Task` volání na intent `{ action: "agent.delegate", scope:
<subagent_type>, context: <zkrácený prompt> }` a pošle ho stejným
`intent-request.json` protokolem jako Bash. Systémové pravidlo
`floor-agent.delegate` je ve výchozím stavu `notify` (Tier 1, jen zalogováno);
operátor ho může přesunout do jiného sloupce nebo přidat přísnější globální
pravidlo (`gate-rules.json`, `action: agent.delegate`), které se okamžitě uplatní.

Protože delegovaný subagent běží pod identitou orchestrátoru (`AgentRunnerService.
evaluateIntent` resolvuje pravidla podle `rec.agentId`, což je `ORCHESTRATOR_ID`),
subagentovo vlastní zpřísnění (`gates`/`requires_approval`) by se jinak ztratilo.
Mitigace: `ClaudeRunCommandService.buildClaudeCommand` vrací `catalogAgentIds` —
id všech agentů v kurátorovaném `--agents` katalogu (bez skillů) — persistované
na run recordu (`AgentRunRecord.catalogAgentIds`, interní pole, není v HTTP
kontraktu). Pro orchestrátorský běh `evaluateIntent` vyhodnotí akci přes
`GateEvaluatorService.evaluateForOrchestrator(orchestrator, catalogAgents, action)`:
zvlášť pro orchestrátora a pro KAŽDÉHO katalogového agenta (vlastní pravidla +
floor), a vrátí **nejpřísnější** rozhodnutí napříč množinou (`deny > ask > notify

> allow`). Zaloguje/zaznamená se jen výsledné rozhodnutí (ne jedno per agenta).
Neorchestrátorský běh je beze změny (`rulesForAgent`+`evaluate`, jako dřív).

## IntendedAction

What an agent/runner declares before every action:

```typescript
{
  action: string           // e.g. "git.push", "bash.execute", "file.edit"
  tool?: string            // MCP tool
  scope?: string           // path / namespace
  branch?: string          // git branch (for git actions)
  context?: string         // free-form context
  metrics?: Record<string, number>  // for a threshold match
}
```

## Gate API endpoints

```
GET  /api/gates/policy          the global (untagged) rules as the locked floor bucket
POST /api/gates/evaluate        one-off dry-run evaluation (for testing/debugging)
GET  /api/agents/:id/gates      an agent's inherited (floor) + own rules
PUT  /api/agents/:id/gates      replace an agent's own rules (validateHardenOnly)
```

## Legacy backwards compatibility

`requires_approval: true` in frontmatter with no `gates` deserializes to a single
catch-all rule:

```typescript
{
  id: "legacy-requires-approval",
  source: "agent",
  locked: false,
  match: [{ type: "context", context: "*" }],
  decision: "ask",
  resolve: { type: "human" }
}
```
