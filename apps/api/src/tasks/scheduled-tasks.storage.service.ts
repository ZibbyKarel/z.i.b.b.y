import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  type CreateTaskInput,
  type ScheduledTask,
  ScheduledTaskSchema,
  type TaskOutcome,
  type TaskTarget,
} from "@zibby/contracts"
import { EntityFileStore, collisionResistantId, safeJson } from "../shared/file-storage"

export const TASKS_DIR = "TASKS_DIR"

/** Filename-safe ids (the path-containment guard is applied on top). */
const TASK_ID_REGEX = /^[a-zA-Z0-9._-]+$/

/** Statuses a task can still be cancelled from — it never dispatched (Phase 8). */
const CANCELLABLE = new Set<ScheduledTask["status"]>(["scheduled", "queued", "held"])

export class ScheduledTaskNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Scheduled task "${id}" not found`)
    this.name = "ScheduledTaskNotFoundError"
  }
}
export class InvalidScheduledTaskIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid scheduled task id: "${id}"`)
    this.name = "InvalidScheduledTaskIdError"
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
  implements OnModuleInit
{
  protected readonly fileExt = ".json"
  protected readonly idRegex = TASK_ID_REGEX

  constructor(@Inject(TASKS_DIR) dir: string) {
    super(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  /** A fresh collision-resistant task id (exposed so a run can be born linked). */
  newId(): string {
    return collisionResistantId("task")
  }

  /** Persist a fresh `scheduled` task built from the create input. */
  async create(
    input: CreateTaskInput & { scheduledAt: number },
    createdAt: string,
    projectId?: string,
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = {
      id: this.newId(),
      title: input.title ?? "",
      text: input.text,
      paths: input.paths ?? [],
      scheduledAt: input.scheduledAt,
      status: "scheduled",
      createdAt,
      ...(projectId ? { projectId } : {}),
    }
    await this.writeEntity(task)
    return task
  }

  /** Shared base for a pre-dispatch hold (`held` / `queued`): a task with no run yet. */
  private parkedTask(
    id: string,
    input: CreateTaskInput,
    status: "held" | "queued",
    projectId: string | undefined,
    now: number,
  ): ScheduledTask {
    return {
      id,
      title: input.title ?? "",
      text: input.text,
      paths: input.paths ?? [],
      scheduledAt: now,
      status,
      createdAt: new Date(now).toISOString(),
      ...(projectId ? { projectId } : {}),
    }
  }

  /** Persist a task held over a budget cap (Phase 8.1), carrying the reason. */
  async createHeld(
    id: string,
    input: CreateTaskInput,
    projectId: string | undefined,
    heldReason: string,
    now: number,
  ): Promise<ScheduledTask> {
    const task: ScheduledTask = { ...this.parkedTask(id, input, "held", projectId, now), heldReason }
    await this.writeEntity(task)
    return task
  }

  /** Persist a task queued behind a project's concurrency cap (Phase 8.2). */
  async createQueued(
    id: string,
    input: CreateTaskInput,
    projectId: string | undefined,
    now: number,
  ): Promise<ScheduledTask> {
    const task = this.parkedTask(id, input, "queued", projectId, now)
    await this.writeEntity(task)
    return task
  }

  /** Move an existing task to `held` with a reason (the tick fire path). */
  async markHeld(id: string, heldReason: string): Promise<ScheduledTask> {
    const existing = await this.get(id)
    const merged: ScheduledTask = { ...existing, status: "held", heldReason }
    await this.writeEntity(merged)
    return merged
  }

  /** Move an existing task to `queued` (the tick / release-at-capacity paths). */
  async markQueued(id: string): Promise<ScheduledTask> {
    const existing = await this.get(id)
    const merged: ScheduledTask = { ...existing, status: "queued" }
    await this.writeEntity(merged)
    return merged
  }

  /** Stamp the `spend-past-cap` approval onto a held task. */
  async setApproval(id: string, approvalId: string): Promise<ScheduledTask> {
    const existing = await this.get(id)
    const merged: ScheduledTask = { ...existing, approvalId }
    await this.writeEntity(merged)
    return merged
  }

  /**
   * Persist an immediately-dispatched task as a `dispatched` record (with the
   * pre-generated `id` its run was born linked to). `scheduledAt` is the dispatch
   * time — there was never a future fire time.
   */
  async createDispatched(
    id: string,
    input: CreateTaskInput,
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
      scheduledAt: now,
      status: "dispatched",
      createdAt: new Date(now).toISOString(),
      runRef,
      target,
      ...(projectId ? { projectId } : {}),
    }
    await this.writeEntity(task)
    return task
  }

  /**
   * Write a dispatched run's terminal outcome onto its task — idempotent: the
   * first write wins (the fast path and the catch-up sweep may both fire).
   */
  async writeOutcome(id: string, outcome: TaskOutcome): Promise<ScheduledTask> {
    const existing = await this.get(id)
    if (existing.outcome) return existing
    const merged: ScheduledTask = { ...existing, outcome }
    await this.writeEntity(merged)
    return merged
  }

  /** Stamp a task dispatched: record the chosen target and the started run's ref. */
  async markDispatched(id: string, runRef: string, target: TaskTarget): Promise<ScheduledTask> {
    const existing = await this.get(id)
    const merged: ScheduledTask = { ...existing, status: "dispatched", runRef, target }
    await this.writeEntity(merged)
    return merged
  }

  /** Stamp a task failed with a short reason (kept for the queue's display). */
  async markFailed(id: string, error: string): Promise<ScheduledTask> {
    const existing = await this.get(id)
    const merged: ScheduledTask = { ...existing, status: "failed", error }
    await this.writeEntity(merged)
    return merged
  }

  /**
   * Mark a still-waiting task cancelled. Phase 8 widens "waiting" from `scheduled`
   * to also cover `queued` and `held` (a task that never dispatched); a task that
   * already dispatched/failed/cancelled is returned as-is. Cancelling a HELD task's
   * approval is routed through the approvals service by the caller (single source of
   * truth) — this only flips the record.
   */
  async cancel(id: string): Promise<ScheduledTask> {
    const existing = await this.get(id)
    if (!CANCELLABLE.has(existing.status)) return existing
    const merged: ScheduledTask = { ...existing, status: "cancelled" }
    await this.writeEntity(merged)
    return merged
  }

  protected idOf(task: ScheduledTask): string {
    return task.id
  }

  protected serialize(task: ScheduledTask): string {
    return JSON.stringify(task)
  }

  protected tryParse(raw: string): ScheduledTask | null {
    const parsed = ScheduledTaskSchema.safeParse(safeJson(raw))
    return parsed.success ? parsed.data : null
  }

  /** Newest first — the queue reads most-recent at the top. */
  protected compare(a: ScheduledTask, b: ScheduledTask): number {
    return b.createdAt.localeCompare(a.createdAt)
  }

  protected notFound(id: string): Error {
    return new ScheduledTaskNotFoundError(id)
  }

  protected invalidId(id: string): Error {
    return new InvalidScheduledTaskIdError(id)
  }
}
