import { describe, expect, it, vi } from "vitest";
import type { AgentRun, WorkflowRun } from "@zibby/contracts";
import { ActivityRecorderService } from "./activity-recorder.service";

/** A fake runner that lets a test drive its onRunStatus listener directly. */
function makeRunner<T>() {
  let listener: ((run: T) => void) | undefined;
  return {
    onRunStatus: (l: (run: T) => void) => {
      listener = l;
      return () => {
        listener = undefined;
      };
    },
    emit: (run: T) => listener?.(run),
  };
}

const agentRun = (status: AgentRun["status"]): AgentRun =>
  ({ runId: "a1", agentId: "writer", status, title: "T" }) as AgentRun;

const workflowRun = (status: WorkflowRun["status"], parkedReason?: string): WorkflowRun =>
  ({ workflowRunId: "p1", workflowId: "release", status, parkedReason }) as WorkflowRun;

describe("ActivityRecorderService", () => {
  function setup() {
    const agent = makeRunner<AgentRun>();
    const workflow = makeRunner<WorkflowRun>();
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new ActivityRecorderService(
      agent as never,
      workflow as never,
      { record } as never,
    );
    service.onModuleInit();
    return { agent, workflow, record, service };
  }

  it("records run-started then run-finished for an agent run", () => {
    const { agent, record } = setup();
    agent.emit(agentRun("running"));
    agent.emit(agentRun("done"));
    const kinds = record.mock.calls.map((c) => c[0].kind);
    expect(kinds).toEqual(["run-started", "run-finished"]);
  });

  it("dedups a repeated status — one entry per transition", () => {
    const { agent, record } = setup();
    agent.emit(agentRun("running"));
    agent.emit(agentRun("running"));
    agent.emit(agentRun("done"));
    agent.emit(agentRun("done"));
    expect(record.mock.calls.map((c) => c[0].kind)).toEqual(["run-started", "run-finished"]);
  });

  it("maps workflow running → parked → finished", () => {
    const { workflow, record } = setup();
    workflow.emit(workflowRun("running"));
    workflow.emit(workflowRun("parked", "retries"));
    workflow.emit(workflowRun("done"));
    expect(record.mock.calls.map((c) => c[0].kind)).toEqual([
      "workflow-started",
      "workflow-parked",
      "workflow-finished",
    ]);
    // The parked entry carries the run ref + status for traceability.
    const parked = record.mock.calls[1]![0];
    expect(parked.refs).toMatchObject({ runRef: "p1", status: "parked" });
  });

  it("ignores non-transition statuses (e.g. awaiting-approval)", () => {
    const { agent, record } = setup();
    agent.emit(agentRun("awaiting-approval"));
    expect(record).not.toHaveBeenCalled();
  });
});
