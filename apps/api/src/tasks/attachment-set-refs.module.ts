import { Global, Module } from "@nestjs/common";
import { AutomationAttachmentRefProvider } from "../automations/automation-attachment-ref.provider";
import { AutomationsModule } from "../automations/automations.module";
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
 * assembling the (currently one) contributor into the array
 * `TaskSchedulerService` expects. A second contributor would be added to this
 * same factory's array, not as a second `provide: ATTACHMENT_SET_REF_PROVIDER`
 * entry (which would just shadow this one).
 */
@Global()
@Module({
  imports: [AutomationsModule],
  providers: [
    AutomationAttachmentRefProvider,
    {
      provide: ATTACHMENT_SET_REF_PROVIDER,
      useFactory: (automationRefs: AutomationAttachmentRefProvider): AttachmentSetRefProvider[] => [
        automationRefs,
      ],
      inject: [AutomationAttachmentRefProvider],
    },
  ],
  exports: [ATTACHMENT_SET_REF_PROVIDER],
})
export class AttachmentSetRefsModule {}
