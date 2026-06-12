# Activity log & briefing

## Activity log

Append-only accountability record — ZIBBY může vysvětlit co dělá a udělal, z logu, kdykoliv.

### Formát

Jeden soubor per den: `apps/api/data/activity/YYYY-MM-DD.jsonl`  
Každý řádek je `JSON.stringify(ActivityEntry) + "\n"` — jeden `fs.appendFile` syscall.

```typescript
interface ActivityEntry {
  id: string           // collision-resistant UUID
  at: string           // ISO datetime
  kind: ActivityKind   // uzavřený výčet (viz níže)
  summary: string      // jedna lidsky čitelná věta
  traceId?: string     // z AsyncLocalStorage (automaticky)
  runId?: string       // z AsyncLocalStorage (automaticky)
  refs: ActivityRefs   // strukturované linky (strict object)
}
```

### ActivityKind — uzavřený výčet

```typescript
type ActivityKind =
  | "task-created" | "task-dispatched" | "task-outcome" | "task-held" | "task-queued"
  | "run-started" | "run-finished"
  | "pipeline-started" | "pipeline-finished" | "pipeline-parked"
  | "approval-requested" | "approval-approved" | "approval-rejected"
  | "gate-decision"
  | "channel-item" | "channel-triage" | "channel-reply" | "channel-approval" | "channel-ignored"
  | "briefing-generated"
```

Žádný volný text — nový kind se přidá explicitně do schématu.

### ActivityRefs — strict structured links

```typescript
interface ActivityRefs {
  taskId?: string
  runRef?: string
  pipelineId?: string
  agentId?: string
  projectId?: string       // přiřazení k projektu (Phase 8)
  approvalId?: string
  integrationId?: string
  itemId?: string
  action?: string
  decision?: string
  status?: string
  noteId?: string
}
```

`.strict()` — žádná extra pole. Pokud nový kind potřebuje nový ref, schéma se rozrůstá záměrně.

### ActivityLogService

**Soubor:** `apps/api/src/activity/activity-log.service.ts`

- `record({ kind, summary, refs })` — **nikdy nehází** (accountability nesmí přerušit actuaci)
- `list({ date?, kinds?, limit? })` — čte JSONL po řádcích; špatný řádek po crash přeskočí (neshodí celý den)
- `traceId` / `runId` jsou razítkovány automaticky z `TraceContextService` (AsyncLocalStorage)

### API

```
GET /api/activity?date=YYYY-MM-DD&kinds=run-started,run-finished&limit=50
```

Výchozí: dnešní den, limit 50. Max limit: 500.  
`kinds` je comma-separated allow-list `ActivityKind` hodnot.

## ActivityRecorderModule

**Soubor:** `apps/api/src/activity/activity-recorder.module.ts`

Mapovací vrstva — přijímá interní business události (EventsService) a zapisuje je jako activity entries.
Odděluje business logiku od formátu logu.

## Briefing systém

### Co je briefing

Deterministická syntéza actuality logu a vault poznámek — **žádný model, žádné tokeny**.
Butler's briefing, ne firehose:

> "Přes noc přišly dva bugy — oba opraveny, PRs nahoru na review. Firma X se ptala na feature Y; odpověděl jsem. Nic jiného nečeká."

### BriefingService

**Soubor:** `apps/api/src/briefing/briefing.service.ts`

Načte activity log za daný den a sestaví `BriefingItem[]`:

```typescript
interface BriefingItem {
  kind: BriefingItemKind   // "tasks" | "approvals" | "runs" | "channels" | "insights"
  title: string
  items: string[]
  count: number
}
```

### BriefingAssembly

**Soubor:** `apps/api/src/briefing/briefing-assembly.ts`

Pure funkce: `activityEntries → BriefingSection[]`

1. Seskupí podle druhu (task outcomes, approvals, channel akce, ...)
2. Filtruje triviální (allowed gates, tiché Tier 1 akce)
3. Zvýrazní co potřebuje pozornost (pending approvals, parked pipelines)

### API

```
GET /api/briefing/{date}   briefing pro datum (YYYY-MM-DD)
```

Vrátí `{ date, sections: BriefingSection[], generatedAt }`.

### Automatizovaný briefing

Cíl automations (typ `briefing`):

```yaml
trigger:
  type: cron
  cron: "0 8 * * *"    # každý den v 8:00
target:
  type: briefing
```

Po spuštění zapíše `briefing-generated` do activity logu.

### ClaudeCliBriefier

**Soubor:** `apps/api/src/briefing/claude-cli-briefer.ts`

Volitelná integrace: pokud chce operátor richer briefing, může přes CLI.
Výstup jde na stdout.
