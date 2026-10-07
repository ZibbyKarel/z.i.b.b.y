import { Injectable } from "@nestjs/common";
import type { DepartmentId } from "@zibby/contracts";
import { EmployeesStorageService } from "./employees.storage.service";
import { NoEmployeeError } from "./employees.errors";
import { GrantQueue, type GrantRank } from "./grant-order";

/** A held employee lease — the caller records `employeeId`/`employeeName` and releases it when the work ends. */
export interface EmployeeLease {
  employeeId: string;
  employeeName: string;
  department: DepartmentId;
  agentId: string;
  /** The run id the lease is held for, when known (surfaces in `busy()`). */
  runId?: string;
}

/** Context a caller may attach to a lease: the run id (for `busy()`) and its grant rank. */
export interface AcquireContext {
  runId?: string;
  rank?: GrantRank;
}

interface Waiter {
  ctx: AcquireContext;
  resolve: (lease: EmployeeLease) => void;
}

function keyOf(department: DepartmentId, agentId: string): string {
  return `${department}::${agentId}`;
}

/**
 * D-015 — the in-memory broker between a workflow stage / single-agent dispatch
 * and the department's hired employees. `acquire` leases a FREE active employee
 * of `agentId` (the position) inside `department`; when every matching employee
 * is busy it waits in a ranked {@link GrantQueue} per `(department, agentId)`
 * pair (progress, then project round-robin, then FIFO — see `grant-order.ts`).
 * A different position or department is fully independent. A newcomer never cuts
 * an existing line, and `release` hands the employee straight to the best waiter.
 * Everything here is in-memory: a lease does not survive an API restart, because
 * boot re-dispatch re-acquires it.
 */
@Injectable()
export class EmployeeAllocator {
  /** employeeId -> the run id it is leased to (or undefined when the caller gave none). */
  private readonly leased = new Map<string, string | undefined>();
  private readonly queues = new Map<string, GrantQueue<Waiter>>();
  private gate: Promise<unknown> = Promise.resolve();
  private readonly freedListeners = new Set<() => void>();

  constructor(private readonly employees: EmployeesStorageService) {}

  /**
   * Lease a free active employee of `agentId` in `department`, waiting (ranked)
   * when none is free. Rejects with {@link NoEmployeeError} when no active
   * employee of that position exists at all — a park condition, never queued.
   * A department without the position borrows one from the department that has
   * it; the lease then carries the employee's own department.
   */
  async acquire(
    requested: DepartmentId,
    agentId: string,
    ctx: AcquireContext = {},
  ): Promise<EmployeeLease> {
    return new Promise<EmployeeLease>((resolve, reject) => {
      this.serialized(async () => {
        const department = await this.owningDepartment(requested, agentId);
        return this.lease(department, agentId, ctx, { ctx, resolve });
      }).then((lease) => lease && resolve(lease), reject);
    });
  }

  /** Like {@link acquire} but never waits: null when busy or a line already exists. */
  async tryAcquire(
    requested: DepartmentId,
    agentId: string,
    ctx: AcquireContext = {},
  ): Promise<EmployeeLease | null> {
    return this.serialized(async () =>
      this.lease(await this.owningDepartment(requested, agentId), agentId, ctx),
    );
  }

  /**
   * Would a lease for this position be granted right now? A read-only probe the task
   * scheduler uses before dispatching a workflow (it reserves nothing — the runner
   * leases per stage). No employee anywhere → `true`: the runner parks `no-employee`
   * (decision 6), so the task must not sit queued for a hire. Through the admission
   * gate, so the answer reflects every in-flight acquire.
   */
  async canStaffNow(requested: DepartmentId, agentId: string): Promise<boolean> {
    return this.serialized(async () => {
      const department = await this.owningDepartment(requested, agentId);
      const roster = await this.employees.listActiveByPosition(department, agentId);
      if (roster.length === 0) return true;
      if ((this.queues.get(keyOf(department, agentId))?.size ?? 0) > 0) return false;
      return roster.some((e) => !this.leased.has(e.id));
    });
  }

  /**
   * Admission is serialized in call order: each call's roster read + decision runs
   * after the previous one's, so FIFO follows arrival order, not file-read latency.
   * ponytail: one global gate; per-(department, agent) gates if roster reads ever get slow.
   */
  private serialized<T>(step: () => Promise<T>): Promise<T> {
    const run = this.gate.then(step);
    this.gate = run.catch(() => {});
    return run;
  }

  /**
   * One roster read, then a synchronous section (no await) that either takes a free
   * employee or, when `waiter` is given, enqueues the waiter — so a release cannot
   * slip in between "nothing free" and "waiting" and strand the waiter.
   */
  private async lease(
    department: DepartmentId,
    agentId: string,
    ctx: AcquireContext,
    waiter?: Waiter,
  ): Promise<EmployeeLease | null> {
    const roster = await this.employees.listActiveByPosition(department, agentId);
    if (roster.length === 0) throw new NoEmployeeError(department, agentId);
    const queue = this.queueFor(keyOf(department, agentId));
    const free = queue.size > 0 ? undefined : roster.find((e) => !this.leased.has(e.id)); // never cut the line
    if (!free) {
      if (waiter) queue.enqueue(ctx.rank ?? {}, waiter);
      return null;
    }
    queue.noteGrant(ctx.rank?.projectId);
    this.leased.set(free.id, ctx.runId);
    return { employeeId: free.id, employeeName: free.name, department, agentId, runId: ctx.runId };
  }

  /** `requested` when it holds the position, else the first department that does. */
  private async owningDepartment(requested: DepartmentId, agentId: string): Promise<DepartmentId> {
    if ((await this.employees.listActiveByPosition(requested, agentId)).length > 0)
      return requested;
    const elsewhere = await this.employees.listActiveByPositionAnyDepartment(agentId);
    return elsewhere[0]?.department ?? requested;
  }

  /** Release a lease: hand it straight to the best waiter, else free it and notify `onFreed`. */
  release(lease: EmployeeLease): void {
    if (!this.leased.has(lease.employeeId)) return; // double or ghost release
    const next = this.queues.get(keyOf(lease.department, lease.agentId))?.shift();
    if (next) {
      // Direct hand-off: the employee never becomes free, so nobody can snipe it
      // between the release and the waiter's resumption.
      this.leased.set(lease.employeeId, next.ctx.runId);
      next.resolve({ ...lease, runId: next.ctx.runId });
      return;
    }
    this.leased.delete(lease.employeeId);
    for (const listener of this.freedListeners) listener();
  }

  /**
   * A hire (or re-activation) may have made someone free — hand them to waiters, then
   * fire `onFreed` if someone is still free (the task scheduler's staff-waiting queue
   * is not an allocator waiter, so it only learns of the hire this way).
   */
  async rosterChanged(department: DepartmentId, agentId: string): Promise<void> {
    // Through the admission gate, so an in-flight acquire has decided (taken or enqueued) first.
    await this.serialized(async () => {
      const queue = this.queues.get(keyOf(department, agentId));
      const roster = await this.employees.listActiveByPosition(department, agentId);
      for (const e of roster) {
        if (!queue || queue.size === 0) break;
        if (this.leased.has(e.id)) continue;
        const next = queue.shift()!;
        this.leased.set(e.id, next.ctx.runId);
        next.resolve({
          employeeId: e.id,
          employeeName: e.name,
          department,
          agentId,
          runId: next.ctx.runId,
        });
      }
      if (roster.some((e) => !this.leased.has(e.id))) {
        for (const listener of this.freedListeners) listener();
      }
    });
  }

  /** Subscribe to "an employee became free with nobody waiting"; returns the unsubscribe. */
  onFreed(listener: () => void): () => void {
    this.freedListeners.add(listener);
    return () => this.freedListeners.delete(listener);
  }

  private queueFor(key: string): GrantQueue<Waiter> {
    let q = this.queues.get(key);
    if (!q) {
      q = new GrantQueue<Waiter>();
      this.queues.set(key, q);
    }
    return q;
  }

  /** True while `employeeId` holds a lease — the fire-while-leased 409 guard. */
  isBusy(employeeId: string): boolean {
    return this.leased.has(employeeId);
  }

  /** A snapshot of every held lease: employee id -> the run id it is leased to (if known). */
  busy(): ReadonlyMap<string, string | undefined> {
    return new Map(this.leased);
  }
}
