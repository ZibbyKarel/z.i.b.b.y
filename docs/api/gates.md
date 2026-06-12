# Gate policy engine

Gate systém je **strukturální** bezpečnostní vrstva — každý záměr agenta (intent) prochází
vyhodnocením před provedením. Není to config, nelze ho vypnout konverzací.

## Dva zdroje pravidel

### 1. Systémový floor (POLICY.md)

Soubor: `apps/api/data/gates/POLICY.md`

- Spravovaný operátorem přímo na disku
- Při startu API načten `PolicyStorageService`
- Označen jako `locked: true, source: "system"`
- Agent ho může jen **zpřísnit**, nikdy oslabit

### 2. Vlastní pravidla agenta

Definována v frontmatter agenta (`gates: [...]` nebo `gateRuleIds: [...]`):

```yaml
gates:
  - match:
      - type: action
        action: git.push
        branch: main
    decision: ask
    resolve:
      type: human

gateRuleIds:
  - push-to-main   # reference na globální katalog
```

Vlastní pravidla agenta mají **vyšší prioritu** než floor (first match wins, vlastní pravidla jsou první v seznamu).
Pokud by vlastní pravidlo oslabovalo floor pravidlo na stejnou akci → `PolicyViolation` (422).

### 3. Globální katalog pravidel

```
GET    /api/gate-rules           seznam všech katalogových pravidel
POST   /api/gate-rules           vytvoření pravidla
GET    /api/gate-rules/:id       detail pravidla
PUT    /api/gate-rules/:id       aktualizace pravidla
DELETE /api/gate-rules/:id       smazání pravidla
```

Katalogové pravidlo (`GlobalGateRule`) je `GateRuleInput` + `id` + volitelné `name`/`desc`.
Agent ho odkazuje přes `gateRuleIds: ["push-to-main"]` — pravidlo se aplikuje jako by bylo inline.

## Schéma pravidla (GateRule)

### MatchCondition (discriminated union)

```typescript
// Konkrétní tool (MCP / bash / edit / ...)
{ type: "tool", tool: "bash" }

// Akce s volitelným branch qualifierem
{ type: "action", action: "git.push", branch?: "main" }

// Numerická metrika s operátorem
{ type: "threshold", metric: "purchase.amount", op: "gt", value: 1000 }

// Scope (např. soubory v určitém adresáři)
{ type: "scope", scope: "apps/web/**" }

// Kontext (libovolný textový pattern)
{ type: "context", context: "production" }
```

`match` array je **AND** — všechny podmínky musí platit.

### Decision

| Hodnota | Chování |
|---------|---------|
| `allow` | Tiché povolení, žádný záznam |
| `notify` | Povolení, ale zaznamená se do activity logu |
| `ask` | Run se pozastaví, vytvoří se `Approval`, čeká na rozhodnutí |
| `deny` | Run se okamžitě ukončí (`interrupted`) |

### Resolve (jen pro `ask`)

Strom resolver — `ask` bez `resolve` je chyba validace.

```typescript
{ type: "human" }                        // čeká na operátora
{ type: "check", check: "ci-green" }     // čeká na automatizovaný check
{ type: "agent", agent: "reviewer" }     // čeká na review agenta
{ type: "all", all: [Resolve, ...] }     // ALL musí říct ano
{ type: "any", any: [Resolve, ...] }     // ANY jeden stačí
```

## GateEvaluatorService

**Soubor:** `apps/api/src/gates/gate-evaluator.service.ts` (6.7 KB)

### Priorita pravidel

```
rulesForAgent(input) = [...ownRules(input), ...floor()]
```

`ownRules` jsou první → první shoda vyhrává → agent může pravidlo zpřísnit (vlastní `ask`
vyhraje nad floor `notify`), ale nemůže oslabit (floor `ask` + vlastní `allow` = `PolicyViolation`).

### Výchozí decision

Pokud žádné pravidlo nematchuje → `allow` (default, žádný `ruleId`).

### Evaluace

```typescript
evaluate(action: IntendedAction, rules: GateRule[]): GateEvaluation
```

Vrátí `{ decision, ruleId?, resolve? }`.

### `validateHardenOnly`

Volá se při `PUT /api/gates/:agentId` (nahrazení vlastních pravidel agenta):
- Projde každé navrhované pravidlo vůči floor
- Pokud by pravidlo oslabovalo floor pravidlo → `PolicyViolation`

## IntendedAction

Co agent oznamuje před každou akcí:

```typescript
{
  action: string           // např. "git.push", "bash.execute", "file.edit"
  tool?: string            // MCP nástroj
  scope?: string           // cesta / namespace
  branch?: string          // git branch (pro git akce)
  context?: string         // volný kontext
  metrics?: Record<string, number>  // pro threshold match
}
```

## Gate API endpoints

```
GET  /api/gates/:agentId        inherited (floor) + own pravidla agenta
PUT  /api/gates/:agentId        nahraď vlastní pravidla agenta (validateHardenOnly)
POST /api/gates/evaluate        jednorázové vyhodnocení (pro testování/debugging)
```

## Legacy backwards compatibility

`requires_approval: true` v frontmatter bez `gates` se deserializuje na jedno catch-all pravidlo:

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
