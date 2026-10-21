import type { TaskDetail } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { taskState } from "./taskState";

const task = (over: Partial<TaskDetail>): TaskDetail =>
  ({ status: "queued", subtasks: [], ...over }) as TaskDetail;

describe("taskState", () => {
  it("derives from the task itself when it has no subtasks", () => {
    expect(taskState(task({ status: "failed" }))).toBe("error");
    expect(taskState(task({ status: "held" }))).toBe("blocked");
    expect(taskState(task({ status: "dispatched" }))).toBe("working");
    expect(
      taskState(
        task({ status: "dispatched", outcome: { status: "done" } as TaskDetail["outcome"] }),
      ),
    ).toBe("done");
    expect(taskState(task({ status: "queued" }))).toBe("thinking");
  });
  it("rolls subtasks up error > blocked > working > done", () => {
    const s = (state: string) => ({ taskId: "x", state }) as TaskDetail["subtasks"][number];
    expect(taskState(task({ subtasks: [s("done"), s("working")] }))).toBe("working");
    expect(taskState(task({ subtasks: [s("working"), s("blocked")] }))).toBe("blocked");
    expect(taskState(task({ subtasks: [s("done"), s("done")] }))).toBe("done");
    expect(taskState(task({ subtasks: [s("done"), s("thinking")] }))).toBe("thinking");
  });
});
