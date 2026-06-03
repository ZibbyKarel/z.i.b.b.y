import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { skillRunsContract } from "@zibby/contracts"
import { InvalidSkillIdError, SkillNotFoundError } from "./skills.errors"
import { RunNotFoundError, SkillRunnerService } from "./skill-runner.service"

/**
 * Implements `skillRunsContract` against {@link SkillRunnerService}. A missing
 * skill (on start) or unknown/unsafe run id (elsewhere) maps to a 404, mirroring
 * the agent-runs controller.
 */
@Controller()
export class SkillRunsController {
  constructor(private readonly runner: SkillRunnerService) {}

  @TsRestHandler(skillRunsContract)
  handler() {
    return tsRestHandler(skillRunsContract, {
      startSkillRun: async ({ params: { id }, body }) => {
        try {
          const run = await this.runner.start(id, body.prompt, body.project ?? "")
          return { status: 201, body: run }
        } catch (error) {
          if (isMissing(error)) {
            return { status: 404, body: { message: `Skill "${id}" not found` } }
          }
          throw error
        }
      },

      listRunningSkills: async () => ({ status: 200, body: this.runner.listRunning() }),

      getSkillRun: async ({ params: { runId } }) => {
        try {
          return { status: 200, body: this.runner.get(runId) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },

      getSkillRunLogs: async ({ params: { runId }, query: { offset } }) => {
        try {
          return { status: 200, body: await this.runner.readLog(runId, offset ?? 0) }
        } catch (error) {
          if (isMissing(error)) return { status: 404, body: { message: notFound(runId) } }
          throw error
        }
      },

      stopSkillRun: async ({ params: { runId } }) => {
        try {
          return { status: 200, body: this.runner.stop(runId) }
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
    error instanceof SkillNotFoundError ||
    error instanceof InvalidSkillIdError
  )
}

function notFound(runId: string): string {
  return `Run "${runId}" not found`
}
