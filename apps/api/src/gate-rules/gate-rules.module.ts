import * as path from "node:path"
import { Module } from "@nestjs/common"
import { GateRulesController } from "./gate-rules.controller"
import { GATE_RULES_DIR, GateRulesStorageService } from "./gate-rules.storage.service"

/** Default catalog dir, anchored to `apps/api/data` (holds `gate-rules.json`). */
export function resolveGateRulesDir(): string {
  return process.env.GATE_RULES_DIR ?? path.resolve(__dirname, "..", "..", "data")
}

/**
 * The global gate-rule catalog (the "Pravidla schvalování" page). A standalone
 * resource: the catalog is pure data that agents/skills reference by id, so this
 * module has no dependency on the agents or skills modules — usage is composed on
 * the client from each entity's `gateRuleIds`.
 */
@Module({
  controllers: [GateRulesController],
  providers: [
    { provide: GATE_RULES_DIR, useFactory: resolveGateRulesDir },
    GateRulesStorageService,
  ],
  exports: [GateRulesStorageService],
})
export class GateRulesModule {}
