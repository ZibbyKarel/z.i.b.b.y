/**
 * Phase 116b — the no-cycle seam for `TaskSchedulerService`'s 24h attachment
 * orphan sweep (see `sweepOrphanAttachmentSets`). The sweep normally only keeps a
 * set alive when a persisted `ScheduledTask` references it; a `task`-target
 * automation ALSO references an attachment set, but it never becomes a
 * `ScheduledTask` until the moment it actually fires — so without an extra
 * exemption its files could age past the TTL between cron runs and vanish before
 * the automation ever dispatches.
 *
 * `TasksModule` cannot import `AutomationsModule` to ask it directly (Phase 116b:
 * `AutomationsModule` already imports `TasksModule` the other way, for the
 * `task`-target dispatch case — importing back would cycle). Instead
 * `TaskSchedulerService` accepts any number of `AttachmentSetRefProvider`s via this
 * DI token and unions their ids into the sweep's "keep" set. See
 * `attachment-set-refs.module.ts` for how a contributor is wired in without either
 * module importing the other.
 */
export const ATTACHMENT_SET_REF_PROVIDER = "ATTACHMENT_SET_REF_PROVIDER";

/** One contributor's referenced attachment-set ids — never throws (callers catch). */
export interface AttachmentSetRefProvider {
  referencedSetIds(): Promise<string[]>;
}
