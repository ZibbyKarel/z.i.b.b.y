import { Controller, type MessageEvent, Sse } from "@nestjs/common"
import type { AgentRun, PipelineRun } from "@zibby/contracts"
import { type Observable, map, merge } from "rxjs"
import { ActivityEventsService } from "../activity/activity-events.service"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { ChannelEventsService } from "../channels/channel-events.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
import { fromRunStatus, heartbeats } from "../shared/sse/sse"

/**
 * The single multiplexed status channel. One `EventSource` per client carries
 * every agent-run and pipeline-run transition, replacing the dashboard's
 * continuous polling of the running list, the all-runs history (both 2s) and the
 * pipeline aggregate (1s). Events are a thin invalidation signal — the client
 * refetches the matching query off them — so the list endpoints remain the single
 * source of truth and the server only speaks on a real transition. A merged
 * heartbeat keeps the connection alive through idle periods.
 */
@Controller()
export class EventsController {
  constructor(
    private readonly agents: AgentRunnerService,
    private readonly pipelines: PipelineRunnerService,
    private readonly channels: ChannelEventsService,
    private readonly activity: ActivityEventsService,
  ) {}

  @Sse("api/events")
  events(): Observable<MessageEvent> {
    return merge(
      fromRunStatus<AgentRun>(
        "agent-runs",
        (listener) => this.agents.onRunStatus(listener),
        (run) => ({ runId: run.runId, status: run.status }),
      ),
      fromRunStatus<PipelineRun>(
        "pipeline-runs",
        (listener) => this.pipelines.onRunStatus(listener),
        (run) => ({ runId: run.pipelineRunId, status: run.status }),
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
            data: JSON.stringify({ scope: "activity", kind: e.kind, at: e.at }),
          }),
        ),
      ),
      heartbeats(),
    )
  }
}
