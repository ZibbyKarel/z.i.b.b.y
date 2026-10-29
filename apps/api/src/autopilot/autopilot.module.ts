import { Global, Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { dataDir } from "../shared/data-dir";
import { AutopilotController } from "./autopilot.controller";
import { AUTOPILOT_DIR, AutopilotService } from "./autopilot.service";

/** Default dir: the data root itself (`.zibby/data/autopilot.json`). */
export function resolveAutopilotDir(): string {
  return process.env.AUTOPILOT_DIR ?? dataDir();
}

/**
 * Phase 4 — Autopilot. `@Global` like the activity log: its readers span the gate
 * evaluator, the task-output / channel / workflow park sites and the chat tool, and
 * import edges to each would be noise. Depends only on ApprovalsModule (the pending
 * count and the token), which imports nothing back — no cycle.
 */
@Global()
@Module({
  imports: [ApprovalsModule],
  controllers: [AutopilotController],
  providers: [{ provide: AUTOPILOT_DIR, useFactory: resolveAutopilotDir }, AutopilotService],
  exports: [AutopilotService],
})
export class AutopilotModule {}
