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

interface MemoryDistillTarget {
  type: "memory-distill";
  // nightly memory distillation — see System automations
}

interface PatternExtractTarget {
  type: "pattern-extract";
  // scans 30 days of approval-decision activity, drafts rule proposals to the vault
}

interface GapDetectTarget {
  type: "gap-detect";
  // scans recurring task-created activity for automatable manual work
}

interface AgentFactoryTarget {
  type: "agent-factory";
  // scans recurring orchestrator-fallback activity, drafts a candidate agent
}

interface ReviewLearnTarget {
  type: "review-learn";
  // ingests review comments on the PRs ZIBBY opened, distils them into candidate
  // rules; a rule's 2nd occurrence parks a `review-rule` approval. Proposes ≠ activates.
}

interface PromptAutomationTarget {
  type: "task";
  text: string; // the typed prompt — forwarded as the task's free-text
  target?: RunTarget; // optional @-mentioned run target (agent/pipeline/subsystem/goal/chain/…);
  // absent = the task classifier/orchestrator-fallback decides at fire time
  attachmentSetId?: string; // uploaded files (a tasks attachment-set id)
  output?: TaskOutput; // chosen terminal output (pr / file / void)
  toolGrants?: string[]; // confirmed tool-grant set, threaded into dispatch
}
```

`RunTarget` here is `TaskTarget` from `libs/contracts/src/tasks/task.schema.ts` (the
same discriminated union a New Task uses: `agent` / `pipeline` / `goal` / `chain` /
`subsystem` / `orchestrator`); `TaskOutput` is that same file's terminal-output
schema (`pr` / `file` / `void`).

> Phase 116a retired the `discovery`, `research-digest` and `app-ideas` targets —
> that work is now an ordinary prompt automation targeting the `code-audit` or
> `research` pipeline directly, rather than dedicated system machinery.

> Phase 116b added the `task` target — the general "prompt automation" shape.
> On fire it dispatches through the EXISTING task pipeline
> (`TaskSchedulerService.createTask`), reusing classification, the orchestrator
> fallback, project attribution, the budget/limit/concurrency guard, the
> approval gate, attachment feeding and `toolGrants` — exactly like a task
> created from the New Task dialog. `target` (the @-mention) is optional: when
> present it bypasses classification (an explicit override); when absent the
> classifier/orchestrator-fallback picks a destination at fire time. As with an
> ordinary task, attachments only flow to an agent/orchestrator/goal
> destination — a pipeline/chain/subsystem target carries neither (a
> pre-existing runner gap, not new to automations). An attachment set
> referenced by a `task`-target automation is exempted from the tasks
> attachment-sweep's 24h TTL (it never becomes a `ScheduledTask` — and thus
> isn't "referenced" the ordinary way — until the automation actually fires);
> see `AttachmentSetRefProvider` / `attachment-set-refs.module.ts`.

`prompt` is a top-level, optional field (not per-target): free-text steering
forwarded to whatever the automation runs — the agent's prompt, the research
focus, the briefing voice, or (Phase 116b) the legacy `pipeline` target's
first-phase input (`PipelineRunnerService.start`'s `input` param). A `task`
target ignores the top-level `prompt` — its own `text` field is the prompt.

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
   - `pipeline` → `PipelineRunnerService.start(pipelineId, …, input: prompt)`
   - `agent` → `AgentRunnerService.start(...)`
   - `briefing` → `BriefingService.generate(...)`
   - `memory-distill` → `MemoryDistillerService.distill()`
   - `pattern-extract` → `PatternExtractorService.extract()`
   - `gap-detect` → `GapDetectorService.detect()`
   - `agent-factory` → `AgentFactoryService.detect()`
   - `review-learn` → `ReviewLearningService.learn()`, ref `review-rules:<observations>`
   - `task` → `TaskSchedulerService.createTask({ text, target, attachmentSetId, output, toolGrants }, now, undefined, target, background: false)` (Phase 116b)
4. Updates `lastFiredAt = now` (idempotence — a double fire within the same
   minute is safe).
5. Logs the fire; missed triggers are skipped, not caught up.

## API

```
GET    /api/automations           list all
POST   /api/automations           create
GET    /api/automations/search?q= search by id or name
GET    /api/automations/:id       get one
PATCH  /api/automations/:id       update (enable/disable, retarget; system: reschedule/toggle only, else 409)
DELETE /api/automations/:id       delete (409 for a system automation)
POST   /api/automations/:id/trigger  fire now (returns runRef)
```

## Persistence

Each automation is a JSON file in `.zibby/data/automations/<id>.json`.
`lastFiredAt` is written back after every fire.

## System automations

Some capabilities belong to **the ZIBBY system itself**, not the operator or an
agent. Such automations have `system: true`:

- **Cannot be deleted** — `DELETE /api/automations/:id` returns `409`.
- **Only the schedule and enabled state can be edited** — `PATCH` accepts a
  `trigger` change and/or an `enabled` toggle; any other change (`target`,
  `name`, `prompt`) returns `409`.
- **Seeded and self-healed on boot** — `AutomationsStorageService.onModuleInit`
  creates any missing ones and re-asserts `system`/`target`/`name` on existing
  ones, while preserving the operator's `trigger`, `enabled`, and `lastFiredAt`
  from disk.
- **Surfaced in Settings, not the Automations page** — the web app lists
  system automations under Settings → Automations (with the enable/disable
  toggle live there); the `/automations` page only shows operator-created ones.
  Rescheduling a system automation still opens its `/automations/:id` detail
  page.

Definitions live in the `SYSTEM_AUTOMATIONS` constant
(`apps/api/src/automations/automations.storage.service.ts`). Today it seeds six:

| id (data file)     | target.type       | default schedule | enabled |
| ------------------ | ----------------- | ---------------- | ------- |
| `morning-briefing` | `briefing`        | `0 7 * * *`      | yes     |
| `memory-distill`   | `memory-distill`  | `0 3 * * *`      | yes     |
| `nightly-patterns` | `pattern-extract` | `0 23 * * *`     | yes     |
| `gap-detect`       | `gap-detect`      | `0 23 * * *`     | no      |
| `agent-factory`    | `agent-factory`   | `0 4 * * 1`      | no      |
| `review-learn`     | `review-learn`    | `15 3 * * *`     | no      |

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

### Review learning (`review-learn`)

Default cron `15 3 * * *` — after the 3:00 distill, before the 3:30
self-knowledge refresh. **Off by default**: it costs GitHub calls and a model
pass per project, so the operator turns it on per engagement (the
`gap-detect`/`agent-factory` posture).

`ReviewLearningService.learn()` (`apps/api/src/review-learning/`, see
[review-learning.md](./review-learning.md)) walks every project, fetches new
code-review comments on the PRs ZIBBY opened, distils them into candidate rules,
files each as an occurrence, and parks a Tier-3 `review-rule` approval for every
rule that just reached its **second** occurrence. Fail-open per project; returns
`{ observations, proposed }` and the tick's ref is `review-rules:<observations>`.

The point worth holding onto: this automation **proposes, it never activates**.
A PR comment is text an outsider wrote (Law 4), so nothing it says can change how
ZIBBY behaves until the operator approves the parked approval. That is what makes
running it unattended safe.

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

# Prompt automation (Phase 116b): a full task spec, dispatched through the
# normal task pipeline — classification decides the destination since no
# explicit `target` is given.
id: nightly-audit
name: Nightly dependency audit
enabled: true
trigger:
  type: cron
  expr: "0 2 * * *"
target:
  type: task
  text: "Audit the repo for stale/vulnerable dependencies and open a PR with fixes."
  output:
    type: pr
```
