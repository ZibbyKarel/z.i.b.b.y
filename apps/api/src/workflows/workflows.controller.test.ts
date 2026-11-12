import { UnauthorizedException } from "@nestjs/common";
import type { Workflow, WorkflowPhase } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { OperatorTokenService } from "../approvals/operator-token.service";
import type { DepartmentsStorageService } from "../departments/departments.storage.service";
import { WorkflowsController } from "./workflows.controller";
import type { WorkflowsStorageService } from "./workflows.storage.service";

const phase = (extra: Partial<WorkflowPhase> = {}): WorkflowPhase => ({
  id: "a",
  type: "agent",
  agent: "writer",
  consumes: "in.md",
  produces: "out.md",
  model: "sonnet",
  thinking: "medium",
  ...extra,
});

describe("WorkflowsController.engineGuard (A21, operator-only step engine)", () => {
  const op = { "x-zibby-operator-token": "tok" };
  const make = (stored: WorkflowPhase[] | null) =>
    new WorkflowsController(
      {
        get: async () => {
          if (!stored) throw new Error("not found");
          return { id: "w", phases: stored } as unknown as Workflow;
        },
      } as unknown as WorkflowsStorageService,
      {} as DepartmentsStorageService,
      { token: () => "tok" } as unknown as OperatorTokenService,
    );
  const pinned = phase({ engine: "opencode", engineModel: "opencode/big-pickle" });

  it("401s pinning, changing or dropping a step's engine/model without the token", async () => {
    await expect(make(null).engineGuard(null, [pinned], {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(make([phase()]).engineGuard("w", [pinned], {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      make([pinned]).engineGuard("w", [{ ...pinned, engineModel: "openai/gpt-x" }], {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(make([pinned]).engineGuard("w", [phase()], {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(make([phase()]).engineGuard("w", [pinned], op)).resolves.toBeUndefined();
  });

  it("lets every other workflow edit through", async () => {
    await expect(make(null).engineGuard(null, [phase()], {})).resolves.toBeUndefined();
    await expect(
      make([pinned]).engineGuard("w", [{ ...pinned, prompt: "new brief" }], {}),
    ).resolves.toBeUndefined();
    await expect(make([pinned]).engineGuard("w", undefined, {})).resolves.toBeUndefined();
  });
});
