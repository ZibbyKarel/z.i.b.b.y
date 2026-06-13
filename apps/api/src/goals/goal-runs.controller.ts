import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { goalRunsContract } from "@zibby/contracts"
import { ClaudeUnavailableError } from "../runner/claude-preflight.service"
import { GoalRunnerService } from "./goal-runner.service"
import {
  GoalNotFoundError,
  GoalRunNotFoundError,
  GoalRunNotParkedError,
  InvalidGoalIdError,
} from "./goals.errors"

/**
 * Implements `goalRunsContract` against {@link GoalRunnerService}. A missing goal
 * (on start) or unknown run (elsewhere) maps to a 404; a resume of a non-parked
 * run to a 409.
 */
@Controller()
export class GoalRunsController {
  constructor(private readonly runner: GoalRunnerService) {}

  @TsRestHandler(goalRunsContract)
  handler() {
    return tsRestHandler(goalRunsContract, {
      startGoalRun: async ({ params: { id }, body }) => {
        try {
          const run = await this.runner.start(id, "", body.project ?? "", body.files, body.title)
          return { status: 201, body: run }
        } catch (error) {
          if (isMissingGoal(error)) {
            return { status: 404, body: { message: `Goal "${id}" not found` } }
          }
          if (error instanceof ClaudeUnavailableError) {
            return { status: 503, body: { message: error.message } }
          }
          throw error
        }
      },

      listGoalRuns: async () => ({ status: 200, body: this.runner.list() }),

      listAllGoalRuns: async () => ({ status: 200, body: await this.runner.listAll() }),

      getGoalRun: async ({ params: { goalRunId } }) => {
        try {
          return { status: 200, body: this.runner.get(goalRunId) }
        } catch (error) {
          if (error instanceof GoalRunNotFoundError) {
            return { status: 404, body: { message: notFound(goalRunId) } }
          }
          throw error
        }
      },

      resumeGoalRun: async ({ params: { goalRunId }, body }) => {
        try {
          return { status: 200, body: await this.runner.resumeParked(goalRunId, body.note) }
        } catch (error) {
          if (error instanceof GoalRunNotFoundError) {
            return { status: 404, body: { message: notFound(goalRunId) } }
          }
          if (error instanceof GoalRunNotParkedError) {
            return { status: 409, body: { message: error.message } }
          }
          throw error
        }
      },

      getGoalRunArtifact: async ({ params: { goalRunId, name } }) => {
        const artifact = await this.runner.readArtifact(goalRunId, name)
        if (!artifact) {
          return { status: 404, body: { message: `Artifact "${name}" not found for run "${goalRunId}"` } }
        }
        return { status: 200, body: artifact }
      },

      deleteGoalRun: async ({ params: { goalRunId } }) => {
        try {
          await this.runner.delete(goalRunId)
          return { status: 200, body: { goalRunId } }
        } catch (error) {
          if (error instanceof GoalRunNotFoundError) {
            return { status: 404, body: { message: notFound(goalRunId) } }
          }
          throw error
        }
      },
    })
  }
}

function isMissingGoal(error: unknown): boolean {
  return error instanceof GoalNotFoundError || error instanceof InvalidGoalIdError
}

function notFound(id: string): string {
  return `Goal run "${id}" not found`
}
