# Gate policy engine

The gate system is a **structural** safety layer — every agent intent is evaluated
before it executes. It is not config, and it cannot be turned off by conversation.

## Two runtime sources, one authoring catalog

### 1. System floor (POLICY.md)

File: `POLICY.md` at the API data root (`.zibby/data/POLICY.md` by default,
overridable with the `POLICY_DIR` env var).

- Managed by the operator directly on disk
- Loaded by `PolicyStorageService` at API startup (and read fresh on every `floor()` call)
- Always tagged `locked: true, source: "system"`, regardless of what's on disk
- An agent can only **harden** it, never weaken it

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

An agent's own rules have **higher priority** than the floor (first match wins, own
rules are listed first). If an own rule would weaken a floor rule for the same
action → `PolicyViolation` (422).

### 3. The global gate-rule catalog (authoring only, not runtime-resolved)

```
GET    /api/gate-rules           list every catalog rule (ordered, first match wins)
POST   /api/gate-rules           add a rule to the catalog
POST   /api/gate-rules/reorder   reorder the catalog by a full list of rule ids
PUT    /api/gate-rules/:id       edit a catalog rule in place
DELETE /api/gate-rules/:id       remove a catalog rule
```

A catalog rule (`GlobalGateRule`) is a `GateRuleInput` plus `id` and an optional
`name`/`desc`. Agents and skills can carry a `gateRuleIds: [...]` field that names
catalog rules by id — but this is **composed on the client** (the web UI reads an
entity's `gateRuleIds` and renders/edits the referenced catalog rules alongside its
inline `gates`). The runtime `GateEvaluatorService` does **not** read `gateRuleIds`
at all — `ownRules()` only ever looks at `input.gates` (inline rules) and
`input.requires_approval` (the legacy sugar below). A catalog rule only affects
evaluation once its content has been copied into an entity's `gates` array; there is
no runtime resolution step that expands `gateRuleIds` into effective rules.

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

| Value    | Behavior                                                            |
| -------- | --------------------------------------------------------------------- |
| `allow`  | Silent allow, no record                                              |
| `notify` | Allowed, but recorded to the activity log                            |
| `ask`    | The run pauses, an `Approval` is created, waits for a decision       |
| `deny`   | The run is terminated immediately (`interrupted`)                    |

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

Pure with respect to entities — it reads only the locked floor (via
`PolicyStorageService`) and whatever rules a caller hands it, so it has no
dependency on the agents store.

### Rule priority

```
rulesForAgent(input) = [...ownRules(input), ...floor()]
```

`ownRules` come first → first match wins → an agent can harden a rule (its own
`ask` beats the floor's `notify`), but it cannot weaken one (floor `ask` + own
`allow` for the same action = `PolicyViolation`).

### Default decision

If no rule matches → `allow` (default, no `ruleId`).

### Evaluation

```typescript
evaluate(rules: GateRule[], action: IntendedAction): GateEvaluation
```

Returns `{ decision, ruleId?, resolve? }`. Every rule that actually fires (a real
decision, not the silent default allow) is recorded to the activity log as a
`gate-decision` entry, scoped to the active run via `AsyncLocalStorage`.

### `validateHardenOnly`

Called on `PUT /api/agents/:id/gates` (replacing an agent's own rules):

- Walks every proposed rule against the floor
- If a rule would weaken a floor rule for the same action → `PolicyViolation`

## Orchestrátorská delegace — strictest union (Fáze 2)

Delegace (subagent přes `Task`/Agent tool) probíhá uvnitř jednoho spawnutého
`claude -p` procesu — backend nevidí jednotlivé handoffy jinak než přes
`PreToolUse` hook s matcherem `Bash|Task` (viz `docs/api/extensibility.md`).
Hook klasifikuje `Task` volání na intent `{ action: "agent.delegate", scope:
<subagent_type>, context: <zkrácený prompt> }` a pošle ho stejným
`intent-request.json` protokolem jako Bash. Žádné floor pravidlo pro
`agent.delegate` neexistuje → default `allow` (Tier 1, jen zalogováno); operátor
může přidat vlastní `ask`/`deny` pravidlo (`gate-rules.json`, `action:
agent.delegate`), které se okamžitě uplatní.

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
Neorchestrátorský běh je beze změny (`rulesForAgent` + `evaluate`, jako dřív).

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
GET  /api/gates/policy          the locked system policy floor
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
