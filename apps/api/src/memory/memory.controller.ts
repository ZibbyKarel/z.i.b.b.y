import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { memoryContract } from "@zibby/contracts"
import { NoteNotFoundError, VaultService } from "./vault.service"

/** Implements `memoryContract` against the {@link VaultService}. */
@Controller()
export class MemoryController {
  constructor(private readonly vault: VaultService) {}

  @TsRestHandler(memoryContract)
  handler() {
    return tsRestHandler(memoryContract, {
      getIndex: async () => ({ status: 200, body: { entries: await this.vault.index() } }),

      getNote: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.vault.note(id) }
        } catch (error) {
          if (error instanceof NoteNotFoundError) {
            return { status: 404, body: { message: error.message } }
          }
          throw error
        }
      },

      getGraph: async () => ({ status: 200, body: await this.vault.graph() }),

      search: async ({ query: { q } }) => ({ status: 200, body: { results: await this.vault.search(q) } }),

      appendDaily: async ({ body: { text } }) => ({ status: 201, body: await this.vault.appendDaily(text) }),
    })
  }
}
