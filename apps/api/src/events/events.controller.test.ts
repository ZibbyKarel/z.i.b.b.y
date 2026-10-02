import type { MessageEvent } from "@nestjs/common";
import type { AgentRun, GoalRun, WorkflowRun } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { ActivityEventsService } from "../activity/activity-events.service";
import type { AgentRunnerService } from "../agents/agent-runner.service";
import { ChannelEventsService } from "../channels/channel-events.service";
import type { GoalRunnerService } from "../goals/goal-runner.service";
import type { WorkflowRunnerService } from "../workflows/workflow-runner.service";
import { EventsController } from "./events.controller";

/** A bare `onRunStatus` stub — the only surface the controller reads off any runner. */
function fakeRunner<T>() {
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

describe("EventsController — merged `/api/events` SSE", () => {
  it("carries agent/workflow/goal transitions in the merged stream", () => {
    const agents = fakeRunner<AgentRun>();
    const workflows = fakeRunner<WorkflowRun>();
    const goals = fakeRunner<GoalRun>();

    const controller = new EventsController(
      agents as unknown as AgentRunnerService,
      workflows as unknown as WorkflowRunnerService,
      goals as unknown as GoalRunnerService,
      new ChannelEventsService(),
      new ActivityEventsService(),
    );

    const events: MessageEvent[] = [];
    const sub = controller.events().subscribe((e) => events.push(e));

    workflows.emit({ workflowRunId: "delivery_1", status: "running" } as WorkflowRun);
    goals.emit({ goalRunId: "ship-it_1", status: "running" } as GoalRun);

    const parsed = events.map((e) => JSON.parse(String(e.data)));
    expect(parsed).toContainEqual({
      scope: "workflow-runs",
      runId: "delivery_1",
      status: "running",
    });
    expect(parsed).toContainEqual({ scope: "goal-runs", runId: "ship-it_1", status: "running" });

    sub.unsubscribe();
  });
});
