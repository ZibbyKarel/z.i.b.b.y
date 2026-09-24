import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { dataDir } from "../shared/data-dir";
import { HERALD_GRADUATION_FILE, HeraldGraduationStore } from "./herald-graduation.store";
import { HeraldService } from "./herald.service";
import { HERALD_LEDGER_DIR, ReplyLedgerStore } from "./reply-ledger.store";

/** Default ledger dir, anchored to `apps/api/data/herald/ledger`. */
export function resolveHeraldLedgerDir(): string {
  return process.env.HERALD_LEDGER_DIR ?? dataDir("herald", "ledger");
}

/** Default graduations file, anchored to `apps/api/data/herald/graduations.json`. */
export function resolveHeraldGraduationFile(): string {
  return process.env.HERALD_GRADUATION_FILE ?? dataDir("herald", "graduations.json");
}

/**
 * NS2 F6a — Herald's reply ledger + evidence-based Tier-2 graduation. A leaf
 * module (like `SentinelModule`): imported by `ChannelsModule` for the triage
 * flow's ledger writes + graduation checks; imports only `ApprovalsModule` (the
 * `herald-graduation` runner registration seam) — `ActivityLogModule` is
 * `@Global()` so `HeraldService` injects `ActivityLogService` with no import
 * edge (same as `SentinelService`). Neither dependency imports back, so there
 * is no cycle.
 */
@Module({
  imports: [ApprovalsModule],
  providers: [
    { provide: HERALD_LEDGER_DIR, useFactory: resolveHeraldLedgerDir },
    { provide: HERALD_GRADUATION_FILE, useFactory: resolveHeraldGraduationFile },
    ReplyLedgerStore,
    HeraldGraduationStore,
    HeraldService,
  ],
  exports: [HeraldService],
})
export class HeraldModule {}
