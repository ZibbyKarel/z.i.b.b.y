import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { pipelinesContract } from "@zibby/contracts"
import {
  InvalidPipelineError,
  InvalidPipelineIdError,
  PipelineConflictError,
  PipelineNotFoundError,
} from "./pipelines.errors"
import { PipelinesStorageService } from "./pipelines.storage.service"

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
      createPipeline: async ({ body }) => {
        try {
          return { status: 201, body: await this.storage.create(body) }
        } catch (error) {
          if (error instanceof PipelineConflictError) {
            return { status: 409, body: { message: error.message } }
          }
          if (error instanceof InvalidPipelineError) {
            return { status: 422, body: { message: error.message } }
          }
          throw error
        }
      },

      listPipelines: async () => ({ status: 200, body: await this.storage.list() }),

      getPipeline: async ({ params: { id } }) => {
        try {
          return { status: 200, body: await this.storage.get(id) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },

      updatePipeline: async ({ params: { id }, body }) => {
        try {
          return { status: 200, body: await this.storage.update(id, body) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          if (error instanceof InvalidPipelineError) {
            return { status: 422, body: { message: error.message } }
          }
          throw error
        }
      },

      deletePipeline: async ({ params: { id } }) => {
        try {
          await this.storage.delete(id)
          return { status: 200, body: { id } }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(id) } }
          throw error
        }
      },
    })
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof PipelineNotFoundError || error instanceof InvalidPipelineIdError
}

function notFound(id: string): string {
  return `Pipeline "${id}" not found`
}
