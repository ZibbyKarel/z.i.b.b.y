# Automatizace

## Co je Automation

`Automation` je definice pravidelně nebo událostně spouštěné akce.
Plánování ZIBBY — ne cron pro příkazy, ale cron pro záměry.

## Schéma

```typescript
interface Automation {
  id: string
  name: string
  enabled: boolean
  trigger: CronTrigger | EventTrigger
  target: AutomationTarget
  lastFiredAt?: string   // ISO datetime (idempotence)
}
```

### Trigger

```typescript
// Cron trigger — 5polní výraz
interface CronTrigger {
  type: "cron"
  cron: string          // "0 8 * * *" = každý den v 8:00
  timezone: string      // výchozí "Europe/Prague"
}

// Event trigger — pojmenovaná událost
interface EventTrigger {
  type: "event"
  event: string         // název události (např. "briefing-generated")
}
```

### Target

```typescript
interface PipelineTarget {
  type: "pipeline"
  pipelineId: string
  prompt?: string        // volitelný prompt předaný pipeline
}

interface AgentTarget {
  type: "agent"
  agentId: string
  prompt?: string        // prompt předaný agentovi
}

interface BriefingTarget {
  type: "briefing"
  // bez dalších polí — deterministické generování briefingu
}
```

## SchedulerService

**Soubor:** `apps/api/src/automations/scheduler.service.ts`

Tick: každých `AUTOMATION_TICK_MS` ms (výchozí 60 000; `0` = disabled pro testy).

### Jeden tick

1. Načte všechny `enabled` automations z disku
2. Pro každou zkontroluje: je trigger splněn?
   - Cron: `cron-parser` vyhodnotí, jestli `lastFiredAt < nextFireTime <= now`
   - Event: `EventsService` signalizuje pojmenovanou událost
3. Pokud splněn → dispatch target:
   - `pipeline` → `PipelineRunnerService.startRun(...)`
   - `agent` → `AgentRunnerService.startRun(...)`
   - `briefing` → `BriefingService.generate(today)`
4. Aktualizuj `lastFiredAt = now` (idempotence — dvojité spuštění ve stejné minutě bezpečné)
5. Zapiš event do activity logu

### Timezone

Cron výrazy jsou vyhodnocovány v `Europe/Prague` (výchozí). Lze přepsat per-automation.

## API

```
GET    /api/automations           seznam všech
POST   /api/automations           vytvoření
GET    /api/automations/:id       detail
PUT    /api/automations/:id       aktualizace (incl. enabled toggle)
DELETE /api/automations/:id       smazání
```

## Persistence

Každá automation je JSON soubor v `apps/api/data/automations/<id>.json`.
`lastFiredAt` se zapisuje zpět po každém spuštění.

## Omezení autonomie

Automation může dispatch provést — ale dispatch prochází standardním gate systémem.
Není cesta jak automation spustila by akci, která by obešla gate.
Autonomie je "planning-only" vrstva nad schvalovacím systémem.

## Příklady použití

```yaml
# Ranní briefing každý pracovní den
id: morning-briefing
name: Ranní briefing
enabled: true
trigger:
  type: cron
  cron: "0 8 * * 1-5"
target:
  type: briefing

# Týdenní status report
id: weekly-status
name: Týdenní status
enabled: true
trigger:
  type: cron
  cron: "0 9 * * 1"    # každé pondělí v 9:00
target:
  type: pipeline
  pipelineId: status-report
  prompt: "Vygeneruj týdenní status report za uplynulý týden."

# Sledování PR po push
id: pr-review-on-push
name: Review po push
enabled: true
trigger:
  type: event
  event: "git.push"
target:
  type: agent
  agentId: code-reviewer
  prompt: "Zkontroluj poslední push a přidej komentáře k PR."
```
