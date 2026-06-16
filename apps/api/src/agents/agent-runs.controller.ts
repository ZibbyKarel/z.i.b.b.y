import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { agentRunsContract } from "@zibby/contracts"
import { AgentRunnerService } from "./agent-runner.service"

/**
 * Implements the trimmed `agentRunsContract` against the {@link AgentRunnerService}.
 * Only the catalog-liveness `listRunning` endpoint survives the run-surface
 * unification; starting, detail, logs, stop, resume and delete all moved to the
 * unified `/api/tasks/runs/*` surface (a run is started only via a task).
 */
@Controller()
export class AgentRunsController {
  constructor(private readonly runner: AgentRunnerService) {}

  @TsRestHandler(agentRunsContract)
  handler() {
    return tsRestHandler(agentRunsContract, {
      listRunning: async () => ({ status: 200, body: this.runner.listRunning() }),
    })
  }
}
