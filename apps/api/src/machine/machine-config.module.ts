import { Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { MACHINE_CONFIG_FILE, MachineConfigStore } from "./machine-config.store";
import { MachineConfigService } from "./machine-config.service";

/**
 * Default machine config file (Phase 76), anchored to the data root. Kept
 * under the same `machine` sub-dir as the actions store (`MachineModule`) for
 * locality, but as its own `config.json` — and, unlike the actions dir,
 * gitignored (see `.gitignore`): this file is per-machine and must never sync.
 */
export function resolveMachineConfigFile(): string {
  return process.env.MACHINE_CONFIG_FILE ?? dataDir("machine", "config.json");
}

/**
 * Phase 76 — a small leaf module (no imports of its own) so both `MachineModule`
 * (for the `/machine/config` routes) and `ProjectsModule` (for
 * `ProjectLocalService`'s clone-root lookups) can depend on the per-machine
 * config store without pulling in `MachineModule`'s heavier graph
 * (`ApprovalsModule`, the machine-actions gate) or creating an import cycle.
 */
@Module({
  providers: [
    { provide: MACHINE_CONFIG_FILE, useFactory: resolveMachineConfigFile },
    MachineConfigStore,
    MachineConfigService,
  ],
  exports: [MachineConfigStore, MachineConfigService],
})
export class MachineConfigModule {}
