import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { memoryContract } from "@zibby/contracts";
import {
  DuplicateNoteError,
  InvalidNoteIdError,
  NoteNotFoundError,
  VaultService,
} from "./vault.service";

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
          return { status: 200, body: await this.vault.note(id) };
        } catch (error) {
          if (error instanceof NoteNotFoundError) {
            return { status: 404, body: { message: error.message } };
          }
          throw error;
        }
      },

      getGraph: async () => ({ status: 200, body: await this.vault.graph() }),

      search: async ({ query: { q } }) => ({
        status: 200,
        body: { results: await this.vault.search(q) },
      }),

      appendDaily: async ({ body: { text } }) => ({
        status: 201,
        body: await this.vault.appendDaily(text),
      }),

      createNote: async ({ body }) => {
        try {
          return { status: 201, body: await this.vault.createNote(body) };
        } catch (error) {
          if (error instanceof DuplicateNoteError)
            return { status: 409, body: { message: error.message } };
          if (error instanceof InvalidNoteIdError)
            return { status: 422, body: { message: error.message } };
          throw error;
        }
      },

      updateNote: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.vault.updateNote(id, body) };
        } catch (error) {
          if (error instanceof NoteNotFoundError)
            return { status: 404, body: { message: error.message } };
          if (error instanceof InvalidNoteIdError)
            return { status: 422, body: { message: error.message } };
          throw error;
        }
      },

      appendToNote: async ({ params: { id }, body: { text } }) => {
        try {
          return { status: 200, body: await this.vault.appendToNote(id, text) };
        } catch (error) {
          if (error instanceof NoteNotFoundError)
            return { status: 404, body: { message: error.message } };
          if (error instanceof InvalidNoteIdError)
            return { status: 422, body: { message: error.message } };
          throw error;
        }
      },

      updateIndex: async ({ params: { id }, body: { target, label } }) => {
        try {
          return { status: 200, body: await this.vault.updateIndex(id, target, label) };
        } catch (error) {
          if (error instanceof InvalidNoteIdError)
            return { status: 422, body: { message: error.message } };
          throw error;
        }
      },
    });
  }
}
