import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { dataDir } from "../shared/data-dir";
import { MACHINE_ACTIONS_DIR, MachineActionStore } from "./machine-action.store";
import { MachineConfigModule } from "./machine-config.module";
import { MachineController } from "./machine.controller";
import { MachineService } from "./machine.service";

/** Default machine actions dir, anchored to the data root. */
export function resolveMachineActionsDir(): string {
  return process.env.MACHINE_ACTIONS_DIR ?? dataDir("machine");
}

/**
 * Controlling the machine (N5a). Proposals park behind the ordinary approval
 * gate (ApprovalsModule); the service registers itself as the ResumableRunner
 * for the `machine` kind, so approve/reject route back here — the same seam
 * channel replies and Jira issues use. The activity log is @Global.
 *
 * Phase 76 additionally imports `MachineConfigModule` for the `/machine/config`
 * routes — an unrelated concern (no approval gate) that shares this module's
 * `/machine/*` route namespace; kept as its own leaf module (rather than
 * providers here) so `ProjectsModule` can depend on the config store too
 * without pulling in `ApprovalsModule`.
 */
@Module({
  imports: [ApprovalsModule, MachineConfigModule],
  controllers: [MachineController],
  providers: [
    { provide: MACHINE_ACTIONS_DIR, useFactory: resolveMachineActionsDir },
    MachineActionStore,
    MachineService,
  ],
  exports: [MachineService, MachineConfigModule],
})
export class MachineModule {}
