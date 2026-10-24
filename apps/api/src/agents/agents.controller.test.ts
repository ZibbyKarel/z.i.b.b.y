import { describe, expect, it, vi } from "vitest";
import type { DepartmentsStorageService } from "../departments/departments.storage.service";
import { AgentsController } from "./agents.controller";
import type { AgentsStorageService } from "./agents.storage.service";

function make(existing: { department?: string }) {
  const storage = { get: vi.fn().mockResolvedValue({ id: "a", instructions: "x", ...existing }) };
  const departments = {
    firstMissing: vi.fn(async (ids: string[]) => ids.find((i) => i === "ghost")),
  };
  return new AgentsController(
    storage as unknown as AgentsStorageService,
    departments as unknown as DepartmentsStorageService,
  );
}

describe("AgentsController.departmentUpdateGuard", () => {
  it("422s an explicit empty/undefined department on an agent that has one", async () => {
    const c = make({ department: "dev" });
    expect(await c.departmentUpdateGuard("a", { department: undefined })).toMatchObject({
      status: 422,
    });
    expect(await c.departmentUpdateGuard("a", { department: "" })).toMatchObject({ status: 422 });
  });

  it("422s an unknown department", async () => {
    const c = make({ department: "dev" });
    expect(await c.departmentUpdateGuard("a", { department: "ghost" })).toMatchObject({
      status: 422,
    });
  });

  it("lets through an update that does not mention the department", async () => {
    expect(await make({ department: "dev" }).departmentUpdateGuard("a", { title: "t" })).toBeNull();
  });

  it("lets a department-less agent be updated, even with department undefined", async () => {
    const c = make({});
    expect(await c.departmentUpdateGuard("a", { department: undefined })).toBeNull();
    expect(await c.departmentUpdateGuard("a", { title: "t" })).toBeNull();
  });
});
