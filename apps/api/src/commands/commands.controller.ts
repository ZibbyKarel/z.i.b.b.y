import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { commandsContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import {
  CommandConflictError,
  CommandNotFoundError,
  InvalidCommandIdError,
} from "./commands.errors"
import { CommandsStorageService } from "./commands.storage.service"

const errors = makeErrorMapper("Command", {
  missing: [CommandNotFoundError, InvalidCommandIdError],
  conflict: [CommandConflictError],
})

/**
 * Implements `commandsContract` against the file-backed storage service. Mirrors
 * `SkillsController`: bodies/params validated against the contract Zod schemas by
 * `@ts-rest/nest`; conflicts → 409, missing/unsafe id → 404.
 */
@Controller()
export class CommandsController {
  constructor(private readonly storage: CommandsStorageService) {}

  @TsRestHandler(commandsContract)
  handler() {
    return tsRestHandler(commandsContract, {
      createCommand: ({ body }) => errors.created(() => this.storage.create(body)),

      listCommands: async () => ({ status: 200, body: await this.storage.list() }),

      getCommand: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateCommand: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteCommand: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id)
          return { id }
        }),
    })
  }
}
