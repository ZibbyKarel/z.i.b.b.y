import { Injectable } from "@nestjs/common";
import type { DepartmentId } from "@zibby/contracts";
import { EmployeesStorageService } from "./employees.storage.service";
import { NoEmployeeError } from "./employees.errors";

/** A held employee lease — the caller records `employeeId`/`employeeName` and releases it when the work ends. */
export interface EmployeeLease {
  employeeId: string;
  employeeName: string;
  department: DepartmentId;
  agentId: string;
  /** The run id the lease is held for, when known (surfaces in `busy()`). */
  runId?: string;
}

/** Context a caller may attach to a lease — currently just the run id, for `busy()`. */
export interface AcquireContext {
  runId?: string;
}

function keyOf(department: DepartmentId, agentId: string): string {
  return `${department}::${agentId}`;
}

/**
 * D-015 — the in-memory broker between a pipeline stage / single-agent dispatch
 * and the department's hired employees. `acquire` leases a FREE active employee
 * of `agentId` (the position) inside `department`; when every matching employee
 * is busy it waits FIFO (queued behind any earlier caller for the SAME
 * `(department, agentId)` pair — a different position or department is fully
 * independent and never blocks on this one). Everything here is in-memory: a
 * lease does not survive an API restart, because boot re-dispatch re-acquires it
 * (mirrors the retries/limit park machinery's own restart posture).
 *
 * FIFO is implemented as a per-key promise CHAIN (the same idiom
 * `shared/file-storage/file-lock.ts` uses for a path lock): each `acquire` call
 * only starts its own "find a free employee, or wait" work once the PREVIOUS
 * caller for that key has itself succeeded in acquiring one. This means a caller
 * that arrives while a slot is already free still queues behind an earlier
 * caller that is still waiting — never cuts the line — while two different
 * `(department, agentId)` keys stay fully concurrent.
 */
@Injectable()
export class EmployeeAllocator {
  /** employeeId -> the run id it is leased to (or undefined when the caller gave none). */
  private readonly leased = new Map<string, string | undefined>();
  /** Per-key FIFO chain tail (mirrors `withPathLock`'s `tails` map). */
  private readonly chains = new Map<string, Promise<unknown>>();
  /** Per-key list of "a slot just freed" wake-ups, consumed one at a time by the head waiter. */
  private readonly wakers = new Map<string, Array<() => void>>();

  constructor(private readonly employees: EmployeesStorageService) {}

  /**
   * Lease a free active employee of `agentId` in `department`. Resolves once a
   * slot is both free AND this call's turn in the FIFO queue has come. Rejects
   * with {@link NoEmployeeError} when the department owns no active employee of
   * that position at all — a park condition, never queued.
   */
  acquire(
    department: DepartmentId,
    agentId: string,
    ctx: AcquireContext = {},
  ): Promise<EmployeeLease> {
    const key = keyOf(department, agentId);
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.then(
      () => this.doAcquire(department, agentId, key, ctx),
      () => this.doAcquire(department, agentId, key, ctx),
    );
    // Swallow so a rejected acquire never poisons the chain for the next waiter,
    // while `run` itself (returned to THIS caller) still rejects normally.
    this.chains.set(
      key,
      run.catch(() => {}),
    );
    return run;
  }

  /** Release a held lease and wake the longest-waiting queued caller for its key, if any. */
  release(lease: EmployeeLease): void {
    this.leased.delete(lease.employeeId);
    const key = keyOf(lease.department, lease.agentId);
    const queue = this.wakers.get(key);
    const next = queue?.shift();
    next?.();
  }

  /** True while `employeeId` holds a lease — the fire-while-leased 409 guard. */
  isBusy(employeeId: string): boolean {
    return this.leased.has(employeeId);
  }

  /** A snapshot of every held lease: employee id -> the run id it is leased to (if known). */
  busy(): ReadonlyMap<string, string | undefined> {
    return new Map(this.leased);
  }

  private async doAcquire(
    department: DepartmentId,
    agentId: string,
    key: string,
    ctx: AcquireContext,
  ): Promise<EmployeeLease> {
    for (;;) {
      const roster = await this.employees.listActiveByPosition(department, agentId);
      if (roster.length === 0) throw new NoEmployeeError(department, agentId);
      const free = roster.find((e) => !this.leased.has(e.id));
      if (free) {
        this.leased.set(free.id, ctx.runId);
        return {
          employeeId: free.id,
          employeeName: free.name,
          department,
          agentId,
          runId: ctx.runId,
        };
      }
      await new Promise<void>((resolve) => {
        const queue = this.wakers.get(key) ?? [];
        queue.push(resolve);
        this.wakers.set(key, queue);
      });
    }
  }
}
