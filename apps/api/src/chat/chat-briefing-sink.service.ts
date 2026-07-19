import { Injectable } from "@nestjs/common";
import type { Briefing, ChatMessage } from "@zibby/contracts";
import type { BriefingTranscriptSink } from "../briefing/briefing-transcript-sink";
import { collisionResistantId } from "../shared/file-storage";
import { ChatTranscriptStore } from "./chat-transcript.store";

/**
 * F8a (O6) — the concrete {@link BriefingTranscriptSink}: append a freshly
 * generated briefing to the chat transcript as an assistant turn carrying a
 * `briefing` payload. Still `role: "assistant"` — the butler is speaking, only the
 * payload shape differs from a plain markdown turn (see `chat.schema.ts`'s
 * docblock on the field). `text` holds the briefing's own headline so any
 * consumer that only reads `.text` (the read-aloud path, a client that hasn't
 * learned to render the card yet) still gets a sane plain-text fallback.
 *
 * Targets the single active conversation (`ensureConversation()`, no id) — chat is
 * MVP-single-thread (`ChatTranscriptStore`'s own docblock), so "the" transcript is
 * unambiguous. A conversation is minted if none exists yet (e.g. the very first
 * briefing ever generated, before the operator has said anything in chat).
 *
 * Deliberately NOT registered as a `ChatModule` provider — like
 * `AutomationAttachmentRefProvider`, it lives in its natural folder but is only
 * ever instantiated inside the no-cycle glue module
 * (`briefing/briefing-transcript-sink.module.ts`), which imports `ChatModule` to
 * reach {@link ChatTranscriptStore}.
 */
@Injectable()
export class ChatBriefingSinkService implements BriefingTranscriptSink {
  constructor(private readonly store: ChatTranscriptStore) {}

  async announce(briefing: Briefing): Promise<void> {
    const conversationId = await this.store.ensureConversation();
    const message: ChatMessage = {
      id: collisionResistantId("msg"),
      role: "assistant",
      text: briefing.headline,
      at: briefing.generatedAt,
      briefing,
    };
    await this.store.appendMessage(conversationId, message);
  }
}
