# Recon — scheduler, budget, PR/merge, integrations, ticks, activity (phase 125)

Reference for 125c (global cap), 125b (import), 125e (gate + merge hook), 125h (tick).
Line numbers are as-of the recon commit; pointers, not guarantees.

---

## 1. Task creation

### `CreateTaskInputSchema` — `libs/contracts/src/tasks/task.schema.ts:449-481`

```ts
export const CreateTaskInputSchema = z.object({
  title: z.string().max(200).optional(),
  text: z.string().min(1).max(8000),
  paths: z.array(z.string()).max(64).optional(),
  attachmentSetId: z.string().optional(),
  scheduledAt: z.number().int().positive().nullish(),
  output: TaskOutputSchema.optional(),
  target: TaskTargetSchema.optional(),
  toolGrants: z.array(z.string()).optional(),
});
```

**`text` is capped at 8000 chars** — the roadmap-context footer must fit inside that budget;
truncate deliberately rather than letting the schema reject the task.

`TaskOutputSchema` (`:253-262`) is a discriminated union over
`{type:"pr"} | {type:"file", dest:"project"|"vault", to} | {type:"void"}`.
An **absent** `output` means *inherit*, not void.

### Status enum — `task.schema.ts:284-310`

`scheduled | queued | held | pending | dispatched | cancelled | failed | dead-letter | awaiting-output`.

`queued` = at a project's `maxConcurrent`, FIFO, no approval — **exactly the status the global
cap reuses**. Already cancellable and already drained by `drainQueues()`.

### `createTask` — `apps/api/src/tasks/task-scheduler.service.ts:283-368`

```ts
async createTask(
  input: CreateTaskInput,
  now: number = Date.now(),
  trustedProjectId?: string,
  explicitTarget?: TaskTarget,
  background = false,
): Promise<CreateTaskResult>
```

Server-side call pattern (from `automations/scheduler.service.ts:208-224`):

```ts
const result = await this.taskScheduler.createTask(
  { text, target, attachmentSetId, output, toolGrants },
  Date.now(),
  undefined,      // trustedProjectId — the ONLY matchProject bypass; never client-supplied (Law 4)
  target.target,  // explicitTarget
  false,
);
return result.outcome === "dispatched" ? result.runRef : result.task.id;
```

### `matchProject` — `apps/api/src/projects/project-matcher.ts:24-65`

`matchByPath(paths) ?? matchByText(text) ?? null`. **`paths` wins over `text`**; longest project
`path` prefix wins, on a path-segment boundary. `fold()` strips diacritics so Czech names match
ASCII text.

→ The gate passes `paths: [project.path]` and attribution is automatic and deterministic.
**No `trustedProjectId`, no `projectId` on `CreateTaskInput`.**

### Storage create helpers — `apps/api/src/tasks/scheduled-tasks.storage.service.ts`

`newId()` · `create()` → `scheduled` · `createHeld()` · `createPending()` · `createQueued()` ·
`createDeferredLimit()` · `setTitle()` · `markDeferredLimit()`.

---

## 2. Scheduler concurrency (125c)

### `atCapacity()` — `task-scheduler.service.ts:948-960`

```ts
private async atCapacity(project: Project | null): Promise<boolean> {
  if (project == null) return false;
  const max = (await this.resolved.resolveBudget(project))?.maxConcurrent;
  if (max == null) return false;
  return (await this.budget.countRunning(project.id)) >= max;
}
```

The `project == null` short-circuit is the line the global cap must precede.
Three callers: `guardCapacity` (`:620`, create-time → `createQueued`), `guardExisting`
(`:879`, persisted → `markQueued`), `drainQueues` (`:1051`).

### ⚠️ Three consequential changes the global cap forces

1. **`drainQueues()` (`:1039`) filters `.filter(t => t.status === "queued" && t.projectId)`** —
   an *unattributed* task queued by a global cap would be silently never drained.
2. **`drainQueues()`'s `if (await this.atCapacity(project)) break;` (`:1051`)** breaks the
   per-project loop only; a global cap should stop the outer loop too.
3. **`withCapacityLock` (`:569-599`) runs unlocked when `projectId` is undefined** —
   `return projectId ? withPathLock(\`project-capacity:${projectId}\`, fn) : fn();`.
   Safe today only because an unscoped task contends on nothing. A global cap breaks that
   invariant; needs a `global-capacity` lock key.

Lock keys in use, all disjoint: `project-capacity:${projectId}`, `scheduler:drain`,
`task:${id}`. `drainQueues` nests `project-capacity` **inside** `scheduler:drain`.
`withPathLock` is reentrant — a same-key call from inside a held section runs inline,
unprotected.

`drainQueues` is invoked from every terminal run transition (`:181-194`, subscriptions to
agent/pipeline/goal runners) and once at boot (`:238-242`).

### `countRunning(projectId)` — `apps/api/src/budget/budget.service.ts:247-274`

```ts
async countRunning(projectId: string): Promise<number> {
  const project = await this.projects.get(projectId).catch(() => null);
  if (!project) return 0;
  const labels = new Set([project.id, project.name, project.path]);
  let n = 0;
  for (const run of this.agentRunner.listRunning()) {
    const active =
      run.status === "running" || run.status === "awaiting-approval" || run.status === "paused-limit";
    if (active && labels.has(run.project)) n += 1;
  }
  for (const run of this.pipelineRunner.list()) {
    const active = run.status === "running" || run.status === "paused-limit";
    if (active && run.projectPath === project.path) n += 1;
  }
  return n;
}
```

A `paused-limit` run **still owns its slot** (releasing it would double-dispatch at window
reset). Pipeline *stage* runs never reach these registries, so no double-counting.
**Goal runs are NOT counted** — see D-007.

`BudgetService` already injects everything needed; `countRunningGlobal()` adds no constructor args.

`BudgetStatusSchema.global` (`budget.schema.ts:71-80`) is where a `runningGlobal` /
`maxConcurrentRuns` pair belongs if the dashboard should show it.

---

## 3. System config

### `SystemConfigSchema` — `libs/contracts/src/system/system.schema.ts:14-59`

`.strict()`, and **every field must have a default** so `{}` parses. Current fields:
`taskTickMs`, `channelTickMs`, `monitorTickMs`, `automationTickMs`, `limitResumeTickMs`,
`limitResumeMax`, `goalVerifyTimeoutMs`, `goalAutoResume`, `chatPersona`, `powerSaver`,
`ttsVoice`.

Nullable precedent: `ttsVoice: z.string().min(1).nullable().default(null)`.

### Store — `apps/api/src/system/system-config.store.ts`

`current()` (sync, in-memory) · `read()` · `write()` (re-validates, atomic, notifies) ·
`onChange(listener)`. **Read knobs at use time via `systemConfig.current().<knob>`, never
cache in a field** — a `/settings` save must apply live.

### Checklist for adding a knob

1. `system.schema.ts` field **+ default**
2. `apps/api/src/system/system-config.fixture.ts`
3. read via `systemConfig.current().<knob>` at use time
4. `SystemSectionTestId` entry
5. `useState` seed in `SystemSection.tsx`
6. **add it to `save()`'s body** — the PUT replaces the whole document, so a missed field is a
   silent reset
7. the control (`NumberField` / `ToggleField`)
8. `runtime.*` keys in **both** `en.json` and `cs.json`

`SystemSection` remounts its editor on config change (`key={JSON.stringify(config)}`) so local
state reseeds.

---

## 4. PR / merge path

`apps/api/src/projects/project-pr.service.ts`. `GITHUB_API = "https://api.github.com"`.

### `fetchImpl` injection — `:94-111`

```ts
constructor(
  /* … */
  @Optional() fetchImpl?: typeof fetch,
) {
  this.fetchImpl = fetchImpl ?? fetch;
}
```

Adapters instead use a plain default param: `constructor(private readonly fetchImpl: typeof fetch = fetch) {}`.

### `resolveGithubToken` — a **module-level exported function**, `:41-64`

```ts
export async function resolveGithubToken(
  resolvedProjects: ResolvedProjectService,
  credentials: CredentialsStore,
  project: Project,
): Promise<{ repo: string; token: string } | null>
```

Import it directly (`PostMergeWatchService` does). It goes through
`resolvedProjects.resolveIntegrations(project)` — **always**, never
`integrations.list().filter(...)`, or a company-level GitHub integration is invisible.

### `merge()` — `:153-205`

> **The only merge path in ZIBBY, reached ONLY from the operator-triggered
> `POST /projects/:id/prs/:number/merge` route.** Never called from a scheduler, monitor or
> runner. Law 3: "Never: Auto-merge".

So the roadmap gate hooks **`recordMerge`**, never `merge()`.

### `recordMerge()` — `:207-242` — the hook point

Records `merge-completed` activity, then (when a sha came back) a `MergeWatch`.
The existing call site is `await this.recordMerge(...).catch(() => {})` — *"a recording failure
must NEVER surface as a merge failure (the merge already happened on GitHub)"*. The roadmap
gate call goes in the same spot with the same posture.

### The `getPr` / `isMerged` read to add

Mirror `listOpen`'s error posture: 404 → `null`, 429/403 → throw `github rate limited`,
other non-2xx → throw, no github link → `null`.

**`isMerged` must be fail-CLOSED** — unknown/gone/no-link → `false`. An unreadable PR state
must never unblock a downstream item. (Opposite of `PostMergeWatchService.rollup`'s fail-open
`"pending"`, which is *watching* an already-merged sha rather than *gating*.)

---

## 5. Integrations + credentials

### Config shapes — `libs/contracts/src/integrations/integration.schema.ts`

```ts
IntegrationKindSchema = z.enum(["slack","email","jira","github","calendar","sentry"]);

JiraConfigSchema   = { kind:"jira", baseUrl: url, email, projectKey?, jql? }.strict();
GitHubConfigSchema = { kind:"github", repo: /^[^/]+\/[^/]+$/, streams: ["issues"|"pulls"|"ci"][], username? }.strict();
```

`IntegrationSchema` enforces `projectId` **XOR** `companyId`.

Credentials wire body is a closed union — hence every adapter's identical narrowing helper:

```ts
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null;
}
```

### `CredentialsStore` — `apps/api/src/integrations/credentials.store.ts`

`has()` · `read()` (null on absent/unreadable/malformed) · `write()` · `remove()`.
*"Secrets are write-only over HTTP and are NEVER logged — this store does no logging at all."*
**Do not add a log line that touches a credential.**

### `JiraChannelAdapter` — `apps/api/src/channels/adapters/jira.adapter.ts`

Auth is Basic `base64(email:apiToken)` — email is non-secret config, token is the credential.
The adapter is a **plain class, not `@Injectable`**; services take `@Optional() adapter?` and
default-construct it, so tests stub HTTP with zero DI ceremony.

`poll()`'s JQL construction (`:71-112`) is the model for the import:

```ts
const base = jql ?? (projectKey ? `project = ${projectKey}` : "order by updated DESC");
const clause = cursor ? `(${base}) AND updated >= "${toJqlTime(cursor)}"` : base;
```

`toJqlTime` renders `yyyy-MM-dd HH:mm` (minute precision, no tz). The channel adapter requests
only `summary,updated,reporter,description` — the roadmap import needs far more
(`issuetype,parent,issuelinks,attachment,status`), which is why 125b writes its own fetcher.

### `GitHubChannelAdapter` — `apps/api/src/channels/adapters/github.adapter.ts`

`listAll(repo, cursor, creds)` → `GET /repos/{repo}/issues?state=open&sort=updated&direction=asc&per_page=50[&since=]`.
The endpoint returns issues **and** PRs; the `pull_request` field distinguishes them.

⚠️ Doc note: *"A fresh integration seeds the cursor to 'now' and ingests nothing on that first
poll — every later poll fetches only what changed, never a full backfill."* **The roadmap
import needs a backfill and must deliberately deviate from this.**

---

## 6. Ticks

Two mechanisms; there is **no `@nestjs/schedule`**.

| Mechanism | Interval source | Use when |
|---|---|---|
| `TickingWatcherBase` + `setInterval` (`apps/api/src/shared/ticking-watcher-base.ts`) | a `*TickMs` field in `SystemConfig` | you need your own configurable heartbeat |
| A **system automation** (cron, `SYSTEM_AUTOMATIONS`) | a cron expr, operator-reschedulable | periodic coarse work — what post-merge PR polling uses |

### `TickingWatcherBase`

Abstract: `watcherId`, `tickMs()`, `runTick()`, `log`. Provided: `arm()`, `stopTimer()`,
`isArmed()`, `watcherHealth()`, `guardedTick()`.

Rules: **skip-if-in-flight, not coalesce**; the public `tick()` stays **unguarded and directly
callable** (tests call `service.tick(fakeNow)`); the base deliberately does **not** implement
`OnModuleDestroy` — each service's own `onModuleDestroy()` calls `stopTimer()` first. No
`super` calls.

Standard `onModuleInit`: `this.arm(); this.unsubscribe = this.systemConfig.onChange(() => this.arm()); this.watcherHealthRegistry.register(() => this.watcherHealth());`

### The system-automation route (recommended for PR-state polling)

`post-merge-watch` is the template: an `AutomationTarget` literal
(`automation.schema.ts:85`), a `SYSTEM_AUTOMATIONS` seed with
`trigger: { type: "cron", expr: "*/10 * * * *" }, system: true`, and a `case` in
`SchedulerService.dispatch()` returning a deterministic ref string. You get an
operator-reschedulable cadence, per-minute idempotence and a trace scope, with **no new
`SystemConfig` knob**. A `system: true` automation can't be deleted, only rescheduled/toggled.

### Poller shape — `apps/api/src/maestro/post-merge-watch.service.ts`

`poll()` uses **per-item try/catch so one failure never blocks the rest**. `resolveOne` checks
the deadline first, then resolves project/token (both **fail-open, leave watching**).
`MergeWatchStore` (`merge-watch.store.ts`) is the template for a gate store — deterministic
ids make `putNew` a free dedup, `patch()` is read-merge-write, `listWatching()` filters by state.

---

## 7. Activity

```ts
export interface ActivityInput { kind: ActivityKind; summary: string; refs?: ActivityRefs; }
async record(input: ActivityInput, now: Date = new Date()): Promise<void>
```

**Fire-and-forget by contract** — call sites write `void this.activity.record(...)`; any failure
is swallowed to a warn. `traceId`/`runId` ride for free from the ambient trace scope — never
pass them.

`ActivityKindSchema` already has `task-created`, `task-dispatched`, `task-outcome`, `task-held`,
`task-queued`, `task-deferred-limit`, `task-dead-lettered`, `run-started`, `run-finished`,
`pipeline-started`, `pipeline-finished`, `merge-completed`, `post-merge-outcome`.

`ActivityRefsSchema` is **`.strict()`** — available refs: `taskId`, `runRef`, `pipelineId`,
`agentId`, `goalRunId`, `goalId`, `projectId`, `approvalId`, `integrationId`, `itemId`,
`action`, `decision`, `status`, `noteId`, `normalizedSummary`, `terms`, `ownerSubsystem`.
`itemId: \`pr-${number}\`` is the established PR-reference convention.

⚠️ **A new `kind` must be added to `ActivityKindSchema`** or `record()`'s internal
`ActivityEntrySchema.parse` throws and the entry is silently dropped to a warn.

`ActivityRecorderService` sits a level **above** Agents/Pipelines because a recorder inside
either would close a DI cycle — watch for the same hazard when placing the gate service.

---

## Cross-cutting

1. Hook `recordMerge`, never call `merge()` from a watcher (Law 3).
2. `atCapacity`'s `project == null` short-circuit is one line, but forces the `drainQueues`
   filter and `withCapacityLock` changes above.
3. `countRunning` counts agent + pipeline registries only — goal runs are excluded even though
   terminal goal runs *do* free slots via the `drainQueues` subscription. See D-007.
4. Fail-closed (budget, Law 3) vs fail-open (limit-deferral, post-merge polling). A dependency
   gate is **fail-closed**; `POST_MERGE_WINDOW_MIN = 120` is the precedent for bounding an
   unresolvable wait.
5. `SystemConfigSchema` is `.strict()` with a default on every field.
