import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Agent } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentsStorageService } from "../agents/agents.storage.service";
import { EmployeeAllocator } from "./employee-allocator";
import { EmployeeNamesStore } from "./employee-names.store";
import {
  EmployeeDepartmentNotFoundError,
  EmployeeLeasedError,
  EmployeeNameUnavailableError,
} from "./employees.errors";
import { EmployeesService } from "./employees.service";
import { EmployeesStorageService } from "./employees.storage.service";

function fakeAgents(ids: string[]): AgentsStorageService {
  return {
    get: (id: string) => {
      if (!ids.includes(id)) return Promise.reject(new Error(`agent "${id}" not found`));
      return Promise.resolve({ id, name: id, category: "Test" } as Agent);
    },
  } as unknown as AgentsStorageService;
}

describe("EmployeesService", () => {
  let employeesDir: string;
  let namesDir: string;
  let employees: EmployeesStorageService;
  let names: EmployeeNamesStore;
  let allocator: EmployeeAllocator;
  let service: EmployeesService;

  beforeEach(async () => {
    employeesDir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-employees-svc-"));
    namesDir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-employee-names-svc-"));
    employees = new EmployeesStorageService(employeesDir);
    names = new EmployeeNamesStore(namesDir);
    allocator = new EmployeeAllocator(employees);
    service = new EmployeesService(employees, names, fakeAgents(["koder", "architekt"]), allocator);
  });

  afterEach(async () => {
    await fs.rm(employeesDir, { recursive: true, force: true });
    await fs.rm(namesDir, { recursive: true, force: true });
  });

  describe("hire()", () => {
    it("hires the position into the department, claiming the first free pool name", async () => {
      const hired = await service.hire("dev", { agentId: "koder" });
      expect(hired).toMatchObject({ agentId: "koder", department: "dev", status: "active" });
      expect(hired.name).toBeTruthy();
      expect(await employees.get(hired.id)).toMatchObject(hired);
    });

    it("hires with a specific requested name when free", async () => {
      const hired = await service.hire("dev", { agentId: "koder", name: "Ziggy" });
      expect(hired.name).toBe("Ziggy");
    });

    it("409s (EmployeeNameUnavailableError) hiring with an already-claimed name", async () => {
      await service.hire("dev", { agentId: "koder", name: "Ziggy" });
      await expect(
        service.hire("dev", { agentId: "architekt", name: "Ziggy" }),
      ).rejects.toBeInstanceOf(EmployeeNameUnavailableError);
    });

    it("rejects hiring into an unknown department (EmployeeDepartmentNotFoundError)", async () => {
      await expect(service.hire("ghost-dept", { agentId: "koder" })).rejects.toBeInstanceOf(
        EmployeeDepartmentNotFoundError,
      );
    });

    it("propagates an unknown position (agent) — no employee record or name claim is left behind", async () => {
      await expect(service.hire("dev", { agentId: "ghost-agent" })).rejects.toThrow();
      expect(await employees.list()).toHaveLength(0);
      // The name pool is untouched — nothing was claimed for the failed hire.
      expect((await names.list()).every((n) => !n.employeeId)).toBe(true);
    });
  });

  describe("fire()", () => {
    it("soft-fires: status flips, firedAt is set, and the held name RETURNS TO THE POOL", async () => {
      const hired = await service.hire("dev", { agentId: "koder", name: "Ziggy" });
      const fired = await service.fire(hired.id);
      expect(fired.status).toBe("fired");
      expect(fired.firedAt).toBeTruthy();

      // The name is free again — a second hire can claim it.
      const rehired = await service.hire("dev", { agentId: "architekt", name: "Ziggy" });
      expect(rehired.name).toBe("Ziggy");
    });

    it("is idempotent — firing an already-fired employee is a no-op that returns it unchanged", async () => {
      const hired = await service.hire("dev", { agentId: "koder" });
      const first = await service.fire(hired.id);
      const second = await service.fire(hired.id);
      expect(second).toEqual(first);
    });

    it("refuses to fire an employee currently holding a leased run (EmployeeLeasedError)", async () => {
      const hired = await service.hire("dev", { agentId: "koder" });
      await allocator.acquire("dev", "koder", { runId: "run_1" });
      await expect(service.fire(hired.id)).rejects.toBeInstanceOf(EmployeeLeasedError);
    });
  });

  describe("update()", () => {
    it("renames: releases the old name and claims the new one", async () => {
      const hired = await service.hire("dev", { agentId: "koder", name: "Kevin" });
      const renamed = await service.update(hired.id, { name: "Stuart" });
      expect(renamed.name).toBe("Stuart");
      // "Kevin" is free again.
      const other = await service.hire("dev", { agentId: "architekt", name: "Kevin" });
      expect(other.name).toBe("Kevin");
    });

    it("rolls back a failed rename — the old name is reclaimed, not left unheld", async () => {
      await service.hire("dev", { agentId: "architekt", name: "Stuart" });
      const hired = await service.hire("dev", { agentId: "koder", name: "Kevin" });
      await expect(service.update(hired.id, { name: "Stuart" })).rejects.toBeInstanceOf(
        EmployeeNameUnavailableError,
      );
      // "Kevin" still belongs to the employee that tried (and failed) to rename.
      const names_ = await names.list();
      const kevin = names_.find((n) => n.name === "Kevin");
      expect(kevin?.employeeId).toBe(hired.id);
    });

    it("moves department", async () => {
      const hired = await service.hire("dev", { agentId: "koder" });
      const moved = await service.update(hired.id, { department: "rnd" });
      expect(moved.department).toBe("rnd");
    });

    it("rejects a move to an unknown department", async () => {
      const hired = await service.hire("dev", { agentId: "koder" });
      await expect(
        service.update(hired.id, { department: "ghost-dept" as never }),
      ).rejects.toBeInstanceOf(EmployeeDepartmentNotFoundError);
    });
  });

  describe("list() / get() — state projection", () => {
    it("marks a leased employee 'working' with its runId, else 'idle'", async () => {
      const hired = await service.hire("dev", { agentId: "koder" });
      const idle = await service.get(hired.id);
      expect(idle.state).toBe("idle");
      expect(idle.currentRunId).toBeUndefined();

      await allocator.acquire("dev", "koder", { runId: "run_42" });
      const working = await service.get(hired.id);
      expect(working.state).toBe("working");
      expect(working.currentRunId).toBe("run_42");
    });

    it("filters by department/agentId/status", async () => {
      const a = await service.hire("dev", { agentId: "koder" });
      await service.hire("rnd", { agentId: "architekt" });
      await service.fire(a.id);

      expect((await service.list({})).map((e) => e.id).sort()).toHaveLength(2);
      expect(await service.list({ department: "dev" })).toHaveLength(1);
      expect(await service.list({ agentId: "architekt" })).toHaveLength(1);
      expect(await service.list({ status: "fired" })).toHaveLength(1);
    });
  });
});
