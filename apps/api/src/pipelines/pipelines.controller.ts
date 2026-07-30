import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { pipelinesContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  InvalidPipelineError,
  InvalidPipelineIdError,
  PipelineConflictError,
  PipelineNotFoundError,
} from "./pipelines.errors";
import { PipelinesStorageService } from "./pipelines.storage.service";

const errors = makeErrorMapper("Pipeline", {
  missing: [PipelineNotFoundError, InvalidPipelineIdError],
  conflict: [PipelineConflictError],
});

/** A dangling loop target (caught by the schema/storage) maps to a 422. */
const invalid = (error: unknown) =>
  error instanceof InvalidPipelineError
    ? ({ status: 422, body: { message: error.message } } as const)
    : undefined;

const unprocessable = (message: string) => ({ status: 422 as const, body: { message } });

/**
 * Implements `pipelinesContract` against the file-backed storage service. A
 * dangling loop target (caught by the schema/storage) maps to a 422; conflicts to
 * 409; missing/unsafe id to 404.
 */
@Controller()
export class PipelinesController {
  constructor(private readonly storage: PipelinesStorageService) {}

  @TsRestHandler(pipelinesContract)
  handler() {
    return tsRestHandler(pipelinesContract, {
      createPipeline: ({ body }) => {
        // NS2 F9: the mirror of `agents.controller.ts`' create guard. Since F9 the
        // switchboard routes only to subsystems, and a subsystem offers only its
        // own owned units — so a pipeline created without an owner would be
        // permanently unroutable. Create-only, like the agent guard: pre-F9
        // pipelines are tagged by the owner-backfill sweep, not rejected on read.
        if (!body.ownerSubsystem) {
          return Promise.resolve(unprocessable("ownerSubsystem is required"));
        }
        return errors.created(() => this.storage.create(body), invalid);
      },

      listPipelines: async () => ({ status: 200, body: await this.storage.list() }),

      getPipeline: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updatePipeline: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body), invalid),

      deletePipeline: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
