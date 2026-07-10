import { randomUUID } from "node:crypto";
import { Controller, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { memoryContract } from "@zibby/contracts";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { MemoryDistillerService } from "./memory-distiller.service";
import {
  ImportPathNotDirectoryError,
  ImportPathNotFoundError,
  ImportPathUnreadableError,
  MemoryImportService,
} from "./memory-import.service";
import {
  DuplicateNoteError,
  InvalidNoteIdError,
  NoteNotFoundError,
  SimilarNoteError,
  VaultService,
} from "./vault.service";

/** Implements `memoryContract` against the {@link VaultService}. */
@Controller()
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(
    private readonly vault: VaultService,
    private readonly importer: MemoryImportService,
    private readonly trace: TraceContextService,
    private readonly moduleRef: ModuleRef,
  ) {}

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
          if (error instanceof DuplicateNoteError || error instanceof SimilarNoteError)
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

      import: async ({ body: { sourcePath, distillNow } }) => {
        try {
          const result = await this.importer.stageFrom(sourcePath);
          if (!distillNow) return { status: 200, body: result };
          // Detached (phase 112): fired but NOT awaited — the HTTP response
          // returns immediately with distillTriggered:true. Resolved lazily via
          // ModuleRef rather than constructor injection: MemoryModule does not
          // statically import MemoryDistillerModule (which itself imports
          // MemoryModule, for the vault) — a static edge the other way would
          // close a Nest DI cycle, so this crosses the module boundary lazily.
          const traceId = randomUUID();
          void this.fireDistillNow(traceId);
          return { status: 200, body: { ...result, distillTriggered: true } };
        } catch (error) {
          if (error instanceof ImportPathNotFoundError) {
            return { status: 400, body: { message: error.message } };
          }
          if (
            error instanceof ImportPathNotDirectoryError ||
            error instanceof ImportPathUnreadableError
          ) {
            return { status: 422, body: { message: error.message } };
          }
          throw error;
        }
      },
    });
  }

  /**
   * Fire a distillation pass now, scoped to its own trace (mirrors the
   * scheduler's cron-fired `trace.run(...)` around `dispatch()`). Fail-open: a
   * rejecting detached run is logged only — the HTTP response has already
   * returned by the time this settles.
   */
  private async fireDistillNow(traceId: string): Promise<void> {
    try {
      const distiller = this.moduleRef.get(MemoryDistillerService, { strict: false });
      await this.trace.run({ traceId }, () => distiller.distill());
    } catch (error) {
      this.logger.warn(`detached distill-now run failed: ${String(error)}`);
    }
  }
}
