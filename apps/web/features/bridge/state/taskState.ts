import type { TaskDetail, TaskParentState } from "@zibby/contracts";

/** One task's own bucket — mirrors the API's `deriveTaskState` (task-parents.service.ts). */
function ownState(task: Pick<TaskDetail, "status" | "outcome">): TaskParentState {
  if (task.status === "failed" || task.status === "dead-letter" || task.outcome?.status === "error")
    return "error";
  if (task.status === "held" || task.status === "awaiting-output") return "blocked";
  if (task.status === "dispatched" && !task.outcome) return "working";
  if (task.outcome?.status === "done" || task.status === "cancelled") return "done";
  return "thinking";
}

/** The task's rolled-up state: its subtasks' worst state, or its own when it has none. */
export function taskState(task: TaskDetail): TaskParentState {
  const states = task.subtasks.length > 0 ? task.subtasks.map((s) => s.state) : [ownState(task)];
  for (const s of ["error", "blocked", "working"] as const) if (states.includes(s)) return s;
  return states.every((s) => s === "done") ? "done" : "thinking";
}
