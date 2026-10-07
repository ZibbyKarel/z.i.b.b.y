import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { DepartmentId, Employee } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeAllocator } from "./employee-allocator";
import { NoEmployeeError } from "./employees.errors";
import { EmployeesStorageService } from "./employees.storage.service";

function employee(
  id: string,
  agentId: string,
  department: DepartmentId,
  status: Employee["status"] = "active",
): Employee {
  return { id, name: id, agentId, department, status, hiredAt: "2026-01-01T00:00:00.000Z" };
}

/** A small helper that resolves once a promise has NOT settled after a macrotask flush. */
async function stillPending(p: Promise<unknown>): Promise<boolean> {
  const PENDING = Symbol("pending");
  const result = await Promise.race([p, new Promise((r) => setTimeout(() => r(PENDING), 0))]);
  return result === PENDING;
}

describe("EmployeeAllocator", () => {
  let dir: string;
  let store: EmployeesStorageService;
  let allocator: EmployeeAllocator;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-employee-allocator-"));
    store = new EmployeesStorageService(dir);
    allocator = new EmployeeAllocator(store);
  });

  /** Barrier: admission is serialized, so once this no-op call returns every earlier acquire has decided. */
  const settle = () => allocator.tryAcquire("dev", "no-such-position").catch(() => null);

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("throws NoEmployeeError when the department has no employee of the position at all", async () => {
    await expect(allocator.acquire("dev", "koder")).rejects.toBeInstanceOf(NoEmployeeError);
  });

  it("leases the sole free active employee and marks it busy", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const lease = await allocator.acquire("dev", "koder");
    expect(lease).toMatchObject({
      employeeId: "e1",
      employeeName: "e1",
      department: "dev",
      agentId: "koder",
    });
    expect(allocator.isBusy("e1")).toBe(true);
    expect(allocator.busy().get("e1")).toBeUndefined();
  });

  it("skips a FIRED employee of the same position", async () => {
    await store.create(employee("e1", "koder", "dev", "fired"));
    await expect(allocator.acquire("dev", "koder")).rejects.toBeInstanceOf(NoEmployeeError);
  });

  it("records the caller's runId in busy()", async () => {
    await store.create(employee("e1", "koder", "dev"));
    await allocator.acquire("dev", "koder", { runId: "run_1" });
    expect(allocator.busy().get("e1")).toBe("run_1");
  });

  it("a second acquire for a fully-busy position queues, and release() wakes it FIFO", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const first = await allocator.acquire("dev", "koder", { runId: "run_1" });
    const secondPromise = allocator.acquire("dev", "koder", { runId: "run_2" });
    // Still queued — the only employee is held by the first lease.
    expect(await stillPending(secondPromise)).toBe(true);

    allocator.release(first);
    const second = await secondPromise;
    expect(second.employeeId).toBe("e1");
    expect(allocator.busy().get("e1")).toBe("run_2");
  });

  it("FIFO order: three queued waiters resolve in arrival order, never out of turn", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const first = await allocator.acquire("dev", "koder", { runId: "run_1" });
    const order: string[] = [];
    const second = allocator.acquire("dev", "koder", { runId: "run_2" }).then((l) => {
      order.push("run_2");
      return l;
    });
    const third = allocator.acquire("dev", "koder", { runId: "run_3" }).then((l) => {
      order.push("run_3");
      return l;
    });

    allocator.release(first);
    const secondLease = await second;
    allocator.release(secondLease);
    await third;

    expect(order).toEqual(["run_2", "run_3"]);
  });

  it("two employees of the SAME position let two acquires proceed concurrently, no queueing", async () => {
    await store.create(employee("e1", "koder", "dev"));
    await store.create(employee("e2", "koder", "dev"));
    const [a, b] = await Promise.all([
      allocator.acquire("dev", "koder", { runId: "run_1" }),
      allocator.acquire("dev", "koder", { runId: "run_2" }),
    ]);
    expect(new Set([a.employeeId, b.employeeId])).toEqual(new Set(["e1", "e2"]));
  });

  it("different positions never block each other, even in the same department", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const koderLease = await allocator.acquire("dev", "koder");
    // No employee of "architekt" exists — this must reject immediately, not hang
    // behind the (unrelated) koder lease.
    await expect(allocator.acquire("dev", "architekt")).rejects.toBeInstanceOf(NoEmployeeError);
    expect(allocator.isBusy(koderLease.employeeId)).toBe(true);
  });

  it("different departments for the same position never block each other", async () => {
    await store.create(employee("e-dev", "koder", "dev"));
    await store.create(employee("e-rnd", "koder", "rnd"));
    const [dev, rnd] = await Promise.all([
      allocator.acquire("dev", "koder"),
      allocator.acquire("rnd", "koder"),
    ]);
    expect(dev.employeeId).toBe("e-dev");
    expect(rnd.employeeId).toBe("e-rnd");
  });

  it("borrows the position from another department when the requested one has none", async () => {
    await store.create(employee("e-des", "illustrator", "des"));
    const lease = await allocator.acquire("pub", "illustrator");
    expect(lease).toMatchObject({ employeeId: "e-des", department: "des" });
    // The borrowed employee is busy for everyone; release frees it under its own department.
    const waiting = allocator.acquire("des", "illustrator");
    expect(await stillPending(waiting)).toBe(true);
    allocator.release(lease);
    await expect(waiting).resolves.toMatchObject({ employeeId: "e-des" });
  });

  it("release() on an unheld employee id is a harmless no-op (no waiters to wake)", () => {
    expect(() =>
      allocator.release({
        employeeId: "ghost",
        employeeName: "Ghost",
        department: "dev",
        agentId: "koder",
      }),
    ).not.toThrow();
  });

  it("tryAcquire returns null when the only employee is leased, and when a waiter is queued", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const lease = await allocator.tryAcquire("dev", "koder");
    expect(lease?.employeeId).toBe("e1");
    expect(await allocator.tryAcquire("dev", "koder")).toBeNull();
    const waiting = allocator.acquire("dev", "koder");
    expect(await stillPending(waiting)).toBe(true);
    // Free it via hand-off to the waiter; with a line present a newcomer still gets null.
    const waiting2 = allocator.acquire("dev", "koder");
    expect(await stillPending(waiting2)).toBe(true);
    allocator.release(lease!);
    const handed = await waiting;
    expect(await allocator.tryAcquire("dev", "koder")).toBeNull();
    allocator.release(handed);
    allocator.release(await waiting2);
  });

  it("tryAcquire returns null for a free employee while a waiter is queued (never cuts the line)", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const held = await allocator.acquire("dev", "koder");
    const waiting = allocator.acquire("dev", "koder");
    await stillPending(waiting);
    await store.create(employee("e2", "koder", "dev"));
    expect(await allocator.tryAcquire("dev", "koder")).toBeNull();
    allocator.release(held);
    await waiting;
  });

  it("release hands the employee to the highest-progress waiter, not the earliest", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const held = await allocator.acquire("dev", "koder");
    const early = allocator.acquire("dev", "koder", { runId: "early", rank: { progress: 0.1 } });
    await settle();
    const late = allocator.acquire("dev", "koder", { runId: "late", rank: { progress: 0.9 } });
    await settle();
    allocator.release(held);
    await expect(late).resolves.toMatchObject({ employeeId: "e1", runId: "late" });
    expect(await stillPending(early)).toBe(true);
  });

  it("onFreed fires on a release with no waiter, not on a hand-off", async () => {
    await store.create(employee("e1", "koder", "dev"));
    let freed = 0;
    const off = allocator.onFreed(() => freed++);
    const held = await allocator.acquire("dev", "koder");
    const waiting = allocator.acquire("dev", "koder");
    await settle();
    allocator.release(held);
    expect(freed).toBe(0);
    allocator.release(await waiting);
    expect(freed).toBe(1);
    off();
    const again = await allocator.acquire("dev", "koder");
    allocator.release(again);
    expect(freed).toBe(1);
  });

  it("rosterChanged after a hire resolves a waiting acquire", async () => {
    await store.create(employee("e1", "koder", "dev"));
    await allocator.acquire("dev", "koder");
    const waiting = allocator.acquire("dev", "koder");
    expect(await stillPending(waiting)).toBe(true);
    await store.create(employee("e2", "koder", "dev"));
    await allocator.rosterChanged("dev", "koder");
    await expect(waiting).resolves.toMatchObject({ employeeId: "e2" });
  });

  it("a release landing between acquire's roster read and its enqueue still resolves it", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const held = await allocator.acquire("dev", "koder");
    const realList = store.listActiveByPosition.bind(store);
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const spy = vi.spyOn(store, "listActiveByPosition").mockImplementation(async (...args) => {
      const roster = await realList(...args);
      await gate; // the read is "in flight" until we say so
      return roster;
    });
    const waiting = allocator.acquire("dev", "koder", { runId: "w" });
    await new Promise((r) => setTimeout(r, 20));
    allocator.release(held); // lands while the waiter's read is pending
    open();
    await expect(waiting).resolves.toMatchObject({ employeeId: "e1", runId: "w" });
    spy.mockRestore();
  });

  it("a double release is a no-op (onFreed fires once)", async () => {
    await store.create(employee("e1", "koder", "dev"));
    let freed = 0;
    allocator.onFreed(() => freed++);
    const held = await allocator.acquire("dev", "koder");
    allocator.release(held);
    allocator.release(held);
    expect(freed).toBe(1);
    expect(allocator.isBusy("e1")).toBe(false);
  });

  it("canStaffNow: free → true; leased or queued line → false; no employee anywhere → true", async () => {
    expect(await allocator.canStaffNow("dev", "koder")).toBe(true); // nobody hired: runner parks
    await store.create(employee("e1", "koder", "dev"));
    expect(await allocator.canStaffNow("dev", "koder")).toBe(true);
    // Not issued after the acquire resolves: the probe must see the in-flight admission.
    const held = allocator.acquire("dev", "koder");
    expect(await allocator.canStaffNow("dev", "koder")).toBe(false);
    const waiting = allocator.acquire("dev", "koder");
    allocator.release(await held); // hands e1 to the waiter
    expect(await allocator.canStaffNow("qa", "koder")).toBe(false); // borrowed department, still busy
    allocator.release(await waiting);
    expect(await allocator.canStaffNow("dev", "koder")).toBe(true);
  });

  it("rosterChanged fires onFreed when a hire leaves someone free (scheduler-queued tasks drain)", async () => {
    await store.create(employee("e1", "koder", "dev"));
    const held = await allocator.acquire("dev", "koder");
    const waiting = allocator.acquire("dev", "koder"); // an allocator waiter takes the 1st hire
    let freed = 0;
    allocator.onFreed(() => freed++);
    await store.create(employee("e2", "koder", "dev"));
    await allocator.rosterChanged("dev", "koder");
    await expect(waiting).resolves.toMatchObject({ employeeId: "e2" });
    expect(freed).toBe(0); // everyone leased — nothing to announce
    await store.create(employee("e3", "koder", "dev"));
    await allocator.rosterChanged("dev", "koder"); // no waiter at all
    expect(freed).toBe(1);
    allocator.release(held);
  });
});
