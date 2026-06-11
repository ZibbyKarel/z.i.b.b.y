import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { pipelineRunsContract } from "@zibby/contracts"
import { ClaudeUnavailableError } from "../runner/claude-preflight.service"
import { InvalidPipelineIdError, PipelineNotFoundError } from "./pipelines.errors"
import {
  PipelineRunNotFoundError,
  PipelineRunnerService,
  RunNotFoundError,
  RunNotRetriesParkedError,
} from "./pipeline-runner.service"

/**
 * Implements `pipelineRunsContract` against {@link PipelineRunnerService}. A
 * missing pipeline (on start) or unknown run/stage (elsewhere) maps to a 404.
 */
@Controller()
export class PipelineRunsController {
  constructor(private readonly runner: PipelineRunnerService) {}

  @TsRestHandler(pipelineRunsContract)
  handler() {
    return tsRestHandler(pipelineRunsContract, {
      startPipelineRun: async ({ params: { id }, body }) => {
        try {
          const run = await this.runner.start(id, undefined, body.project)
          return { status: 201, body: run }
        } catch (error) {
          if (isMissingPipeline(error)) {
            return { status: 404, body: { message: `Pipeline "${id}" not found` } }
          }
          if (error instanceof ClaudeUnavailableError) {
            return { status: 503, body: { message: error.message } }
          }
          throw error
        }
      },

      listPipelineRuns: async () => ({ status: 200, body: this.runner.list() }),

      listAllPipelineRuns: async () => ({ status: 200, body: await this.runner.listAll() }),

      getPipelineRun: async ({ params: { pipelineRunId } }) => {
        try {
          return { status: 200, body: this.runner.get(pipelineRunId) }
        } catch (error) {
          if (isMissingRun(error)) return { status: 404, body: { message: notFound(pipelineRunId) } }
          throw error
        }
      },

      resumePipelineRun: async ({ params: { pipelineRunId }, body }) => {
        try {
          return { status: 200, body: await this.runner.resumeParked(pipelineRunId, body.note) }
        } catch (error) {
          if (isMissingRun(error)) return { status: 404, body: { message: notFound(pipelineRunId) } }
          if (error instanceof RunNotRetriesParkedError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      getStageRunLogs: async ({ params: { pipelineRunId, phaseId }, query: { offset } }) => {
        try {
          return { status: 200, body: await this.runner.readStageLog(pipelineRunId, phaseId, offset ?? 0) }
        } catch (error) {
          if (isMissingRun(error)) return { status: 404, body: { message: notFound(pipelineRunId) } }
          throw error
        }
      },

      deletePipelineRun: async ({ params: { pipelineRunId } }) => {
        try {
          await this.runner.delete(pipelineRunId)
          return { status: 200, body: { pipelineRunId } }
        } catch (error) {
          if (isMissingRun(error)) return { status: 404, body: { message: notFound(pipelineRunId) } }
          throw error
        }
      },
    })
  }
}

function isMissingPipeline(error: unknown): boolean {
  return error instanceof PipelineNotFoundError || error instanceof InvalidPipelineIdError
}

function isMissingRun(error: unknown): boolean {
  return error instanceof PipelineRunNotFoundError || error instanceof RunNotFoundError
}

function notFound(id: string): string {
  return `Pipeline run "${id}" not found`
}
