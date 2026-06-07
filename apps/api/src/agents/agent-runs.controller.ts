import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { agentRunsContract } from "@zibby/contracts"
import { AgentNotFoundError, InvalidAgentIdError } from "./agents.errors"
import { AgentRunnerService, RunNotFoundError } from "./agent-runner.service"

/**
 * Implements `agentRunsContract` against the in-memory {@link AgentRunnerService}.
 * A missing agent (on start) or unknown/unsafe run id (everywhere else) is mapped
 * to a 404, mirroring the agents controller.
 */
@Controller()
export class AgentRunsController {
  constructor(private readonly runner: AgentRunnerService) {}

  @TsRestHandler(agentRunsContract)
  handler() {
    return tsRestHandler(agentRunsContract, {
      startRun: async ({ params: { id }, body }) => {
        try {
          const run = await this.runner.start(id, body.prompt, body.project ?? "")
          return { status: 201, body: run }
        } catch (error) {
          if (isMissing(error)) {
            return { status: 404, body: { message: `Agent "${id}" not found` } }
          }
          throw error
        }
      },

      listRunning: async () => ({ status: 200, body: this.runner.listRunning() }),

      listRuns: async () => ({ status: 200, body: await this.runner.listAll() }),

      getRun: async ({ params: { runId } }) => {
        try {
          return { status: 200, body: this.runner.get(runId) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },

      getRunLogs: async ({ params: { runId }, query: { offset } }) => {
        try {
          return { status: 200, body: await this.runner.readLog(runId, offset ?? 0) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },

      stopRun: async ({ params: { runId } }) => {
        try {
          return { status: 200, body: this.runner.stop(runId) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },

      deleteRun: async ({ params: { runId } }) => {
        try {
          await this.runner.delete(runId)
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
  return (
    error instanceof RunNotFoundError ||
    error instanceof AgentNotFoundError ||
    error instanceof InvalidAgentIdError
  )
}

function notFound(runId: string): string {
  return `Run "${runId}" not found`
}
