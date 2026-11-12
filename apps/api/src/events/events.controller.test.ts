import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MessageEvent } from "@nestjs/common";
import type { AgentRun, GoalRun, WorkflowRun } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { Subject } from "rxjs";
import { ActivityEventsService } from "../activity/activity-events.service";
import type { ApprovalSettledEvent, ApprovalsService } from "../approvals/approvals.service";
import type { AgentRunnerService } from "../agents/agent-runner.service";
import { ChannelEventsService } from "../channels/channel-events.service";
import type { GoalRunnerService } from "../goals/goal-runner.service";
import type { WorkflowRunnerService } from "../workflows/workflow-runner.service";
import { AutomationFiresStore } from "../automations/automation-fires.store";
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

function approvalsStub(subject = new Subject<ApprovalSettledEvent>()) {
  return { settled: () => subject.asObservable() } as unknown as ApprovalsService;
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
      approvalsStub(),
      new AutomationFiresStore("/nonexistent"),
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

  it("carries settled approval decisions as the `approvals` scope (todo-17)", () => {
    const settled = new Subject<ApprovalSettledEvent>();
    const controller = new EventsController(
      fakeRunner<AgentRun>() as unknown as AgentRunnerService,
      fakeRunner<WorkflowRun>() as unknown as WorkflowRunnerService,
      fakeRunner<GoalRun>() as unknown as GoalRunnerService,
      new ChannelEventsService(),
      new ActivityEventsService(),
      approvalsStub(settled),
      new AutomationFiresStore("/nonexistent"),
    );
    const events: MessageEvent[] = [];
    const sub = controller.events().subscribe((e) => events.push(e));
    settled.next({ approvalId: "a1", kind: "pr-rebase", status: "rejected" });
    sub.unsubscribe();
    expect(events.map((e) => JSON.parse(String(e.data)))).toContainEqual({
      scope: "approvals",
      approvalId: "a1",
      kind: "pr-rebase",
      status: "rejected",
    });
  });

  it("carries automation fire transitions as the `automation-fires` scope (todo-4)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "events-fires-"));
    const fires = new AutomationFiresStore(dir);
    const controller = new EventsController(
      fakeRunner<AgentRun>() as unknown as AgentRunnerService,
      fakeRunner<WorkflowRun>() as unknown as WorkflowRunnerService,
      fakeRunner<GoalRun>() as unknown as GoalRunnerService,
      new ChannelEventsService(),
      new ActivityEventsService(),
      approvalsStub(),
      fires,
    );
    const events: MessageEvent[] = [];
    const sub = controller.events().subscribe((e) => events.push(e));
    const fire = await fires.begin("nightly", "cron");
    await fires.finish("nightly", fire.id, { status: "error", error: "boom" });
    sub.unsubscribe();
    await fs.rm(dir, { recursive: true, force: true });
    const parsed = events.map((e) => JSON.parse(String(e.data)));
    expect(parsed).toContainEqual({
      scope: "automation-fires",
      automationId: "nightly",
      fireId: fire.id,
      status: "running",
    });
    expect(parsed).toContainEqual({
      scope: "automation-fires",
      automationId: "nightly",
      fireId: fire.id,
      status: "error",
    });
  });
});
