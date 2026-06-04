import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { gateRulesContract } from "@zibby/contracts"
import { GateRuleNotFoundError, InvalidGateRuleIdError } from "./gate-rules.errors"
import { GateRulesStorageService } from "./gate-rules.storage.service"

/**
 * Implements `gateRulesContract` — CRUD + reorder over the global gate-rule catalog
 * (the "Pravidla schvalování" page). A thin HTTP wrapper over the storage service;
 * a missing id is a 404 and a reorder that is not a permutation of the catalog is a
 * 422 (the storage layer is the single arbiter of both).
 */
@Controller()
export class GateRulesController {
  constructor(private readonly store: GateRulesStorageService) {}

  @TsRestHandler(gateRulesContract)
  handler() {
    return tsRestHandler(gateRulesContract, {
      listGateRules: async () => ({ status: 200, body: { rules: await this.store.list() } }),

      createGateRule: async ({ body }) => ({ status: 201, body: await this.store.create(body) }),

      reorderGateRules: async ({ body: { ids } }) => {
        const rules = await this.store.reorder(ids)
        if (!rules) return { status: 422, body: { message: "ids must be a permutation of the catalog" } }
        return { status: 200, body: { rules } }
      },

      updateGateRule: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.store.update(id, body) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      deleteGateRule: async ({ params: { id } }) => {
        try {
          await this.store.remove(id)
          return { status: 200, body: { id } }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },
    })
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof GateRuleNotFoundError || error instanceof InvalidGateRuleIdError
}

function notFound(id: string): string {
  return `Gate rule "${id}" not found`
}
