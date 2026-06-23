import { Injectable } from "@nestjs/common";
import { type Observable, Subject } from "rxjs";
import type { ChatToolEvent } from "@zibby/contracts";

/**
 * A live event for one assistant turn, pushed as it is produced. Unlike the
 * invalidation-bus events on `/api/events`, these carry **content** (token deltas):
 * the dedicated chat SSE forwards them verbatim so the transcript renders
 * token-by-token. `delta` streams visible text; `tool` announces a dispatch; `done`
 * carries the final persisted message; `error` ends the turn.
 */
export type ChatTurnEvent =
  | { conversationId: string; turnId: string; type: "delta"; text: string }
  | { conversationId: string; turnId: string; type: "tool"; tool: ChatToolEvent }
  | { conversationId: string; turnId: string; type: "done"; text: string }
  | { conversationId: string; turnId: string; type: "error"; message: string };

/**
 * The push source for live chat tokens — the {@link ActivityEventsService} twin, but
 * content-carrying. The session service calls {@link emit} for every parsed stream
 * event; the chat SSE controller filters {@link stream} by `conversationId` and
 * forwards each event as a `MessageEvent`. In-memory + ephemeral: the durable record
 * is the JSONL transcript, so a dropped connection just refetches the transcript.
 */
@Injectable()
export class ChatEventsService {
  private readonly subject = new Subject<ChatTurnEvent>();

  emit(event: ChatTurnEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<ChatTurnEvent> {
    return this.subject.asObservable();
  }
}
