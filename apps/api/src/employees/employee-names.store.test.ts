import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EMPLOYEE_NAME_SEED, EmployeeNamesStore } from "./employee-names.store";
import {
  EmployeeNameConflictError,
  EmployeeNameInUseError,
  EmployeeNameNotFoundError,
  EmployeeNamePoolEmptyError,
  EmployeeNameUnavailableError,
} from "./employees.errors";

describe("EmployeeNamesStore", () => {
  let dir: string;
  let store: EmployeeNamesStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-employee-names-"));
    store = new EmployeeNamesStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("seeds the full PART-E pool (in name order) the first time it's read, when the manifest is absent", async () => {
    const names = await store.list();
    expect(names.map((n) => n.name)).toEqual(
      [...EMPLOYEE_NAME_SEED].sort((a, b) => a.localeCompare(b)),
    );
    expect(names.every((n) => !n.employeeId)).toBe(true);
  });

  it("persists the seed to disk on first read (a second store instance sees the SAME entries)", async () => {
    const first = await store.list();
    const second = new EmployeeNamesStore(dir);
    const reread = await second.list();
    expect(reread.map((n) => n.id).sort()).toEqual(first.map((n) => n.id).sort());
  });

  it("get() resolves a known id, throws EmployeeNameNotFoundError for an unknown one", async () => {
    const [first] = await store.list();
    expect(await store.get(first!.id)).toEqual(first);
    await expect(store.get("empname_ghost")).rejects.toBeInstanceOf(EmployeeNameNotFoundError);
  });

  describe("create() — name uniqueness", () => {
    it("adds a new name outside the seed pool", async () => {
      const created = await store.create("Custom");
      expect(created.name).toBe("Custom");
      const names = await store.list();
      expect(names.some((n) => n.id === created.id)).toBe(true);
    });

    it("rejects a duplicate name — 409 EmployeeNameConflictError", async () => {
      await store.create("Custom");
      await expect(store.create("Custom")).rejects.toBeInstanceOf(EmployeeNameConflictError);
    });

    it("rejects a name that collides with an already-seeded pool entry", async () => {
      await expect(store.create(EMPLOYEE_NAME_SEED[0]!)).rejects.toBeInstanceOf(
        EmployeeNameConflictError,
      );
    });
  });

  describe("rename()", () => {
    it("renames an existing entry", async () => {
      const created = await store.create("Old");
      const renamed = await store.rename(created.id, "New");
      expect(renamed.name).toBe("New");
      expect((await store.get(created.id)).name).toBe("New");
    });

    it("throws EmployeeNameNotFoundError for an unknown id", async () => {
      await expect(store.rename("empname_ghost", "New")).rejects.toBeInstanceOf(
        EmployeeNameNotFoundError,
      );
    });

    it("rejects renaming onto an ALREADY-TAKEN name (conflict)", async () => {
      await store.create("Alpha");
      const beta = await store.create("Beta");
      await expect(store.rename(beta.id, "Alpha")).rejects.toBeInstanceOf(
        EmployeeNameConflictError,
      );
    });

    it("renaming onto its OWN current name is not a self-conflict", async () => {
      const created = await store.create("Alpha");
      await expect(store.rename(created.id, "Alpha")).resolves.toMatchObject({ name: "Alpha" });
    });
  });

  describe("delete()", () => {
    it("deletes a free (unclaimed) name", async () => {
      const created = await store.create("Temp");
      await store.delete(created.id);
      await expect(store.get(created.id)).rejects.toBeInstanceOf(EmployeeNameNotFoundError);
    });

    it("throws EmployeeNameNotFoundError for an unknown id", async () => {
      await expect(store.delete("empname_ghost")).rejects.toBeInstanceOf(EmployeeNameNotFoundError);
    });

    it("409s deleting a name currently IN USE (held by an employee)", async () => {
      const claimed = await store.claimAndAssign(undefined, "employee_1");
      await expect(store.delete(claimed.id)).rejects.toBeInstanceOf(EmployeeNameInUseError);
    });
  });

  describe("claimAndAssign() / releaseByEmployeeId()", () => {
    it("claims the first free pool entry (pool order) when no preferred name is given", async () => {
      // "Pool order" is the SEED's own order (Kevin first) — `claimAndAssign` reads
      // the raw manifest, not `list()`'s alphabetized display order.
      const claimed = await store.claimAndAssign(undefined, "employee_1");
      expect(claimed.name).toBe(EMPLOYEE_NAME_SEED[0]);
      expect(claimed.employeeId).toBe("employee_1");
    });

    it("claims a specific preferred name when free", async () => {
      const claimed = await store.claimAndAssign("Ziggy", "employee_1");
      expect(claimed.name).toBe("Ziggy");
    });

    it("409s an ALREADY-CLAIMED preferred name (EmployeeNameUnavailableError)", async () => {
      await store.claimAndAssign("Ziggy", "employee_1");
      await expect(store.claimAndAssign("Ziggy", "employee_2")).rejects.toBeInstanceOf(
        EmployeeNameUnavailableError,
      );
    });

    it("409s an UNKNOWN preferred name (EmployeeNameUnavailableError)", async () => {
      await expect(store.claimAndAssign("Nonexistent", "employee_1")).rejects.toBeInstanceOf(
        EmployeeNameUnavailableError,
      );
    });

    it("throws EmployeeNamePoolEmptyError when every entry is claimed and none was requested", async () => {
      for (let i = 0; i < EMPLOYEE_NAME_SEED.length; i++) {
        await store.claimAndAssign(undefined, `employee_${i}`);
      }
      await expect(store.claimAndAssign(undefined, "employee_overflow")).rejects.toBeInstanceOf(
        EmployeeNamePoolEmptyError,
      );
    });

    it("releaseByEmployeeId() returns a claimed name to the free pool", async () => {
      const claimed = await store.claimAndAssign("Ziggy", "employee_1");
      await store.releaseByEmployeeId("employee_1");
      const again = await store.claimAndAssign("Ziggy", "employee_2");
      expect(again.id).toBe(claimed.id);
      expect(again.employeeId).toBe("employee_2");
    });

    it("releaseByEmployeeId() is a harmless no-op for an employee that holds no name", async () => {
      await expect(store.releaseByEmployeeId("nobody")).resolves.toBeUndefined();
    });
  });
});
