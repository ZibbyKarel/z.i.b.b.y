import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { dataDir } from "../shared/data-dir";
import { COMMS_GRADUATION_FILE, CommsGraduationStore } from "./comms-graduation.store";
import { CommsService } from "./comms.service";
import { COMMS_LEDGER_DIR, ReplyLedgerStore } from "./reply-ledger.store";

/** Default ledger dir, anchored to `apps/api/data/comms/ledger`. */
export function resolveHeraldLedgerDir(): string {
  return process.env.COMMS_LEDGER_DIR ?? dataDir("com", "ledger");
}

/** Default graduations file, anchored to `apps/api/data/comms/graduations.json`. */
export function resolveHeraldGraduationFile(): string {
  return process.env.COMMS_GRADUATION_FILE ?? dataDir("com", "graduations.json");
}

/**
 * NS2 F6a — Comms's reply ledger + evidence-based Tier-2 graduation. A leaf
 * module (like `SecurityModule`): imported by `ChannelsModule` for the triage
 * flow's ledger writes + graduation checks; imports only `ApprovalsModule` (the
 * `comms-graduation` runner registration seam) — `ActivityLogModule` is
 * `@Global()` so `CommsService` injects `ActivityLogService` with no import
 * edge (same as `SecurityService`). Neither dependency imports back, so there
 * is no cycle.
 */
@Module({
  imports: [ApprovalsModule],
  providers: [
    { provide: COMMS_LEDGER_DIR, useFactory: resolveHeraldLedgerDir },
    { provide: COMMS_GRADUATION_FILE, useFactory: resolveHeraldGraduationFile },
    ReplyLedgerStore,
    CommsGraduationStore,
    CommsService,
  ],
  exports: [CommsService],
})
export class CommsModule {}
