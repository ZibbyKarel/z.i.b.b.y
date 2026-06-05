import { Module } from "@nestjs/common"
import { dataDir } from "../shared/data-dir"
import { ApprovalsController } from "./approvals.controller"
import { ApprovalsService } from "./approvals.service"
import { APPROVALS_DIR, ApprovalsStorageService } from "./approvals.storage.service"

/** Default approvals dir, anchored to `apps/api/data/approvals` like the run dirs. */
export function resolveApprovalsDir(): string {
  return process.env.APPROVALS_DIR ?? dataDir("approvals")
}

/**
 * The approval gate. Exports {@link ApprovalsService} so runner modules can inject
 * it to request approvals; runners register themselves with it at startup so a
 * decision routes back to the right runner (no module cycle — this module does not
 * import any runner module).
 */
@Module({
  controllers: [ApprovalsController],
  providers: [
    { provide: APPROVALS_DIR, useFactory: resolveApprovalsDir },
    ApprovalsStorageService,
    ApprovalsService,
  ],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
