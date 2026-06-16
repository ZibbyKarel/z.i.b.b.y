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
  system: boolean        // server-owned: nesmazatelná, editovatelný jen rozvrh
  lastFiredAt?: string   // ISO datetime (idempotence)
}
```

`system` je **vlastněno serverem** — nelze ho nastavit přes create/update (je
vynechán z obou vstupních schémat). Viz [Systémové automatizace](#systémové-automatizace).

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

interface DiscoveryTarget {
  type: "discovery"
  // deterministický sken → kandidáti úkolů za schvalovací bránou
}

interface MemoryDistillTarget {
  type: "memory-distill"
  // noční destilace paměti — viz Systémové automatizace
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
   - `pipeline` → `PipelineRunnerService.start(...)`
   - `agent` → `AgentRunnerService.start(...)`
   - `briefing` → `BriefingService.generate(today)`
   - `discovery` → `DiscoveryTriageService.run()`
   - `memory-distill` → `MemoryDistillerService.distill()`
4. Aktualizuj `lastFiredAt = now` (idempotence — dvojité spuštění ve stejné minutě bezpečné)
5. Zapiš event do activity logu

### Timezone

Cron výrazy jsou vyhodnocovány v `Europe/Prague` (výchozí). Lze přepsat per-automation.

## API

```
GET    /api/automations           seznam všech
POST   /api/automations           vytvoření
GET    /api/automations/:id       detail
PATCH  /api/automations/:id       aktualizace (enable/disable, retarget; 409 u system → jen reschedule)
DELETE /api/automations/:id       smazání (409 u system automatizace)
POST   /api/automations/:id/trigger  spustit ihned (vrátí runRef)
```

## Persistence

Každá automation je JSON soubor v `apps/api/data/automations/<id>.json`.
`lastFiredAt` se zapisuje zpět po každém spuštění.

## Systémové automatizace

Některé schopnosti patří **systému ZIBBY**, ne operátorovi ani agentovi. Takové
automatizace mají `system: true`:

- **Nelze je smazat** — `DELETE /api/automations/:id` vrátí `409`.
- **Lze upravit jen rozvrh** — `PATCH` přijme pouze změnu `trigger`; jakákoli jiná
  změna (`target`, `enabled`, `name`) vrátí `409`.
- **Seedují se a self-healí při startu** — `AutomationsStorageService.onModuleInit`
  vytvoří chybějící a u existujících znovu vynutí `system` + `target`, ale zachová
  operátorův `trigger`, `enabled` a `lastFiredAt` z disku.

Definice žijí v konstantě `SYSTEM_AUTOMATIONS`
(`apps/api/src/automations/automations.storage.service.ts`).

### Destilace paměti (`memory-distill`)

Kanonická systémová automatizace (výchozí cron `0 3 * * *`). Realizuje princip
**„agent o paměti neví; učení vlastní systém"** — je to výstupní zrcadlo groundingu
(systém čte poznatky _ven_, stejně jako grounding píše kontext _dovnitř_).

`MemoryDistillerService.distill()` (`apps/api/src/memory/memory-distiller.service.ts`):

1. projde terminální běhy pipeline/agentů/goalů, které ještě nebyly destilovány
   (marker `memory-distilled.json` v `cwd` běhu; cap `MAX_RUNS_PER_PASS`, zbytek se
   odloží na další noc — nic se neztrácí);
2. levný model (`ClaudeCliDistiller`, haiku, VITEST-guarded, fail-open) z výňatků
   jejich artefaktů vytáhne **trvalé poznatky** (ne changelog jednoho běhu);
3. zapíše jeden noční digest `distilled-<datum>` do `knowledge/`, přilinkuje ho
   z MOCů dotčených projektů a přidá ukazatel do denní poznámky;
4. označí zpracované běhy (až po zápisu — at-least-once, raději duplicitní řádek než
   ztracený poznatek). `distill()` **nikdy nehodí** — scheduler tick to nesmí rozbít.

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
