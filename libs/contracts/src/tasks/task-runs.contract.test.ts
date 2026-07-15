import { describe, expect, it } from "vitest";
import { EmptyBodySchema } from "../common.schema";
import { taskRunsContract } from "./task-runs.contract";

describe("taskRunsContract", () => {
  it("stopTaskRun's empty body IS the shared EmptyBodySchema (T11 dedup, finding #37)", () => {
    expect(taskRunsContract.stopTaskRun.body).toBe(EmptyBodySchema);
  });
});
