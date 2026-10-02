import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { workflowRunsContract } from "@zibby/contracts";
import { WorkflowRunnerService } from "./workflow-runner.service";

/**
 * Implements the trimmed `workflowRunsContract` against {@link WorkflowRunnerService}.
 * Only the catalog-liveness `listWorkflowRuns` endpoint survives the run-surface
 * unification; starting, detail, resume, delete, stage logs and artifacts all
 * moved to the unified `/api/tasks/runs/*` surface (a run is started only via a task).
 */
@Controller()
export class WorkflowRunsController {
  constructor(private readonly runner: WorkflowRunnerService) {}

  @TsRestHandler(workflowRunsContract)
  handler() {
    return tsRestHandler(workflowRunsContract, {
      listWorkflowRuns: async () => ({ status: 200, body: this.runner.list() }),
    });
  }
}
