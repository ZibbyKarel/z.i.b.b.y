# Approval Gates

## Kdo evaluuje a kdy

**Evaluátor je `GateEvaluatorService`** (`apps/api/src/gates/gate-evaluator.service.ts`). Je to NestJS service — čistá třída bez side-efektů, která jen bere pravidla a akci a vrátí rozhodnutí.

Volá ji **`AgentRunnerService.onIntent()`** (`apps/api/src/agents/agent-runner.service.ts`), a to **uprostřed běhu agenta** — ve chvíli, kdy child process oznámí akci s vnějším efektem řádkem `INTENT {json}` na stdout (Variant B). Run se nejdřív normálně spawne; gating proběhne až když agent skutečně chce provést gated akci.

> **Historicky** (Variant A) se evaluace spouštěla jednou, na spawn boundary — agent se vůbec nespustil, dokud nebyl schválen. To bylo nahrazeno Variantou B (viz níže), která umí gatovat jednotlivé akce uprostřed jednoho běhu.

---

## Krok za krokem: co se děje při `INTENT {json}`

### 1. Child emituje `INTENT` a zablokuje

Child process (např. `demo-task.mjs`) v místě gated akce zapíše na stdout:

```
INTENT {"action":"payment","metrics":{"purchase.amount":1200}}
```

a pak **blokuje** — pollovacím cyklem čeká, až runner zapíše `intent-decision.json` do jeho sandbox `cwd`. `RunnerCore.wire()` ten řádek naparsuje (line-buffered, aby přežil rozdělení mezi chunky), zvaliduje jako `IntendedAction` a zavolá `IntentHandler` → `AgentRunnerService.onIntent(runId, action)`.

### 2. Načtení agenta + sestavení pravidel: `rulesForAgent()`

`RunnerCore` je entity-agnostický, takže `onIntent` si agenta načte znovu z run recordu (`core.get(runId).agentId`):

Evaluátor zavolá `rulesForAgent()`, která vrátí **seřazený seznam pravidel**:

```typescript
const rules = await this.gates.rulesForAgent({
  gates: agent.gates,          // agent's own rules (z DB)
  requires_approval: agent.requires_approval,  // legacy flag
})
```

Uvnitř `rulesForAgent()` se dějí dvě věci:

**a) Legacy desugar** — pokud agent nemá `gates` (prázdné pole) ale má `requires_approval: true`, vytvoří se syntetické pravidlo:
```typescript
{
  id: "legacy-requires-approval",
  match: [{ type: "context", context: "*" }],  // sedí na vše
  decision: "ask",
  resolve: { type: "human" }
}
```

**b) Konkatenace** — vlastní pravidla agenta jdou **před** systémový floor:
```
[vlastní pravidla agenta, agent-0, agent-1, ...]
+
[systémová pravidla z POLICY.md — locked floor]
```

Pořadí je záměrné: agent může zpřísnit floor (přidat `ask` tam kde floor říká `allow`), ale nemůže ho oslabit — to hlídá `validateHardenOnly()`.

### 3. Evaluace: `evaluate(rules, action)`

```typescript
const decision = this.gates.evaluate(rules, action).decision
```

Evaluátor prochází seznam pravidel **od začátku** a pro každé pravidlo zkontroluje všechny jeho `match` podmínky (jsou AND-ované). **První pravidlo, kde všechny podmínky sedí, vyhrává.** Zbytek se ignoruje.

Pokud žádné pravidlo nesedí → výchozí `"allow"`.

#### Jak funguje každý typ match podmínky

| Typ | Co kontroluje | Příklad |
|-----|--------------|---------|
| `tool` | Přesná shoda nástroje/skillu | `{ type: "tool", tool: "bash" }` |
| `action` | Přesná shoda akce + volitelně větve | `{ type: "action", action: "git.force_push", branch: "main" }` |
| `scope` | Prefix wildcard na scope | `{ type: "scope", scope: "feature/*" }` |
| `context` | ID agenta nebo `"*"` catchall | `{ type: "context", context: "*" }` |
| `threshold` | Numerická porovnání na `action.metrics` | `{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }` |

Všechny podmínky v jednom pravidle musí **zároveň** platit (AND). Podmínky napříč pravidly jsou OR (stačí, aby jedno pravidlo celé sedělo).

### 4. Rozhodnutí

Na základě `decision` `onIntent` zvolí jednu ze tří větví (child celou dobu blokuje):

**`"ask"`** — uživatel musí schválit:
```
core.holdForApproval(runId) → status "running" → "awaiting-approval" (child žije dál a blokuje)
requestApproval()           → ${approvalId}.json na disk + status "pending"
```
Po **approve**: `ApprovalsService.approve()` → `runner.resume()` → `core.resume()` zapíše
`{ decision: "allow" }` do `intent-decision.json`, child odblokuje a pokračuje, status zpět na `running`.
Po **reject**: `runner.cancel()` → `core.cancel()` zapíše `{ decision: "deny" }` + nastaví `interrupting`,
child se ukončí, status `interrupted`.

**`"deny"`** — zakázáno politikou (bez čekání na uživatele):
```
core.denyIntent(runId) → interrupting=true + zápis { decision: "deny" }
child dostane deny → process.exit(1) → exit handler → status "interrupted"
```

**`"allow"` nebo `"notify"`** — pustit dál:
```
core.allowIntent(runId) → zápis { decision: "allow" }
child odblokuje a provede akci, status zůstává "running"
```

> **`interrupting` flag**: child ukončený kvůli deny/reject sice odejde s nenulovým exit code, ale
> jeho terminální stav je `interrupted`, ne `error`. Flag v `RunHandle` přepíná exit handler na
> `interrupted`. Stejný flag používá i `shutdown()`, aby graceful zastavení neoznačilo běh jako `error`.

---

## Strength ordering — proč agent nemůže oslabit floor

Rozhodnutí mají pevné pořadí síly:

```
allow (0) < notify (1) < ask (2) < deny (3)
```

`validateHardenOnly()` před uložením pravidel porovná vlastní pravidla agenta s floor: pokud agent na **stejnou akci** říká `allow` a floor říká `ask`, vrátí `PolicyViolation` a API odpoví 422. Agent může jen zvýšit číslo (zpřísnit), nikdy snížit.

---

## Celý flow

```
AgentRunnerService.start(agentId, prompt)
  └─ core.start(spec)                       hned spawne child, status "running"

— uprostřed běhu, když child chce provést gated akci —

child stdout: INTENT {"action":"payment","metrics":{"purchase.amount":1200}}
child pak BLOKUJE na ${cwd}/intent-decision.json
  │
RunnerCore.wire() naparsuje INTENT → onIntent(runId, action)
  │
AgentRunnerService.onIntent(runId, action)
  ├─ agent = agents.get(core.get(runId).agentId)   načti agenta znovu
  │
  ├─ gates.rulesForAgent({ gates, requires_approval })
  │    ├─ ownRules()  →  desugar legacy + obalit agent-{i} IDy
  │    ├─ floor()     →  načíst POLICY.md
  │    └─ return [...own, ...floor]         vlastní pravidla PRVNÍ
  │
  ├─ gates.evaluate(rules, action)
  │    └─ for každé pravidlo:
  │         └─ every(match podmínka) → první shoda → return decision
  │         (žádná shoda → "allow")
  │
  ├─ decision === "ask"
  │    ├─ core.holdForApproval(runId)        status → awaiting-approval (child žije)
  │    └─ approvals.requestApproval(...)     approval.json, status pending
  │         ├─ approve → core.resume()  →  zápis allow, status running, child pokračuje
  │         └─ reject  → core.cancel()  →  zápis deny + interrupting, child exit → interrupted
  │
  ├─ decision === "deny"
  │    └─ core.denyIntent(runId)             zápis deny + interrupting, child exit → interrupted
  │
  └─ decision === "allow" / "notify"
       └─ core.allowIntent(runId)            zápis allow, child pokračuje

(jakákoliv chyba v onIntent — např. smazaný agent — fail-safe na deny)
```

---

## Mid-run gating: jak to funguje (Varianta B)

Gating probíhá **uprostřed běhu** přes sentinel uvnitř procesu — analogie k `PROGRESS <n>`:

1. Child proces emituje `INTENT {json}` na stdout v místě akce s vnějším efektem.
2. `RunnerCore.wire()` ten řádek zachytí (line-buffered parser), zvaliduje jako `IntendedAction`
   a zavolá `IntentHandler` (`onIntent`).
3. `onIntent` proežene akci `GateEvaluatorService.evaluate()` a podle rozhodnutí napíše
   `intent-decision.json` do sandbox `cwd` runu (`allow`/`deny`), případně run přepne na
   `awaiting-approval` a čeká na lidské rozhodnutí.
4. Child celou dobu **blokuje** pollováním `intent-decision.json` (interval 200 ms, timeout 10 min).
   `allow` → pokračuje; `deny` → `process.exit(1)`.

Umožňuje to per-action gating uprostřed jednoho běhu: agent může nakupovat (benigní akce projdou),
ale platba nad limit počká na schválení.

### Příklad: "agent kliká zboží do košíku a pak chce zaplatit"

Agent uprostřed práce emituje `INTENT {"action":"payment","metrics":{"purchase.amount":1200}}`.
Runner to vyhodnotí; `threshold`-pravidlo `purchase.amount > 500 → ask:human` (nebo floor
`payment → ask`) zastaví child do doby, než uživatel schválí. Benigní akce (`add_to_cart`) projdou
jako `allow` bez přerušení.

### Omezení: přežití restartu

Mid-run pauza (`awaiting-approval` s živým blokujícím childem) **nepřežije restart backendu** — child
je potomek API procesu a umírá s ním, a žádný spawn spec se neukládá. Na `init()` se takový běh
rekonciluje na `interrupted` (rozlišení: `awaiting-approval` *se* stashnutým spec = pipeline-stage
pauza na spawn boundary, ta přežije a jde resumovat; *bez* spec = mrtvá mid-run pauza → `interrupted`).

---

## Klíčové soubory

| Soubor | Co dělá |
|--------|---------|
| `apps/api/src/gates/gate-evaluator.service.ts` | Celá evaluační logika — `rulesForAgent`, `evaluate`, `matches`, `validateHardenOnly` |
| `apps/api/src/gates/policy.storage.service.ts` | Čte locked floor z `POLICY.md` |
| `apps/api/src/agents/agent-runner.service.ts` | `onIntent()` — volá evaluátor mid-run, větví na ask/deny/allow |
| `apps/api/src/agents/demo-task.mjs` | Demo child: emituje `INTENT` a blokuje na `intent-decision.json` |
| `apps/api/src/runner/runner-core.ts` | `wire()` INTENT parser; `allowIntent`/`denyIntent`/`holdForApproval`; `resume`/`cancel` |
| `apps/api/src/approvals/approvals.service.ts:47` | Vytvoří Approval entitu, resume/cancel routing |
| `libs/contracts/src/gates/gate.schema.ts` | Typy: `GateRule`, `MatchCondition`, `Decision`, `IntendedAction` |
| `apps/web/features/approvals/queries/useApprovalsQuery.ts` | UI polling každou minutu |
