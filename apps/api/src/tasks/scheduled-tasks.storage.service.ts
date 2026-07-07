import { Inject, Injectable } from "@nestjs/common";
import {
  type Attachment,
  type CreateTaskInput,
  type ScheduledTask,
  ScheduledTaskSchema,
  type TaskOutcome,
  type TaskTarget,
} from "@zibby/contracts";
import { EntityFileStore, collisionResistantId } from "../shared/file-storage";

/** A create input carrying its attachment set's resolved metadata (Task 6). */
type CreateTaskInputWithAttachments = CreateTaskInput & { attachments?: Attachment[] };

export const TASKS_DIR = "TASKS_DIR";

/** Filename-safe ids (the path-containment guard is applied on top). */
const TASK_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

/** Statuses a task can still be cancelled from — it never dispatched (Phase 8). */
const CANCELLABLE = new Set<ScheduledTask["status"]>(["scheduled", "queued", "held"]);

export class ScheduledTaskNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Scheduled task "${id}" not found`);
    this.name = "ScheduledTaskNotFoundError";
  }
}
export class InvalidScheduledTaskIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid scheduled task id: "${id}"`);
    this.name = "InvalidScheduledTaskIdError";
  }
}

/**
 * Durable, file-backed persistence for deferred tasks — one `<id>.json` each.
 * Mirrors {@link AutomationsStorageService}: the base owns the crash-safe write,
 * id guard and tolerant listing; this subclass adds task-shaped create/patch
 * helpers the scheduler drives.
 */
@Injectable()
export class ScheduledTasksStorageService
  extends EntityFileStore<ScheduledTask>
 
{
  protected readonly fileExt = ".json";
  protected readonly idRegex = TASK_ID_REGEX;

  constructor(@Inject(TASKS_DIR) dir: string) {
    super(dir);
  }

  /** A fresh collision-resistant task id (exposed so a run can be born linked). */
  newId(): string {
    return collisionResistantId("task");
  }

  /** Persist a fresh `scheduled` task built from the create input. */
  async create(
    input: CreateTaskInputWithAttachments & { scheduledAt: number },
    createdAt: string,
    projectId?: string,
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id: this.newId(),
      title: input.title ?? "",
      text: input.text,
      paths: input.paths ?? [],
      attachments: input.attachments ?? [],
      scheduledAt: input.scheduledAt,
      status: "scheduled",
      createdAt,
      ...(projectId ? { projectId } : {}),
      ...(input.attachmentSetId ? { attachmentSetId: input.attachmentSetId } : {}),
      ...(input.output ? { output: input.output } : {}),
      // Phase 11: a scheduled loop carries its `{ kind: "goal", id }` target so the
      // tick re-dispatches to it instead of re-classifying (goals are never routed).
      ...(input.target ? { target: input.target } : {}),
    };
    await this.writeEntity(task);
    return task;
  }

  /** Shared base for a pre-dispatch hold (`held` / `queued`): a task with no run yet. */
  private parkedTask(
    id: string,
    input: CreateTaskInputWithAttachments,
    status: "held" | "queued",
    projectId: string | undefined,
    now: number,
  ): ScheduledTask {
    return {
      id,
      title: input.title ?? "",
      text: input.text,
      paths: input.paths ?? [],
      attachments: input.attachments ?? [],
      scheduledAt: now,
      status,
      createdAt: new Date(now).toISOString(),
      ...(projectId ? { projectId } : {}),
      ...(input.attachmentSetId ? { attachmentSetId: input.attachmentSetId } : {}),
      ...(input.output ? { output: input.output } : {}),
    };
  }

  /** Persist a task held over a budget cap (Phase 8.1), carrying the reason. */
  async createHeld(
    id: string,
    input: CreateTaskInputWithAttachments,
    projectId: string | undefined,
    heldReason: string,
    now: number,
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      ...this.parkedTask(id, input, "held", projectId, now),
      heldReason,
    };
    await this.writeEntity(task);
    return task;
  }

  /**
   * Persist a freshly-accepted task as `pending`: its guards (limit/budget/capacity)
   * already passed synchronously, and its dispatch (classify + spawn) is about to run
   * in the BACKGROUND. The `id` is pre-generated so the run is born linked, and the
   * chosen `target` (a goal loop, an approved proposal) rides along so the background
   * dispatch routes to it instead of re-classifying. Flips to `dispatched` on success
   * or `failed` if it can't route.
   */
  async createPending(
    id: string,
    input: CreateTaskInputWithAttachments,
    projectId: string | undefined,
    now: number,
    target?: TaskTarget,
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id,
      title: input.title ?? "",
      text: input.text,
      paths: input.paths ?? [],
      attachments: input.attachments ?? [],
      scheduledAt: now,
      status: "pending",
      createdAt: new Date(now).toISOString(),
      ...(projectId ? { projectId } : {}),
      ...(input.attachmentSetId ? { attachmentSetId: input.attachmentSetId } : {}),
      ...(input.output ? { output: input.output } : {}),
      ...(target ? { target } : {}),
    };
    await this.writeEntity(task);
    return task;
  }

  /**
   * Patch a task's title in place. Used by the background dispatch path: the task is
   * persisted with a synchronous fallback title for an instant card, then the Haiku
   * namer refines it off the response path before the run starts.
   */
  async setTitle(id: string, title: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, title };
    await this.writeEntity(merged);
    return merged;
  }

  /** Persist a task queued behind a project's concurrency cap (Phase 8.2). */
  async createQueued(
    id: string,
    input: CreateTaskInputWithAttachments,
    projectId: string | undefined,
    now: number,
  ): Promise<ScheduledTask> {
    const task = this.parkedTask(id, input, "queued", projectId, now);
    await this.writeEntity(task);
    return task;
  }

  /**
   * Phase 9: persist a freshly-created task that hit an exhausted usage window as a
   * `scheduled` task due at the window reset. The existing tick re-fires it; the
   * `deferredReason`/`limitDeferrals` mark it as window-deferred (not operator-timed).
   */
  async createDeferredLimit(
    id: string,
    input: CreateTaskInputWithAttachments,
    projectId: string | undefined,
    resumeAt: number,
    now: number,
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id,
      title: input.title ?? "",
      text: input.text,
      paths: input.paths ?? [],
      attachments: input.attachments ?? [],
      scheduledAt: resumeAt,
      status: "scheduled",
      createdAt: new Date(now).toISOString(),
      deferredReason: "limit",
      limitDeferrals: 1,
      ...(projectId ? { projectId } : {}),
      ...(input.attachmentSetId ? { attachmentSetId: input.attachmentSetId } : {}),
      ...(input.output ? { output: input.output } : {}),
    };
    await this.writeEntity(task);
    return task;
  }

  /**
   * Phase 9: re-defer an existing task whose dispatch hit an exhausted window — back
   * to `scheduled`, due at the new `resumeAt`, incrementing the deferral counter.
   * Deferral is cheap (no spawn, no token), so this is unbounded.
   */
  async markDeferredLimit(id: string, resumeAt: number): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = {
      ...existing,
      status: "scheduled",
      scheduledAt: resumeAt,
      deferredReason: "limit",
      limitDeferrals: (existing.limitDeferrals ?? 0) + 1,
    };
    await this.writeEntity(merged);
    return merged;
  }

  /** Move an existing task to `held` with a reason (the tick fire path). */
  async markHeld(id: string, heldReason: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, status: "held", heldReason };
    await this.writeEntity(merged);
    return merged;
  }

  /** Move an existing task to `queued` (the tick / release-at-capacity paths). */
  async markQueued(id: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, status: "queued" };
    await this.writeEntity(merged);
    return merged;
  }

  /** Stamp the `spend-past-cap` approval onto a held task. */
  async setApproval(id: string, approvalId: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, approvalId };
    await this.writeEntity(merged);
    return merged;
  }

  /**
   * Phase 24 Part D: reassign a task's engagement — an explicit operator action
   * (unlike the path-derived `matchProject` attribution at creation time). `null`
   * clears it back to "bez projektu".
   */
  async setProjectId(id: string, projectId: string | null): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing };
    if (projectId) merged.projectId = projectId;
    else delete merged.projectId;
    await this.writeEntity(merged);
    return merged;
  }

  /**
   * Persist an immediately-dispatched task as a `dispatched` record (with the
   * pre-generated `id` its run was born linked to). `scheduledAt` is the dispatch
   * time — there was never a future fire time.
   */
  async createDispatched(
    id: string,
    input: CreateTaskInputWithAttachments,
    runRef: string,
    target: TaskTarget,
    now: number,
    projectId?: string,
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id,
      title: input.title ?? "",
      text: input.text,
      paths: input.paths ?? [],
      attachments: input.attachments ?? [],
      scheduledAt: now,
      status: "dispatched",
      createdAt: new Date(now).toISOString(),
      runRef,
      target,
      ...(projectId ? { projectId } : {}),
      ...(input.attachmentSetId ? { attachmentSetId: input.attachmentSetId } : {}),
      ...(input.output ? { output: input.output } : {}),
    };
    await this.writeEntity(task);
    return task;
  }

  /**
   * Park a dispatched task at the `pr` output gate: status `awaiting-output` with the
   * captured `pendingOutput` (branch + repo + approval). The run already finished
   * `done` — this is the durable gate state, so it survives a restart untouched.
   */
  async markAwaitingOutput(
    id: string,
    pendingOutput: NonNullable<ScheduledTask["pendingOutput"]>,
  ): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, status: "awaiting-output", pendingOutput };
    await this.writeEntity(merged);
    return merged;
  }

  /**
   * Resolve the output gate (approve or reject decided): drop back to `dispatched`
   * and clear `pendingOutput`. The run's outcome is written separately by the caller.
   */
  async resolveOutput(id: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, status: "dispatched" };
    delete merged.pendingOutput;
    await this.writeEntity(merged);
    return merged;
  }

  /**
   * Write a dispatched run's terminal outcome onto its task — idempotent: the
   * first write wins (the fast path and the catch-up sweep may both fire).
   */
  async writeOutcome(id: string, outcome: TaskOutcome): Promise<ScheduledTask> {
    const existing = await this.get(id);
    if (existing.outcome) return existing;
    const merged: ScheduledTask = { ...existing, outcome };
    await this.writeEntity(merged);
    return merged;
  }

  /** Stamp a task dispatched: record the chosen target and the started run's ref. */
  async markDispatched(id: string, runRef: string, target: TaskTarget): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, status: "dispatched", runRef, target };
    await this.writeEntity(merged);
    return merged;
  }

  /**
   * Phase 49: re-point a task at a re-run's NEW run, clearing the prior (errored)
   * outcome so the fresh run's terminal writes back and its PR/output gate can fire —
   * `writeOutcome` is first-write-wins, so a stale outcome would otherwise block it.
   * Drops back to `dispatched` and clears the stale `error` string; the operator's
   * chosen `output` and every other field are untouched, so the original task's output
   * gate is preserved. The scheduler's global `onRunStatus` handles the rest.
   */
  async reassignRun(id: string, runRef: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = { ...existing, status: "dispatched", runRef };
    delete merged.outcome;
    delete merged.error;
    await this.writeEntity(merged);
    return merged;
  }

  /** Stamp a task failed with a short reason (kept for the queue's display). */
  async markFailed(id: string, error: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = {
      ...existing,
      status: "failed",
      error,
      attempts: (existing.attempts ?? 0) + 1,
    };
    await this.writeEntity(merged);
    return merged;
  }

  /**
   * M8: requeue a transient dispatch failure for another attempt — re-`scheduled` at
   * `nextAt` (backoff), incrementing the attempt counter and stamping the error. The
   * existing tick re-fires it when `nextAt` arrives; the caller dead-letters once the
   * attempt cap is reached, so this can never loop unbounded.
   */
  async markRetry(id: string, nextAt: number, error: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = {
      ...existing,
      status: "scheduled",
      scheduledAt: nextAt,
      error,
      attempts: (existing.attempts ?? 0) + 1,
    };
    await this.writeEntity(merged);
    return merged;
  }

  /** M8: terminal dead-letter — a transient dispatch failure that exhausted its retries. */
  async markDeadLettered(id: string, error: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    const merged: ScheduledTask = {
      ...existing,
      status: "dead-letter",
      error,
      attempts: (existing.attempts ?? 0) + 1,
    };
    await this.writeEntity(merged);
    return merged;
  }

  /**
   * Mark a still-waiting task cancelled. Phase 8 widens "waiting" from `scheduled`
   * to also cover `queued` and `held` (a task that never dispatched); a task that
   * already dispatched/failed/cancelled is returned as-is. Cancelling a HELD task's
   * approval is routed through the approvals service by the caller (single source of
   * truth) — this only flips the record.
   */
  async cancel(id: string): Promise<ScheduledTask> {
    const existing = await this.get(id);
    if (!CANCELLABLE.has(existing.status)) return existing;
    const merged: ScheduledTask = { ...existing, status: "cancelled" };
    await this.writeEntity(merged);
    return merged;
  }

  protected idOf(task: ScheduledTask): string {
    return task.id;
  }

  protected serialize(task: ScheduledTask): string {
    return JSON.stringify(task);
  }

  protected tryParse(raw: string): ScheduledTask | null {
    return this.parseJson(ScheduledTaskSchema, raw);
  }

  /** Newest first — the queue reads most-recent at the top. */
  protected compare(a: ScheduledTask, b: ScheduledTask): number {
    return b.createdAt.localeCompare(a.createdAt);
  }

  protected notFound(id: string): Error {
    return new ScheduledTaskNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidScheduledTaskIdError(id);
  }
}
