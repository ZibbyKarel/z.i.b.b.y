import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { ChatController } from "./chat.controller";
import { ChatEventsService } from "./chat-events.service";
import { ChatSessionService } from "./chat-session.service";
import { CHAT_DIR, ChatTranscriptStore } from "./chat-transcript.store";

/** Default chat dir, anchored to `apps/api/data/chat` (gitignored), overridable by env. */
export function resolveChatDir(): string {
  return process.env.CHAT_DIR ?? dataDir("chat");
}

/**
 * Chat (chat-first conversational layer, replaces the Voice UI). Owns the streaming
 * `claude` session engine, the append-only JSONL transcript store, and the live
 * token event bus. Self-contained: it depends only on shared file-storage and the
 * `claude` CLI, so it slots into the root module with no cross-feature imports.
 */
@Module({
  controllers: [ChatController],
  providers: [
    { provide: CHAT_DIR, useFactory: resolveChatDir },
    ChatTranscriptStore,
    ChatEventsService,
    ChatSessionService,
  ],
  exports: [ChatSessionService, ChatTranscriptStore],
})
export class ChatModule {}
