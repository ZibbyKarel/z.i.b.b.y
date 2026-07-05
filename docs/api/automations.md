# Automations

## What is an Automation

An `Automation` is a definition of an action that fires on a schedule or on an
event. ZIBBY's scheduling — not cron for commands, but cron for intents.

## Schema

```typescript
interface Automation {
  id: string;
  name?: string;
  trigger: CronTrigger | EventTrigger;
  target: AutomationTarget;
  prompt?: string; // free-text steering forwarded to whatever the target runs
  enabled: boolean;
  system: boolean; // server-owned: cannot be deleted, only its schedule is editable
  lastFiredAt?: string; // ISO datetime (idempotence)
}
```

`system` is **server-owned** — it cannot be set through create/update (it is
omitted from both input schemas). See [System automations](#system-automations).

### Trigger

```typescript
// Cron trigger — 5-field expression
interface CronTrigger {
  type: "cron";
  expr: string; // "0 8 * * *" = every day at 08:00
}

// Event trigger — one or more named events; fires when ANY listed event arrives
interface EventTrigger {
  type: "event";
  events: string[]; // closed catalog, e.g. "git.push", "pr.opened", "run.failed"
}
```

Cron expressions are evaluated in `Europe/Prague` (hard-coded in the matcher,
not configurable per automation). The event catalog is closed — see
`AUTOMATION_EVENTS` in `libs/contracts/src/automations/automation.schema.ts`
(`file.created`, `file.changed`, `git.push`, `pr.opened`, `pr.merged`,
`run.completed`, `run.failed`, `email.received`, `slack.message`). No event bus
fires these automatically yet — an event automation fires only through the
manual `trigger` path.

### Target

```typescript
interface PipelineTarget {
  type: "pipeline";
  pipelineId: string;
}

interface AgentTarget {
  type: "agent";
  agentId: string;
}

interface BriefingTarget {
  type: "briefing";
  // no extra fields — deterministic briefing assembly
}

interface DiscoveryTarget {
  type: "discovery";
  // deterministic scan → task candidates behind the approval gate
}

interface MemoryDistillTarget {
  type: "memory-distill";
  // nightly memory distillation — see System automations
}

interface PatternExtractTarget {
  type: "pattern-extract";
  // scans 30 days of approval-decision activity, drafts rule proposals to the vault
}

interface ResearchDigestTarget {
  type: "research-digest";
  // fetches the operator's configured sources, mirrors a ranked digest to the vault
}

interface GapDetectTarget {
  type: "gap-detect";
  // scans recurring task-created activity for automatable manual work
}

interface AppIdeasTarget {
  type: "app-ideas";
  // pairs research interests with digest trends into prototype pitches
}
```

`prompt` is a top-level, optional field (not per-target): free-text steering
forwarded to whatever the automation runs — the agent's prompt, the research
focus, or the briefing voice.

## SchedulerService

**File:** `apps/api/src/automations/scheduler.service.ts`

Tick: every `automationTickMs` ms, read from the runtime system config
(`SystemConfigStore`, not a start-only env var — see
[`docs/ops/environment.md`](../ops/environment.md)); `0` disables the loop (the
test/CI default — tests drive `tick()` directly). The scheduler re-arms live
when the config changes.

### One tick

1. Reads all `enabled` automations from disk.
2. For each, checks whether its trigger is due:
   - Cron: `matchesCron()` (`apps/api/src/automations/cron.ts`) evaluates the
     5-field expression against `now` in `Europe/Prague`; a run won't double-fire
     within the same wall-clock minute (idempotence via `lastFiredAt`).
   - Event: fired only via the manual `trigger` path today (no event bus yet).
3. When due, dispatches the target:
   - `pipeline` → `PipelineRunnerService.start(...)`
   - `agent` → `AgentRunnerService.start(...)`
   - `briefing` → `BriefingService.generate(...)`
   - `discovery` → `DiscoveryTriageService.run()`
   - `memory-distill` → `MemoryDistillerService.distill()`
   - `pattern-extract` → `PatternExtractorService.extract()`
   - `research-digest` → `ResearchService.refresh(...)`
   - `gap-detect` → `GapDetectorService.detect()`
   - `app-ideas` → `IdeaGeneratorService.generate()`
4. Updates `lastFiredAt = now` (idempotence — a double fire within the same
   minute is safe).
5. Logs the fire; missed triggers are skipped, not caught up.

## API

```
GET    /api/automations           list all
POST   /api/automations           create
GET    /api/automations/search?q= search by id or name
GET    /api/automations/:id       get one
PATCH  /api/automations/:id       update (enable/disable, retarget; system: reschedule only, else 409)
DELETE /api/automations/:id       delete (409 for a system automation)
POST   /api/automations/:id/trigger  fire now (returns runRef)
```

## Persistence

Each automation is a JSON file in `apps/api/data/automations/<id>.json`.
`lastFiredAt` is written back after every fire.

## System automations

Some capabilities belong to **the ZIBBY system itself**, not the operator or an
agent. Such automations have `system: true`:

- **Cannot be deleted** — `DELETE /api/automations/:id` returns `409`.
- **Only the schedule can be edited** — `PATCH` accepts only a `trigger` change;
  any other change (`target`, `enabled`, `name`) returns `409`.
- **Seeded and self-healed on boot** — `AutomationsStorageService.onModuleInit`
  creates any missing ones and re-asserts `system`/`target`/`name` on existing
  ones, while preserving the operator's `trigger`, `enabled`, and `lastFiredAt`
  from disk.

Definitions live in the `SYSTEM_AUTOMATIONS` constant
(`apps/api/src/automations/automations.storage.service.ts`). Today it seeds a
single automation:

### Memory distillation (`memory-distill`)

The canonical system automation (default cron `0 3 * * *`). It embodies the
principle **"the agent doesn't know about memory; the system owns learning"** —
it is the output mirror of grounding (the system reads learnings _out_, the same
way grounding writes context _in_).

`MemoryDistillerService.distill()` (`apps/api/src/memory/memory-distiller.service.ts`):

1. Walks terminal pipeline/agent/goal runs that haven't been distilled yet
   (a `memory-distilled.json` marker in the run's `cwd`; capped at
   `MAX_RUNS_PER_PASS` per pass — the remainder rolls to the next night, nothing
   is lost);
2. Uses a cheap model (`ClaudeCliDistiller`, haiku, VITEST-guarded, fail-open) to
   pull **durable learnings** out of the run's artifacts (not a per-run
   changelog);
3. Writes a single nightly digest `distilled-<date>` into `knowledge/`, links it
   from the affected projects' MOCs, and adds a pointer to the daily note;
4. Marks processed runs (only after writing — at-least-once, a duplicate line
   beats a lost learning). `distill()` **never throws** — a scheduler tick must
   not break on it.

## Autonomy boundary

An automation can dispatch a target — but that dispatch goes through the
standard gate system like any other run. There is no path by which an
automation-fired run bypasses the gate. Automation is a "planning-only" layer
on top of the approval system.

## Usage examples

```yaml
# Morning briefing every weekday
id: morning-briefing
name: Morning briefing
enabled: true
trigger:
  type: cron
  expr: "0 8 * * 1-5"
target:
  type: briefing

# Weekly status report
id: weekly-status
name: Weekly status
enabled: true
trigger:
  type: cron
  expr: "0 9 * * 1" # every Monday at 09:00
target:
  type: pipeline
  pipelineId: status-report
prompt: "Generate the weekly status report for the past week."

# Review a PR after a push
id: pr-review-on-push
name: Review after push
enabled: true
trigger:
  type: event
  events: ["git.push"]
target:
  type: agent
  agentId: code-reviewer
prompt: "Review the latest push and add comments to the PR."
```
