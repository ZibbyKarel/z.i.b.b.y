import { describe, expect, it, vi } from "vitest";
import { ClaudeUnavailableError } from "../runner/claude-preflight.service";
import { TaskRunsController } from "./task-runs.controller";
import { DepartmentEmptyRosterError, EmptyCatalogError } from "./task-scheduler.service";

type Handover = (req: unknown) => Promise<{ status: number }>;

function handoverWith(error: Error): Handover {
  const runs = { handover: vi.fn(async () => Promise.reject(error)) };
  const impl = new TaskRunsController(runs as never).handler() as unknown as {
    handoverTaskRun: Handover;
  };
  return impl.handoverTaskRun;
}

const req = {
  params: { runId: "r1" },
  body: { target: { kind: "workflow", id: "delivery", name: "Delivery" } },
};

describe("TaskRunsController handoverTaskRun", () => {
  it("maps an empty catalog / empty department roster to 422", async () => {
    expect((await handoverWith(new EmptyCatalogError())(req)).status).toBe(422);
    expect((await handoverWith(new DepartmentEmptyRosterError("eng"))(req)).status).toBe(422);
  });

  it("maps an unavailable claude CLI to 503", async () => {
    expect((await handoverWith(new ClaudeUnavailableError("no cli"))(req)).status).toBe(503);
  });
});
