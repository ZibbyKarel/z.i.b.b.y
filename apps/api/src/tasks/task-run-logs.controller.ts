import { Controller, Headers, type MessageEvent, Param, Sse } from "@nestjs/common"
import type { Observable } from "rxjs"
import { AgentRunnerService, RunNotFoundError } from "../agents/agent-runner.service"
import { streamRunLog } from "../shared/sse/sse"

/**
 * SSE tail for a single task run's log, the push replacement for the FE's 1s offset
 * poll. It lives outside `taskRunsContract` (ts-rest doesn't model event streams)
 * on a distinct `…/logs/stream` path, so it never collides with the contract's
 * `…/logs` poll endpoint (the graceful fallback when a proxy/browser can't do SSE).
 *
 * Only agent (and goal-child agent) runs have a single tailable log; pipeline runs
 * use per-stage logs. An unknown/non-agent run id ends the stream cleanly (the agent
 * runner's `RunNotFoundError` maps to a done chunk) rather than erroring it, so the
 * browser doesn't reconnect-loop against a run that will never produce bytes.
 */
@Controller()
export class TaskRunLogsController {
  constructor(private readonly agentRunner: AgentRunnerService) {}

  @Sse("api/tasks/runs/:runId/logs/stream")
  streamLogs(
    @Param("runId") runId: string,
    @Headers("last-event-id") lastEventId?: string,
  ): Observable<MessageEvent> {
    const parsed = Number(lastEventId)
    const startOffset = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    return streamRunLog(
      startOffset,
      (offset) =>
        this.agentRunner.readLog(runId, offset).catch((error) => {
          if (error instanceof RunNotFoundError) {
            return { content: "", nextOffset: offset, done: true }
          }
          throw error
        }),
      (listener) => this.agentRunner.onLogAppend(runId, listener),
    )
  }
}
