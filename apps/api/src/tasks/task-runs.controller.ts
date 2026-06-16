import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { taskRunsContract } from "@zibby/contracts"
import { GoalRunNotParkedError } from "../goals/goals.errors"
import { RunNotRetriesParkedError } from "../pipelines/pipeline-runner.service"
import {
  TaskRunNotFoundError,
  TaskRunNotResumableError,
  TaskRunNotStoppableError,
  TaskRunsService,
} from "./task-runs.service"

/**
 * Implements `taskRunsContract` against {@link TaskRunsService}. An unknown run maps
 * to a 404; a stop/resume the run's kind doesn't support (or a non-parked resume) to
 * a 409. The service resolves the owning runner from a bare `runId`.
 */
@Controller()
export class TaskRunsController {
  constructor(private readonly runs: TaskRunsService) {}

  @TsRestHandler(taskRunsContract)
  handler() {
    return tsRestHandler(taskRunsContract, {
      listTaskRuns: async () => ({ status: 200, body: await this.runs.listTaskRuns() }),

      getTaskRun: async ({ params: { runId } }) => {
        try {
          return { status: 200, body: await this.runs.getTaskRun(runId) }
        } catch (error) {
          if (error instanceof TaskRunNotFoundError) {
            return { status: 404, body: { message: error.message } }
          }
          throw error
        }
      },

      getTaskRunLogs: async ({ params: { runId }, query: { offset } }) => {
        try {
          return { status: 200, body: await this.runs.getLogs(runId, offset ?? 0) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },

      getTaskRunStageLogs: async ({ params: { runId, phaseId }, query: { offset } }) => {
        try {
          return { status: 200, body: await this.runs.getStageLog(runId, phaseId, offset ?? 0) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },

      getTaskRunArtifact: async ({ params: { runId, name } }) => {
        const artifact = await this.runs.getArtifact(runId, name)
        if (!artifact) {
          return { status: 404, body: { message: `Artifact "${name}" not found for run "${runId}"` } }
        }
        return { status: 200, body: artifact }
      },

      stopTaskRun: async ({ params: { runId } }) => {
        try {
          return { status: 200, body: await this.runs.stop(runId) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          if (error instanceof TaskRunNotStoppableError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      resumeTaskRun: async ({ params: { runId }, body }) => {
        try {
          return { status: 200, body: await this.runs.resume(runId, body.note) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          if (
            error instanceof TaskRunNotResumableError ||
            error instanceof RunNotRetriesParkedError ||
            error instanceof GoalRunNotParkedError
          ) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      deleteTaskRun: async ({ params: { runId } }) => {
        try {
          await this.runs.delete(runId)
          return { status: 200, body: { runId } }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },
    })
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof TaskRunNotFoundError
}

function notFound(runId: string): string {
  return `Task run "${runId}" not found`
}
