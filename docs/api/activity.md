# Activity log & briefing

## Activity log

Append-only accountability record — ZIBBY může vysvětlit co dělá a udělal, z logu, kdykoliv.

### Formát

Jeden soubor per den: `apps/api/data/activity/YYYY-MM-DD.jsonl`  
Každý řádek je `JSON.stringify(ActivityEntry) + "\n"` — jeden `fs.appendFile` syscall.

```typescript
interface ActivityEntry {
  id: string; // collision-resistant UUID
  at: string; // ISO datetime
  kind: ActivityKind; // uzavřený výčet (viz níže)
  summary: string; // jedna lidsky čitelná věta
  traceId?: string; // z AsyncLocalStorage (automaticky)
  runId?: string; // z AsyncLocalStorage (automaticky)
  refs: ActivityRefs; // strukturované linky (strict object)
}
```

### ActivityKind — uzavřený výčet

```typescript
type ActivityKind =
  | "task-created"
  | "task-dispatched"
  | "task-outcome"
  | "task-held"
  | "task-queued"
  | "run-started"
  | "run-finished"
  | "pipeline-started"
  | "pipeline-finished"
  | "pipeline-parked"
  | "approval-requested"
  | "approval-approved"
  | "approval-rejected"
  | "gate-decision"
  | "channel-item"
  | "channel-triage"
  | "channel-reply"
  | "channel-approval"
  | "channel-ignored"
  | "briefing-generated";
```

Žádný volný text — nový kind se přidá explicitně do schématu.

### ActivityRefs — strict structured links

```typescript
interface ActivityRefs {
  taskId?: string;
  runRef?: string;
  pipelineId?: string;
  agentId?: string;
  projectId?: string; // přiřazení k projektu (Phase 8)
  approvalId?: string;
  integrationId?: string;
  itemId?: string;
  action?: string;
  decision?: string;
  status?: string;
  noteId?: string;
}
```

`.strict()` — žádná extra pole. Pokud nový kind potřebuje nový ref, schéma se rozrůstá záměrně.

### ActivityLogService

**Soubor:** `apps/api/src/activity/activity-log.service.ts`

- `record({ kind, summary, refs })` — **nikdy nehází** (accountability nesmí přerušit actuaci)
- `list({ date?, kinds?, limit? })` — čte JSONL po řádcích; špatný řádek po crash přeskočí (neshodí celý den)
- `page({ before?, limit?, kinds? })` — **keyset (cursor) stránkování přes celou historii**,
  newest-first, napříč denními soubory. Cursor je neprůhledný `<at>|<id>` nejstaršího záznamu
  předchozí stránky; vrací `{ entries, nextCursor }` (`nextCursor === null` = konec historie).
  Čte jen existující denní soubory (`fs.readdir`) a zastaví se po `limit + 1` shodách → hluboká
  historie stojí max. jeden denní soubor navíc. Pohání RightRail živý log (infinite query).
- `traceId` / `runId` jsou razítkovány automaticky z `TraceContextService` (AsyncLocalStorage)

### API

```
GET /api/activity?date=YYYY-MM-DD&kinds=run-started,run-finished&limit=50
GET /api/activity/page?before=<cursor>&limit=50          # newest-first, cursor stránkování
```

`GET /api/activity` — výchozí dnešní den, limit 50, max 500. `kinds` je comma-separated allow-list.  
`GET /api/activity/page` — celá historie po stránkách (limit 1–200, default 50); `before` je
`nextCursor` z předchozí odpovědi.

### SSE — `activity` scope (fat event)

`ActivityEventsService.emit` nese **celý `ActivityEntry`**; events controller publikuje
`{ scope: "activity", kind, at, entry }` na `/api/events`. Web RightRail entry **prependuje** do
infinite-query cache (bez refetchu); malý overview feed + briefing card se invalidují jako dřív.

## ActivityRecorderModule

**Soubor:** `apps/api/src/activity/activity-recorder.module.ts`

Mapovací vrstva — přijímá interní business události (EventsService) a zapisuje je jako activity entries.
Odděluje business logiku od formátu logu.

## Activity view — RightRail live-log config

Operátorem vlastněný dokument (twin `mandate.json`) řídí, jak se activity log zobrazuje v pravém
panelu (živý log). Každá **skupina** kindů (`tasks · runs · pipelines · goals · approvals · channels
· integrations · research · briefing`) má režim `visible` (každý záznam zvlášť) / `grouped` (sloučené
do jednoho řádku s počtem) / `hidden` (v logu vůbec). Mapa kind → skupina a defaulty žijí v
`libs/contracts/src/activity/activity-view.schema.ts` (`ACTIVITY_GROUP_OF`, `DEFAULT_ACTIVITY_VIEW`).

**Soubory:** `apps/api/src/activity-view/` (storage + controller + module), uloženo do
`apps/api/data/activity-view.json` (atomicky, tolerantní read → default). Filtrování/seskupování
probíhá **client-side** (malá data, okamžitá změna konfigurace).

```
GET /api/activity/view          # aktuální config (seeded default když chybí)
PUT /api/activity/view          # nahradí — strict, 422 na neznámý klíč skupiny (Law 4)
```

Edituje se v UI v **Settings → Activity**.

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
  kind: BriefingItemKind; // "tasks" | "approvals" | "runs" | "channels" | "insights"
  title: string;
  items: string[];
  count: number;
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
  cron: "0 8 * * *" # každý den v 8:00
target:
  type: briefing
```

Po spuštění zapíše `briefing-generated` do activity logu.

### ClaudeCliBriefier

**Soubor:** `apps/api/src/briefing/claude-cli-briefer.ts`

Volitelná integrace: pokud chce operátor richer briefing, může přes CLI.
Výstup jde na stdout.
