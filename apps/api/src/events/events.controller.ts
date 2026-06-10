import { Controller, type MessageEvent, Sse } from "@nestjs/common"
import type { AgentRun, PipelineRun } from "@zibby/contracts"
import { type Observable, merge } from "rxjs"
import { AgentRunnerService } from "../agents/agent-runner.service"
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
      heartbeats(),
    )
  }
}
