import { Controller, type MessageEvent, Query, Sse } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { chatContract } from "@zibby/contracts";
import { type Observable, filter, map } from "rxjs";
import { ChatEventsService } from "./chat-events.service";
import { ChatSessionService } from "./chat-session.service";
import { ChatTranscriptStore } from "./chat-transcript.store";

/**
 * Chat HTTP surface. The ts-rest handlers cover the request/response routes
 * (`POST /chat/messages`, `GET /chat/transcript`); the streaming of assistant
 * tokens lives on a raw `@Sse()` route (`GET /api/chat/stream`) because ts-rest
 * doesn't model event streams — same split as the task-run log tail. The client
 * opens the SSE first, then POSTs; tokens for its conversation arrive live.
 */
@Controller()
export class ChatController {
  constructor(
    private readonly session: ChatSessionService,
    private readonly store: ChatTranscriptStore,
    private readonly events: ChatEventsService,
  ) {}

  @TsRestHandler(chatContract)
  handler() {
    return tsRestHandler(chatContract, {
      sendMessage: async ({ body }) => ({
        status: 201,
        body: await this.session.sendMessage(body),
      }),
      getTranscript: async ({ query }) => {
        const conversationId = query.conversationId ?? (await this.store.readActive());
        if (!conversationId) {
          return { status: 200, body: { conversationId: "", sessionId: null, messages: [] } };
        }
        return { status: 200, body: await this.store.readTranscript(conversationId) };
      },
    });
  }

  @Sse("api/chat/stream")
  stream(@Query("conversationId") conversationId?: string): Observable<MessageEvent> {
    return this.events.stream().pipe(
      filter((event) => !conversationId || event.conversationId === conversationId),
      map((event): MessageEvent => ({ data: JSON.stringify(event) })),
    );
  }
}
