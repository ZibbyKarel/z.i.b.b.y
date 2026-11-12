import { describe, expect, it, vi } from "vitest";
import type { DepartmentsStorageService } from "../departments/departments.storage.service";
import type { OperatorTokenService } from "../approvals/operator-token.service";
import { AgentsController } from "./agents.controller";
import type { AgentsStorageService } from "./agents.storage.service";

function make(existing: { department?: string; engine?: string }) {
  const storage = { get: vi.fn().mockResolvedValue({ id: "a", instructions: "x", ...existing }) };
  const departments = {
    firstMissing: vi.fn(async (ids: string[]) => ids.find((i) => i === "ghost")),
  };
  return new AgentsController(
    storage as unknown as AgentsStorageService,
    departments as unknown as DepartmentsStorageService,
    { token: () => "tok" } as unknown as OperatorTokenService,
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

describe("AgentsController.engineGuard (operator-only engine switch)", () => {
  const op = { "x-zibby-operator-token": "tok" };
  it("401s an engine / model change without the operator token", async () => {
    const c = make({});
    await expect(c.engineGuard("a", { engine: "opencode" }, {})).rejects.toThrow(/operator token/);
    await expect(c.engineGuard(null, { engineModel: "opencode/x" }, {})).rejects.toThrow(
      /operator token/,
    );
    await expect(c.engineGuard("a", { engine: "opencode" }, op)).resolves.toBeUndefined();
  });

  it("lets through an update that keeps the engine (or clears an absent one)", async () => {
    const c = make({ engine: "opencode" });
    await expect(c.engineGuard("a", { engine: "opencode" }, {})).resolves.toBeUndefined();
    await expect(make({}).engineGuard("a", { engine: null }, {})).resolves.toBeUndefined();
    await expect(c.engineGuard("a", {}, {})).resolves.toBeUndefined();
  });
});
