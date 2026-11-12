import { Controller, Headers, type MessageEvent, Param, Req, Sse } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { AgentRunnerService, RunNotFoundError } from "../agents/agent-runner.service";
import { WorkflowRunNotFoundError } from "../workflows/workflow-runner.service";
import { parseOffset, streamRunLog, writeGateFor } from "../shared/sse/sse";
import { TaskRunNotFoundError, TaskRunsService } from "./task-runs.service";

/**
 * SSE tail for a single task run's log, the push replacement for the FE's 1s offset
 * poll. It lives outside `taskRunsContract` (ts-rest doesn't model event streams)
 * on a distinct `…/logs/stream` path, so it never collides with the contract's
 * `…/logs` poll endpoint (the graceful fallback when a proxy/browser can't do SSE).
 *
 * Only agent (and goal-child agent) runs have a single tailable log; workflow runs
 * use per-stage logs. An unknown/non-agent run id ends the stream cleanly (the agent
 * runner's `RunNotFoundError` maps to a done chunk) rather than erroring it, so the
 * browser doesn't reconnect-loop against a run that will never produce bytes.
 */
@Controller()
export class TaskRunLogsController {
  constructor(
    private readonly agentRunner: AgentRunnerService,
    private readonly taskRuns: TaskRunsService,
  ) {}

  @Sse("api/tasks/runs/:runId/logs/stream")
  streamLogs(
    @Req() req: Request,
    @Param("runId") runId: string,
    @Headers("last-event-id") lastEventId?: string,
  ): Observable<MessageEvent> {
    const startOffset = parseOffset(lastEventId);
    return streamRunLog(
      startOffset,
      (offset) =>
        this.agentRunner.readLog(runId, offset).catch((error) => {
          if (error instanceof RunNotFoundError) {
            return { content: "", nextOffset: offset, done: true };
          }
          throw error;
        }),
      (listener) => this.agentRunner.onLogAppend(runId, listener),
      writeGateFor(req),
    );
  }

  /**
   * SSE tail for one workflow stage's log — the push replacement for the stage
   * timeline's 1s offset poll (the contract's `…/stages/:phaseId/logs` endpoint
   * stays as the graceful fallback). The read path re-resolves the tailed attempt
   * on every chunk (live `currentStageRunId`, else the last attempt of the phase),
   * so the stream follows a retry without reconnecting. An unknown/non-workflow
   * run or a phase with no attempt yet ends the stream cleanly (done chunk), so
   * the browser doesn't reconnect-loop against a log that will never exist.
   */
  @Sse("api/tasks/runs/:runId/stages/:phaseId/logs/stream")
  streamStageLogs(
    @Req() req: Request,
    @Param("runId") runId: string,
    @Param("phaseId") phaseId: string,
    @Headers("last-event-id") lastEventId?: string,
  ): Observable<MessageEvent> {
    const startOffset = parseOffset(lastEventId);
    return streamRunLog(
      startOffset,
      (offset) =>
        this.taskRuns.getStageLog(runId, phaseId, offset).catch((error) => {
          if (error instanceof TaskRunNotFoundError || error instanceof WorkflowRunNotFoundError) {
            return { content: "", nextOffset: offset, done: true };
          }
          throw error;
        }),
      (listener) => this.taskRuns.onStageLogAppend(runId, phaseId, listener),
      writeGateFor(req),
    );
  }
}
