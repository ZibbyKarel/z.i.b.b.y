import { Global, Module } from "@nestjs/common";
import { AutomationAttachmentRefProvider } from "../automations/automation-attachment-ref.provider";
import { AutomationsModule } from "../automations/automations.module";
import { ChatModule } from "../chat/chat.module";
import { ChatTranscriptStore } from "../chat/chat-transcript.store";
import { RoadmapAttachmentRefProvider } from "../roadmap/roadmap-attachment-ref.provider";
import { RoadmapModule } from "../roadmap/roadmap.module";
import type { AttachmentSetRefProvider } from "./attachment-set-ref-provider";
import { ATTACHMENT_SET_REF_PROVIDER } from "./attachment-set-ref-provider";

/**
 * Phase 116b — the no-cycle contributor registry for `TaskSchedulerService`'s 24h
 * attachment orphan sweep. `TasksModule` cannot import `AutomationsModule` (it
 * already imports `TasksModule` the other way round, for the `task`-target
 * dispatch case), so this tiny module is the seam instead: it imports
 * `AutomationsModule` itself (to read `AutomationsStorageService`) and is marked
 * `@Global()` so its `ATTACHMENT_SET_REF_PROVIDER` export is injectable from
 * `TaskSchedulerService` without `TasksModule` ever importing this module — or
 * `AutomationsModule` — directly. Imported once, in `app.module.ts`.
 *
 * NestJS has no Angular-style `multi: true` provider flag — a single token can
 * only bind to one provider per module — so the "registry" is a plain factory
 * assembling the contributors into the array `TaskSchedulerService` expects.
 * Phase 125a adds a second contributor (`RoadmapAttachmentRefProvider`, over
 * `RoadmapModule`'s exported `RoadmapStore`) the same way: extend this same
 * factory's array + `inject`, never add a second `provide:
 * ATTACHMENT_SET_REF_PROVIDER` entry (which would just shadow this one).
 *
 * D-020 adds a THIRD contributor, `ChatTranscriptStore` itself (it implements
 * {@link AttachmentSetRefProvider} directly rather than needing a dedicated
 * wrapper class — see its own docblock): a chat turn's `attachmentSetId`
 * survives in the persisted transcript for the conversation's whole lifetime,
 * long past any single turn, so it needs the same sweep exemption. `ChatModule`
 * already imports `TasksModule` (for `create_task`'s scheduler dependency) —
 * the same one-directional shape as `AutomationsModule`/`RoadmapModule` above,
 * so importing `ChatModule` here closes no cycle either.
 */
@Global()
@Module({
  imports: [AutomationsModule, RoadmapModule, ChatModule],
  providers: [
    AutomationAttachmentRefProvider,
    RoadmapAttachmentRefProvider,
    {
      provide: ATTACHMENT_SET_REF_PROVIDER,
      useFactory: (
        automationRefs: AutomationAttachmentRefProvider,
        roadmapRefs: RoadmapAttachmentRefProvider,
        chatTranscripts: ChatTranscriptStore,
      ): AttachmentSetRefProvider[] => [automationRefs, roadmapRefs, chatTranscripts],
      inject: [AutomationAttachmentRefProvider, RoadmapAttachmentRefProvider, ChatTranscriptStore],
    },
  ],
  exports: [ATTACHMENT_SET_REF_PROVIDER],
})
export class AttachmentSetRefsModule {}
