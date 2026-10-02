import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ArtifactsModule } from "../artifacts/artifacts.module";
import { EmployeesModule } from "../employees/employees.module";
import { GatesModule } from "../gates/gates.module";
import { LimitsModule } from "../limits/limits.module";
import { MemoryModule } from "../memory/memory.module";
import { ProjectsModule } from "../projects/projects.module";
import { ClaudeRunModule } from "../runner/claude-run.module";
import { SignalBusModule } from "../automations/signal-bus.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { dataDir } from "../shared/data-dir";
import { WORKFLOW_RUNS_DIR, WorkflowRunnerService } from "./workflow-runner.service";
import { WorkflowRunsController } from "./workflow-runs.controller";
import { WorkflowsController } from "./workflows.controller";
import { WORKFLOWS_DIR, WorkflowsStorageService } from "./workflows.storage.service";

/** Default workflows dir, anchored to `apps/api/data/workflows` like agents/skills. */
export function resolveWorkflowsDir(): string {
  return process.env.WORKFLOWS_DIR ?? process.env.PIPELINES_DIR ?? dataDir("workflows");
}

/** Default directory for workflow run artifacts (per-run roots with stage sandboxes). */
export function resolveWorkflowRunsDir(): string {
  return (
    process.env.WORKFLOW_RUNS_DIR ?? process.env.PIPELINE_RUNS_DIR ?? dataDir("workflows", "runs")
  );
}

@Module({
  // AgentsModule exports AgentsStorageService (a stage loads its phase's agent);
  // ClaudeRunModule the `claude -p` command builder; Gates + Approvals back the
  // mid-run stage gate (intent evaluation → parked aggregate → approval card).
  //
  // SignalBusModule is a leaf (no TasksModule edge), so the runner can emit
  // `research-artifact` signals through plain constructor injection.
  imports: [
    AgentsModule,
    ArtifactsModule,
    ClaudeRunModule,
    EmployeesModule,
    GatesModule,
    ApprovalsModule,
    LimitsModule,
    MemoryModule,
    ProjectsModule,
    SignalBusModule,
    WorkspaceModule,
  ],
  // WorkflowRunsController is declared before WorkflowsController so its static
  // routes (`/workflows/runs`, `/workflows/runs/:id`) register ahead of
  // `/workflows/:id`, which would otherwise capture "runs" as a workflow id.
  controllers: [WorkflowRunsController, WorkflowsController],
  providers: [
    { provide: WORKFLOWS_DIR, useFactory: resolveWorkflowsDir },
    { provide: WORKFLOW_RUNS_DIR, useFactory: resolveWorkflowRunsDir },
    WorkflowsStorageService,
    WorkflowRunnerService,
  ],
  exports: [WorkflowsStorageService, WorkflowRunnerService],
})
export class WorkflowsModule {}
