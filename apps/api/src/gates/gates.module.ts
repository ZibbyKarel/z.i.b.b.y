import { Module } from "@nestjs/common";
import { GateRulesModule } from "../gate-rules/gate-rules.module";
import { dataDir } from "../shared/data-dir";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { POLICY_DIR, PolicyStorageService } from "./policy.storage.service";

/** Default policy dir, anchored to `apps/api/data` (holds the locked POLICY.md). */
export function resolvePolicyDir(): string {
  return process.env.POLICY_DIR ?? dataDir();
}

/**
 * The gate policy engine. Deliberately has NO dependency on the agents module: the
 * evaluator is pure (floor + caller-supplied rules), so both the runner and the
 * gates controller can depend on it without a cycle (they live in the agents
 * module, which imports this). NS2 F3a adds the one data dependency the evaluator
 * does take: the global gate-rule catalog ({@link GateRulesModule}), read-only, as
 * the source of the per-subsystem rule bucket — one-directional (gate-rules
 * depends on nothing in gates), so still no cycle.
 */
@Module({
  imports: [GateRulesModule],
  providers: [
    { provide: POLICY_DIR, useFactory: resolvePolicyDir },
    PolicyStorageService,
    GateEvaluatorService,
  ],
  exports: [PolicyStorageService, GateEvaluatorService],
})
export class GatesModule {}
