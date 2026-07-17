import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { SUBSYSTEM_FINDINGS_DIR, SubsystemFindingsStore } from "./subsystem-findings.store";

/** Default findings-snapshot dir, anchored to `apps/api/data/subsystems/findings`. */
export function resolveSubsystemFindingsDir(): string {
  return process.env.SUBSYSTEM_FINDINGS_DIR ?? dataDir("subsystems", "findings");
}

/**
 * NS2 F5a — the shared snapshot-store leaf module, imported by `SentinelModule`
 * and `LoomModule` (F5c). Deliberately NOT folded into `SubsystemsModule` — that
 * module imports Pipelines/Chains/Approvals/Tasks/Agents/Integrations, and
 * neither Sentinel nor Loom needs any of that; a plain leaf module keeps both
 * chairs' dependency graphs small (no cycle risk either way).
 */
@Module({
  providers: [
    { provide: SUBSYSTEM_FINDINGS_DIR, useFactory: resolveSubsystemFindingsDir },
    SubsystemFindingsStore,
  ],
  exports: [SubsystemFindingsStore],
})
export class SubsystemFindingsModule {}
