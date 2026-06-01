import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { agentsContract } from "@zibby/contracts"
import {
  AgentConflictError,
  AgentNotFoundError,
  InvalidAgentIdError,
} from "./agents.errors"
import { AgentsStorageService } from "./agents.storage.service"

/**
 * Implements `agentsContract` against the file-backed storage service. Request
 * bodies, query and path params are validated against the contract's Zod schemas
 * by `@ts-rest/nest` before a handler runs (invalid input → 400).
 */
@Controller()
export class AgentsController {
  constructor(private readonly storage: AgentsStorageService) {}

  @TsRestHandler(agentsContract)
  handler() {
    return tsRestHandler(agentsContract, {
      createAgent: async ({ body }) => {
        try {
          const agent = await this.storage.create(body)
          return { status: 201, body: agent }
        } catch (error) {
          if (error instanceof AgentConflictError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      listAgents: async () => ({ status: 200, body: await this.storage.list() }),

      getAgent: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.storage.get(id) }
        } catch (error) {
          if (isMissing(error)) {
            return { status: 404, body: { message: notFoundMessage(id) } }
          }
          throw error
        }
      },

      updateAgent: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.storage.update(id, body) }
        } catch (error) {
          if (isMissing(error)) {
            return { status: 404, body: { message: notFoundMessage(id) } }
          }
          throw error
        }
      },

      deleteAgent: async ({ params: { id } }) => {
        try {
          await this.storage.delete(id)
          return { status: 200, body: { id } }
        } catch (error) {
          if (isMissing(error)) {
            return { status: 404, body: { message: notFoundMessage(id) } }
          }
          throw error
        }
      },
    })
  }
}

/** Treat both "no such file" and "unsafe id" as a 404 for read/update/delete. */
function isMissing(error: unknown): boolean {
  return error instanceof AgentNotFoundError || error instanceof InvalidAgentIdError
}

function notFoundMessage(id: string): string {
  return `Agent "${id}" not found`
}
