import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { pipelineRunsContract } from "@zibby/contracts";
import { PipelineRunnerService } from "./pipeline-runner.service";

/**
 * Implements the trimmed `pipelineRunsContract` against {@link PipelineRunnerService}.
 * Only the catalog-liveness `listPipelineRuns` endpoint survives the run-surface
 * unification; starting, detail, resume, delete, stage logs and artifacts all
 * moved to the unified `/api/tasks/runs/*` surface (a run is started only via a task).
 */
@Controller()
export class PipelineRunsController {
  constructor(private readonly runner: PipelineRunnerService) {}

  @TsRestHandler(pipelineRunsContract)
  handler() {
    return tsRestHandler(pipelineRunsContract, {
      listPipelineRuns: async () => ({ status: 200, body: this.runner.list() }),
    });
  }
}
