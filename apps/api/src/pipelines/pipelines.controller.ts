import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { pipelinesContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import {
  InvalidPipelineError,
  InvalidPipelineIdError,
  PipelineConflictError,
  PipelineNotFoundError,
} from "./pipelines.errors"
import { PipelinesStorageService } from "./pipelines.storage.service"

const errors = makeErrorMapper("Pipeline", {
  missing: [PipelineNotFoundError, InvalidPipelineIdError],
  conflict: [PipelineConflictError],
})

/** A dangling loop target (caught by the schema/storage) maps to a 422. */
const invalid = (error: unknown) =>
  error instanceof InvalidPipelineError
    ? ({ status: 422, body: { message: error.message } } as const)
    : undefined

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
      createPipeline: ({ body }) => errors.created(() => this.storage.create(body), invalid),

      listPipelines: async () => ({ status: 200, body: await this.storage.list() }),

      getPipeline: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updatePipeline: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body), invalid),

      deletePipeline: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id)
          return { id }
        }),
    })
  }
}
