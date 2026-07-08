import { Injectable } from "@nestjs/common";
import type { MachineConfig, UpdateMachineConfigInput } from "@zibby/contracts";
import { MachineConfigStore } from "./machine-config.store";

/**
 * Phase 76 — thin service fronting {@link MachineConfigStore} for the
 * controller. Kept separate from `MachineService` (machine ACTIONS — N5a's
 * propose/approve gate) since per-machine config is an unrelated concern with
 * its own lifecycle (no approval gate, no `ResumableRunner` registration).
 */
@Injectable()
export class MachineConfigService {
  constructor(private readonly store: MachineConfigStore) {}

  async getConfig(): Promise<MachineConfig> {
    return this.store.read();
  }

  async updateConfig(patch: UpdateMachineConfigInput): Promise<MachineConfig> {
    return this.store.write(patch);
  }
}
