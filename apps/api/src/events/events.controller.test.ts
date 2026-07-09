import type { MessageEvent } from "@nestjs/common";
import type { AgentRun, ChainRun, GoalRun, PipelineRun } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { ActivityEventsService } from "../activity/activity-events.service";
import type { AgentRunnerService } from "../agents/agent-runner.service";
import type { ChainRunnerService } from "../chains/chain-runner.service";
import { ChannelEventsService } from "../channels/channel-events.service";
import type { GoalRunnerService } from "../goals/goal-runner.service";
import type { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
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
  it("includes a chain-run transition in the merged stream (Phase 104A)", () => {
    const agents = fakeRunner<AgentRun>();
    const pipelines = fakeRunner<PipelineRun>();
    const goals = fakeRunner<GoalRun>();
    const chains = fakeRunner<ChainRun>();

    const controller = new EventsController(
      agents as unknown as AgentRunnerService,
      pipelines as unknown as PipelineRunnerService,
      goals as unknown as GoalRunnerService,
      chains as unknown as ChainRunnerService,
      new ChannelEventsService(),
      new ActivityEventsService(),
    );

    const events: MessageEvent[] = [];
    const sub = controller.events().subscribe((e) => events.push(e));

    chains.emit({
      chainRunId: "onboarding_1",
      chainId: "onboarding",
      status: "done",
      currentStep: null,
      steps: [],
      startedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(events.map((e) => JSON.parse(String(e.data)))).toContainEqual({
      scope: "chain-runs",
      runId: "onboarding_1",
      status: "done",
    });

    sub.unsubscribe();
  });

  it("still carries agent/pipeline/goal transitions alongside chain-runs (no regression)", () => {
    const agents = fakeRunner<AgentRun>();
    const pipelines = fakeRunner<PipelineRun>();
    const goals = fakeRunner<GoalRun>();
    const chains = fakeRunner<ChainRun>();

    const controller = new EventsController(
      agents as unknown as AgentRunnerService,
      pipelines as unknown as PipelineRunnerService,
      goals as unknown as GoalRunnerService,
      chains as unknown as ChainRunnerService,
      new ChannelEventsService(),
      new ActivityEventsService(),
    );

    const events: MessageEvent[] = [];
    const sub = controller.events().subscribe((e) => events.push(e));

    pipelines.emit({ pipelineRunId: "delivery_1", status: "running" } as PipelineRun);
    goals.emit({ goalRunId: "ship-it_1", status: "running" } as GoalRun);

    const parsed = events.map((e) => JSON.parse(String(e.data)));
    expect(parsed).toContainEqual({ scope: "pipeline-runs", runId: "delivery_1", status: "running" });
    expect(parsed).toContainEqual({ scope: "goal-runs", runId: "ship-it_1", status: "running" });

    sub.unsubscribe();
  });
});
