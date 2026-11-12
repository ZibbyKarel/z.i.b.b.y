import { Controller, Headers, type MessageEvent, Param, Req, Sse } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { parseOffset, streamRunLog, writeGateFor } from "../shared/sse/sse";
import { AutomationFireNotFoundError, AutomationFiresStore } from "./automation-fires.store";

/**
 * SSE tail for one automation fire's log (todo-4/5), outside `automationsContract`
 * (ts-rest doesn't model event streams) on `…/logs/stream`, next to the contract's
 * `…/logs` offset endpoint (the poll fallback). An unknown fire ends the stream with
 * a done chunk so the browser doesn't reconnect-loop — same as the task-run tail.
 */
@Controller()
export class AutomationFireLogsController {
  constructor(private readonly fires: AutomationFiresStore) {}

  @Sse("api/automations/:id/fires/:fireId/logs/stream")
  streamLogs(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("fireId") fireId: string,
    @Headers("last-event-id") lastEventId?: string,
  ): Observable<MessageEvent> {
    return streamRunLog(
      parseOffset(lastEventId),
      (offset) =>
        this.fires.readLog(id, fireId, offset).catch((error) => {
          if (error instanceof AutomationFireNotFoundError) {
            return { content: "", nextOffset: offset, done: true };
          }
          throw error;
        }),
      (listener) => this.fires.onLogAppend(fireId, listener),
      writeGateFor(req),
    );
  }
}
