import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { machineContract } from "@zibby/contracts";
import { MachineActionRejectedError, MachineService } from "./machine.service";
import { MachineActionStore } from "./machine-action.store";
import { MachineConfigService } from "./machine-config.service";

/**
 * Implements `machineContract` — propose + read-only for actions (there is
 * deliberately no execute route: execution happens exclusively through the
 * approval gate), plus GET/PUT of THIS machine's per-machine config (Phase 76).
 */
@Controller()
export class MachineController {
  constructor(
    private readonly machine: MachineService,
    private readonly store: MachineActionStore,
    private readonly config: MachineConfigService,
  ) {}

  @TsRestHandler(machineContract)
  handler() {
    return tsRestHandler(machineContract, {
      proposeMachineAction: async ({ body }) => {
        try {
          return { status: 201, body: await this.machine.propose(body.action) };
        } catch (err) {
          if (err instanceof MachineActionRejectedError) {
            return { status: 422, body: { message: err.message } };
          }
          throw err;
        }
      },

      listMachineActions: async () => ({ status: 200, body: await this.store.list() }),

      getMachineAction: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.store.get(id) };
        } catch {
          return { status: 404, body: { message: `Machine action "${id}" not found` } };
        }
      },

      getMachineConfig: async () => ({ status: 200, body: await this.config.getConfig() }),

      updateMachineConfig: async ({ body }) => ({
        status: 200,
        body: await this.config.updateConfig(body),
      }),
    });
  }
}
