import { Controller, type MessageEvent, Sse } from "@nestjs/common";
import type { AgentRun, GoalRun, WorkflowRun } from "@zibby/contracts";
import { Observable, map, merge } from "rxjs";
import { ActivityEventsService } from "../activity/activity-events.service";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { AutomationFiresStore } from "../automations/automation-fires.store";
import { ChannelEventsService } from "../channels/channel-events.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { WorkflowRunnerService } from "../workflows/workflow-runner.service";
import { fromRunStatus, heartbeats } from "../shared/sse/sse";

/**
 * The single multiplexed status channel. One `EventSource` per client carries
 * every agent-run and workflow-run transition, replacing the dashboard's
 * continuous polling of the running list, the all-runs history (both 2s) and the
 * workflow aggregate (1s). Events are a thin invalidation signal — the client
 * refetches the matching query off them — so the list endpoints remain the single
 * source of truth and the server only speaks on a real transition. A merged
 * heartbeat keeps the connection alive through idle periods.
 */
@Controller()
export class EventsController {
  constructor(
    private readonly agents: AgentRunnerService,
    private readonly workflows: WorkflowRunnerService,
    private readonly goals: GoalRunnerService,
    private readonly channels: ChannelEventsService,
    private readonly activity: ActivityEventsService,
    private readonly approvals: ApprovalsService,
    private readonly fires: AutomationFiresStore,
  ) {}

  @Sse("api/events")
  events(): Observable<MessageEvent> {
    return merge(
      fromRunStatus<AgentRun>(
        "agent-runs",
        (listener) => this.agents.onRunStatus(listener),
        (run) => ({ runId: run.runId, status: run.status }),
      ),
      fromRunStatus<WorkflowRun>(
        "workflow-runs",
        (listener) => this.workflows.onRunStatus(listener),
        (run) => ({ runId: run.workflowRunId, status: run.status }),
      ),
      // Phase 10: goal-run transitions — the web feed invalidates the goal-runs
      // query off this scope (unknown-scope tolerant, like the others).
      fromRunStatus<GoalRun>(
        "goal-runs",
        (listener) => this.goals.onRunStatus(listener),
        (run) => ({ runId: run.goalRunId, status: run.status }),
      ),
      // Additive `"channel-items"` scope — the web RunEventsProvider ignores
      // scopes it doesn't know, so this is safe to merge in (decision 15).
      this.channels.stream().pipe(
        map(
          (e): MessageEvent => ({
            data: JSON.stringify({ scope: "channel-items", itemId: e.itemId, state: e.state }),
          }),
        ),
      ),
      // Additive `"activity"` scope — same unknown-scope tolerance (decision 7).
      // The feed/briefing card refetch off `{ kind, at }`; the activity log module
      // is global, so EventsModule needs no new import.
      this.activity.stream().pipe(
        map(
          (e): MessageEvent => ({
            data: JSON.stringify({ scope: "activity", kind: e.kind, at: e.at, entry: e.entry }),
          }),
        ),
      ),
      // todo-17 — a decision whose runner effect finished (gate stamp discarded, push done).
      // The `approval-*` activity fires before that, so the run feed / PR list refetch here too.
      this.approvals
        .settled()
        .pipe(map((e): MessageEvent => ({ data: JSON.stringify({ scope: "approvals", ...e }) }))),
      // todo-4 — an automation fire started or finished (cron, manual or signal). The
      // automations list (`lastFire`) and the fire history refetch off this scope.
      new Observable<MessageEvent>((subscriber) =>
        this.fires.onChange((e) =>
          subscriber.next({ data: JSON.stringify({ scope: "automation-fires", ...e }) }),
        ),
      ),
      heartbeats(),
    );
  }
}
