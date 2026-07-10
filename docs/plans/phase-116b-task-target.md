# Phase 116b — Prompt-automation `task` target + attachments + prompt→pipeline wiring

Parent: `phase-116-automations-cleanup-and-commandline-dialog.md`. Runs AFTER 116a (same files).

## Goal
Make an automation able to carry a full "task spec" (a typed prompt, an optional @-mentioned
target, uploaded files, output/toolGrants) and, on cron fire, dispatch it through the EXISTING task
pipeline — reusing classification, orchestrator fallback, attachment feeding, toolGrants and the
approval gate.

## Background (confirmed)
- Single clean entry point: `TaskSchedulerService.createTask(input, now?, trustedProjectId?,
  explicitTarget?, background?)` at `apps/api/src/tasks/task-scheduler.service.ts` (~L259).
  `CreateTaskInput` (`libs/contracts/src/tasks/task.schema.ts` ~L432-463) already carries
  `{ text, target?, attachmentSetId?, output?, toolGrants?, paths?, title?, scheduledAt? }`.
- `TaskSchedulerService` is exported by `tasks.module.ts`.
- Attachments + free-text prompt flow for **agent / orchestrator / goal** targets; **pipeline /
  chain / subsystem** do not carry them (pre-existing runner gap — leave as-is, document it).
- Attachment sets are swept as orphans after 24h unless referenced by a persisted `ScheduledTask`.

## Changes

### 1. Contract — `libs/contracts/src/automations/automation.schema.ts`
- Import `TaskTargetSchema` and `TaskOutputSchema` from `../tasks/task.schema` (confirm exact
  exported names; `TaskTarget` is the discriminated union on `kind`, `TaskOutput` is the
  terminal-output enum/schema).
- Add a new variant to `TargetSchema`:
  ```ts
  z.object({
    type: z.literal("task"),
    /** The typed prompt — the automation's instruction, forwarded as the task text. */
    text: z.string().min(1),
    /** Optional @-mentioned run target (agent/pipeline/subsystem/…). Absent = the task
     *  classifier/orchestrator decides at fire time, exactly like an unrouted task. */
    target: TaskTargetSchema.optional(),
    /** Files uploaded into the automation's context (tasks attachment set id). Fed to the
     *  run for agent/orchestrator/goal targets; pipeline/chain/subsystem cannot carry them yet. */
    attachmentSetId: z.string().optional(),
    output: TaskOutputSchema.optional(),
    toolGrants: z.array(z.string()).optional(),
  }),
  ```
  Keep the top-level `prompt` field for the legacy targets. Add a clear docstring block above the
  variant explaining this is the "prompt automation" shape.
- If importing from tasks creates a problematic import cycle inside `libs/contracts`, inline a
  minimal re-export via the contracts index instead; verify `pnpm --filter @zibby/contracts build`.

### 2. Automations scheduler — `apps/api/src/automations/scheduler.service.ts`
- Inject `TaskSchedulerService` (constructor + import from `../tasks/task-scheduler.service`).
- Add `case "task"` to the `dispatch` switch:
  ```ts
  case "task": {
    const result = await this.taskScheduler.createTask(
      { text: target.text, target: target.target, attachmentSetId: target.attachmentSetId,
        output: target.output, toolGrants: target.toolGrants },
      Date.now(),
      undefined,
      target.target, // explicit target bypasses classification when present
      false,          // synchronous cron fire
    );
    return result.taskId ?? result.runRef ?? "task";  // use whatever id CreateTaskResult exposes
  }
  ```
  Confirm the real shape of `CreateTaskResult` and return a stable reference string.
- **Also wire prompt→pipeline** for the legacy `pipeline` case: change
  `this.pipelineRunner.start(target.pipelineId)` to pass the automation's `prompt` into the
  runner's existing `input` param (see `PipelineRunnerService.start` signature ~L227-252; `input`
  is the trailing optional arg). Pass `prompt` (or `prompt ?? undefined`).

### 3. Module wiring — `apps/api/src/automations/automations.module.ts`
- Import `TasksModule` (which exports `TaskSchedulerService`) so the scheduler can inject it.
- Verify NO import cycle: `tasks.module` must not import `automations.module`. If Nest reports a
  cycle, resolve with `forwardRef(() => TasksModule)` on the automations side only.

### 4. Attachment-sweep exemption (correctness)
An automation storing an `attachmentSetId` must keep its files past the 24h orphan sweep in
`TaskSchedulerService` (sweep ~L486-504 checks only `ScheduledTask.attachmentSetId`).
Implement a no-cycle contributor:
- Define a DI token + tiny interface, e.g. `ATTACHMENT_SET_REF_PROVIDER` returning
  `Promise<string[]>` (referenced set ids).
- In `TaskSchedulerService`, inject `@Optional() @Inject(ATTACHMENT_SET_REF_PROVIDER)
  refProviders: AttachmentSetRefProvider[] = []`; in the sweep, union the referenced ids from
  persisted scheduled tasks WITH the ids returned by every provider, and never delete a referenced
  set.
- Register an automations contributor that reads `AutomationsStorageService` and returns every
  `attachmentSetId` from `task`-target automations. To avoid a module cycle, register this
  multi-provider in **`app.module.ts`** (which already imports both `TasksModule` and
  `AutomationsModule` and can see `AutomationsStorageService` via the exported provider), as
  `{ provide: ATTACHMENT_SET_REF_PROVIDER, useClass: AutomationAttachmentRefProvider, multi: true }`.
- Add a focused test: an automation with `attachmentSetId` → its set survives a sweep that would
  otherwise delete an unreferenced aged set.
- If this proves too invasive during implementation, STOP and report back rather than hacking a
  cycle; the orchestrator will decide. Do not couple `tasks` → `automations` via class imports.

### 5. Tests
- Extend `scheduler.service.test.ts`: a `task`-target automation fires → `createTask` is called
  with the right input (mock `TaskSchedulerService`); explicit target is forwarded; no target =
  classification path. Pipeline case now forwards `prompt` as `input`.
- Extend `automations.storage.service.test.ts` / `automation.contract.test.ts`: a `task` target
  validates; round-trips through create/list.

## Verify
`pnpm --filter @zibby/contracts build && pnpm check:types && pnpm check:lint && pnpm api:test`
(scheduler, tasks, automations suites green). Then `pnpm test`.

## Notes for the frontend (116d) — not implemented here
The web create dialog will build `target: { type:"task", text, target: <TaskTarget|undefined>,
attachmentSetId }` from CommandLine's `onSubmit(text, target?, attachments?)`.
