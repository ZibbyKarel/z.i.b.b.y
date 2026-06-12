# Approval systém

## Co je Approval

`Approval` je durable záznam rozhodnutí, kdy ZIBBY potřebuje explicitní souhlas operátora
před pokračováním. Přežije restart API — `ApprovalsStorageService` čte z disku.

## Druhy schválení (ApprovalKind)

| Kind | Kdy vznikne |
|------|-------------|
| `agent` | Gate pravidlo rozhodlo `ask` uprostřed runu agenta |
| `pipeline-stage` | Gate uvnitř fáze pipeline |
| `channel` | ZIBBY připravil draft odpovědi na zprávu (Tier 3) |
| `task` | Task překročil budget cap (`spend-past-cap`) |

## Lifecycle

```
pending → approved
        → rejected
```

Jednou rozhodnuté Approval se nezmění.

## Schéma Approval

```typescript
interface Approval {
  id: string
  kind: ApprovalKind         // agent | pipeline-stage | channel | task
  runId?: string             // korelace s runem
  skill?: string             // agent/skill ID
  action?: string            // záměr (např. "git.push")
  detail?: string            // lidsky čitelný popis
  risk?: "low" | "medium" | "high"
  status: "pending" | "approved" | "rejected"
  requestedAt: string        // ISO datetime
  decidedAt?: string         // ISO datetime
  resolve?: Resolve          // jak se má rozhodnutí vyřešit (z gate pravidla)
}
```

## ApprovalsService

**Soubor:** `apps/api/src/approvals/approvals.service.ts`

### Vytvoření schválení (server-side)

Volá runner (`RunnerCore`) nebo `ChannelTriageFlowService`:

```typescript
approvalsService.create({
  kind: "agent",
  runId: "...",
  skill: "kodér",
  action: "git.push",
  detail: "Push feature/xyz → main",
  risk: "medium",
  resolve: { type: "human" },
})
```

Uloží JSON do `apps/api/data/approvals/<id>.json`.

### Runner integrace

Když gate rozhodne `ask`:
1. `ApprovalsService.create(...)` → vytvoří `Approval` se statusem `pending`
2. `RunnerCore` přejde na status `awaiting-approval` (pozastavení bez kill procesu)
3. Agent čeká (polling sidecar)
4. Operátor zavolá `POST /api/approvals/:id/approve` nebo `.../reject`
5. `ApprovalsService` zapíše decision → notifikuje runner přes `ResumableRunner` interface
6. Runner pokračuje (approve) nebo ukončí run (reject → `interrupted`)

### ResumableRunner interface

```typescript
interface ResumableRunner {
  resume(approvalId: string): Promise<void>
  reject(approvalId: string): Promise<void>
}
```

Implementace: `AgentRunnerService` a `PipelineRunnerService`.

## API

```
GET  /api/approvals              seznam (filtrovatelný pending/all)
POST /api/approvals/:id/approve  schválit
POST /api/approvals/:id/reject   zamítnout
```

Klient nemůže vytvářet Approval přímo — jen server (runner, triage) je generuje.
Tím se zabraňuje podvádění (Law 4).

## Zobrazení v UI

Stránka `/approvals` zobrazuje pending queue s:
- Druhem schválení
- Popis záměru (`action`, `detail`)
- Risk indikátor (low/medium/high)
- Tlačítka Schválit / Zamítnout

`overview` stránka zobrazuje počet pending jako odznak upozornění.

## Activity záznamy

| Event | Kdy |
|-------|-----|
| `approval-requested` | Approval vytvořeno |
| `approval-approved` | Operátor schválil |
| `approval-rejected` | Operátor zamítl |
