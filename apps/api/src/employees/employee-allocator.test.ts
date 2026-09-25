import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { DepartmentId, Employee } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
