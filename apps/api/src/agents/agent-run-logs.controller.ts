import { Controller, Headers, type MessageEvent, Param, Sse } from "@nestjs/common"
import type { Observable } from "rxjs"
import { streamRunLog } from "../shared/sse/sse"
import { AgentRunnerService, RunNotFoundError } from "./agent-runner.service"

/**
 * SSE tail for a single agent run's log, the push replacement for the FE's 1s
 * offset poll. It lives outside `agentRunsContract` (ts-rest doesn't model event
 * streams) on a distinct `…/logs/stream` path, so it never collides with the
 * contract's `…/logs` poll endpoint — which stays as the graceful fallback when a
 * proxy or browser can't do SSE.
 *
 * The client's `Last-Event-ID` (the byte offset, tagged on every event) seeds the
 * start offset, so EventSource's native reconnect resumes without re-sending the
 * backlog. An unknown run id ends the stream cleanly rather than erroring it, so
 * the browser doesn't reconnect-loop against a run that will never produce bytes.
 */
@Controller()
export class AgentRunLogsController {
  constructor(private readonly runner: AgentRunnerService) {}

  @Sse("api/agents/runs/:runId/logs/stream")
  streamLogs(
    @Param("runId") runId: string,
    @Headers("last-event-id") lastEventId?: string,
  ): Observable<MessageEvent> {
    const parsed = Number(lastEventId)
    const startOffset = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    return streamRunLog(
      startOffset,
      (offset) =>
        this.runner.readLog(runId, offset).catch((error) => {
          if (error instanceof RunNotFoundError) {
            return { content: "", nextOffset: offset, done: true }
          }
          throw error
        }),
      (listener) => this.runner.onLogAppend(runId, listener),
    )
  }
}
