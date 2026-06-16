import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { automationsContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import {
  AutomationConflictError,
  AutomationNotFoundError,
  AutomationsStorageService,
  InvalidAutomationIdError,
  SystemAutomationError,
} from "./automations.storage.service"
import { SchedulerService } from "./scheduler.service"

const errors = makeErrorMapper("Automation", {
  missing: [AutomationNotFoundError, InvalidAutomationIdError],
  conflict: [AutomationConflictError],
})

/** A system automation can't be deleted/retargeted — map that to a 409. */
const system409 = (error: unknown) =>
  error instanceof SystemAutomationError
    ? ({ status: 409 as const, body: { message: error.message } })
    : undefined

/** Implements `automationsContract` against the storage + scheduler. */
@Controller()
export class AutomationsController {
  constructor(
    private readonly storage: AutomationsStorageService,
    private readonly scheduler: SchedulerService,
  ) {}

  @TsRestHandler(automationsContract)
  handler() {
    return tsRestHandler(automationsContract, {
      createAutomation: ({ body }) => errors.created(() => this.storage.create(body)),

      listAutomations: async () => ({ status: 200, body: await this.storage.list() }),

      searchAutomations: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getAutomation: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateAutomation: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body), system409),

      deleteAutomation: ({ params: { id } }) =>
        errors.or404(
          id,
          async () => {
            await this.storage.delete(id)
            return { id }
          },
          system409,
        ),

      triggerAutomation: ({ params: { id } }) =>
        errors.or404(id, async () => ({ runRef: await this.scheduler.trigger(id) })),
    })
  }
}
