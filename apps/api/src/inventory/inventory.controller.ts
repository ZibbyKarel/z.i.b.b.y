import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { inventoryContract } from "@zibby/contracts";
import {
  CorruptSkillFileError,
  InvalidSkillIdError,
  SkillNotFoundError,
} from "../skills/skills.errors";
import { InventoryService, InventorySkillConflictError } from "./inventory.service";

/** Implements `inventoryContract` (TODO 13). */
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @TsRestHandler(inventoryContract)
  handler() {
    return tsRestHandler(inventoryContract, {
      getInventory: async () => ({ status: 200, body: await this.inventory.getInventory() }),

      installSkill: async ({ params: { skillId } }) => {
        try {
          return { status: 200, body: await this.inventory.installSkill(skillId) };
        } catch (err) {
          if (
            err instanceof SkillNotFoundError ||
            err instanceof InvalidSkillIdError ||
            err instanceof CorruptSkillFileError
          ) {
            return { status: 404, body: { message: err.message } };
          }
          if (err instanceof InventorySkillConflictError) {
            return { status: 409, body: { message: err.message } };
          }
          throw err;
        }
      },
    });
  }
}
