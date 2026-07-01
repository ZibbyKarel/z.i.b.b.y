import { Controller, Headers, type MessageEvent, Param, Req, Sse } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { AgentRunnerService, RunNotFoundError } from "../agents/agent-runner.service";
import { PipelineRunNotFoundError } from "../pipelines/pipeline-runner.service";
import { type WriteGate, streamRunLog } from "../shared/sse/sse";
import { TaskRunNotFoundError, TaskRunsService } from "./task-runs.service";

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
   * SSE tail for one pipeline stage's log — the push replacement for the stage
   * timeline's 1s offset poll (the contract's `…/stages/:phaseId/logs` endpoint
   * stays as the graceful fallback). The read path re-resolves the tailed attempt
   * on every chunk (live `currentStageRunId`, else the last attempt of the phase),
   * so the stream follows a retry without reconnecting. An unknown/non-pipeline
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
          if (error instanceof TaskRunNotFoundError || error instanceof PipelineRunNotFoundError) {
            return { content: "", nextOffset: offset, done: true };
          }
          throw error;
        }),
      (listener) => this.taskRuns.onStageLogAppend(runId, phaseId, listener),
      writeGateFor(req),
    );
  }
}

/** The resume offset carried by EventSource's `Last-Event-ID` reconnect header. */
function parseOffset(lastEventId?: string): number {
  const parsed = Number(lastEventId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Bridge the Express response behind an `@Sse()` handler to the pump's backpressure
 * gate. `res.writableNeedDrain` flips true the moment a `res.write()` (NestJS's, on
 * our behalf) leaves the socket buffer over its high-water mark; `drain` fires when
 * it empties. `req.res` is always present for an in-flight request — the `undefined`
 * guard is only for the (test) case of a bare request object with no socket.
 */
function writeGateFor(req: Request): WriteGate | undefined {
  const res = req.res;
  if (!res) return undefined;
  return {
    needsDrain: () => res.writableNeedDrain,
    onceDrain: (cb) => {
      res.once("drain", cb);
      return () => res.off("drain", cb);
    },
  };
}
