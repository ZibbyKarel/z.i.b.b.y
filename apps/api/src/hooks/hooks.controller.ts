import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { hooksContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import { HookConflictError, HookNotFoundError, InvalidHookIdError } from "./hooks.errors"
import { HooksStorageService } from "./hooks.storage.service"

const errors = makeErrorMapper("Hook", {
  missing: [HookNotFoundError, InvalidHookIdError],
  conflict: [HookConflictError],
})

/**
 * Implements `hooksContract` against the file-backed storage service. Mirrors
 * `SkillsController`: bodies/params validated against the contract Zod schemas by
 * `@ts-rest/nest`; conflicts → 409, missing/unsafe id → 404.
 */
@Controller()
export class HooksController {
  constructor(private readonly storage: HooksStorageService) {}

  @TsRestHandler(hooksContract)
  handler() {
    return tsRestHandler(hooksContract, {
      createHook: ({ body }) => errors.created(() => this.storage.create(body)),

      listHooks: async () => ({ status: 200, body: await this.storage.list() }),

      getHook: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateHook: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteHook: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id)
          return { id }
        }),
    })
  }
}
