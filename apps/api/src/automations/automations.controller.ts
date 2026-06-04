import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { automationsContract } from "@zibby/contracts"
import {
  AutomationConflictError,
  AutomationNotFoundError,
  AutomationsStorageService,
  InvalidAutomationIdError,
} from "./automations.storage.service"
import { SchedulerService } from "./scheduler.service"

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
      createAutomation: async ({ body }) => {
        try {
          return { status: 201, body: await this.storage.create(body) }
        } catch (error) {
          if (error instanceof AutomationConflictError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      listAutomations: async () => ({ status: 200, body: await this.storage.list() }),

      getAutomation: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.storage.get(id) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      updateAutomation: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.storage.update(id, body) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      deleteAutomation: async ({ params: { id } }) => {
        try {
          await this.storage.delete(id)
          return { status: 200, body: { id } }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      triggerAutomation: async ({ params: { id } }) => {
        try {
          return { status: 200, body: { runRef: await this.scheduler.trigger(id) } }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },
    })
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof AutomationNotFoundError || error instanceof InvalidAutomationIdError
}

function notFound(id: string): string {
  return `Automation "${id}" not found`
}
