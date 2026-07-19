import { Global, Module } from "@nestjs/common";
import { ChatBriefingSinkService } from "../chat/chat-briefing-sink.service";
import { ChatModule } from "../chat/chat.module";
import { BRIEFING_TRANSCRIPT_SINK, type BriefingTranscriptSink } from "./briefing-transcript-sink";

/**
 * F8a (O6) — the no-cycle glue for announcing a generated briefing into the chat
 * transcript. Imports `ChatModule` (to reach `ChatTranscriptStore` via
 * `ChatBriefingSinkService`) and is marked `@Global()` so its
 * `BRIEFING_TRANSCRIPT_SINK` export is injectable from `BriefingService` without
 * `BriefingModule` ever importing this module — or `ChatModule` — directly.
 *
 * Mirrors `tasks/attachment-set-refs.module.ts` exactly, same shape, same reason:
 * there `AttachmentSetRefsModule` → `AutomationsModule` → `TasksModule` lets
 * `TaskSchedulerService` (in `TasksModule`) receive a contributor from
 * `AutomationsModule` without `TasksModule` importing it (the reverse edge already
 * exists). Here `BriefingTranscriptSinkModule` → `ChatModule` → `BriefingModule`
 * lets `BriefingService` (in `BriefingModule`) announce into chat without
 * `BriefingModule` importing `ChatModule` (the reverse edge already exists too).
 * Imported once, in `app.module.ts`.
 */
@Global()
@Module({
  imports: [ChatModule],
  providers: [
    ChatBriefingSinkService,
    {
      provide: BRIEFING_TRANSCRIPT_SINK,
      useFactory: (sink: ChatBriefingSinkService): BriefingTranscriptSink[] => [sink],
      inject: [ChatBriefingSinkService],
    },
  ],
  exports: [BRIEFING_TRANSCRIPT_SINK],
})
export class BriefingTranscriptSinkModule {}
