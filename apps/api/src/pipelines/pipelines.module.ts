import { Module } from "@nestjs/common"
import { AgentsModule } from "../agents/agents.module"
import { ApprovalsModule } from "../approvals/approvals.module"
import { GatesModule } from "../gates/gates.module"
import { MemoryModule } from "../memory/memory.module"
import { ProjectsModule } from "../projects/projects.module"
import { ClaudeRunModule } from "../runner/claude-run.module"
import { WorkspaceModule } from "../workspace/workspace.module"
import { dataDir } from "../shared/data-dir"
import { PIPELINE_RUNS_DIR, PipelineRunnerService } from "./pipeline-runner.service"
import { PipelineRunsController } from "./pipeline-runs.controller"
import { PipelinesController } from "./pipelines.controller"
import { PIPELINES_DIR, PipelinesStorageService } from "./pipelines.storage.service"

/** Default pipelines dir, anchored to `apps/api/data/pipelines` like agents/skills. */
export function resolvePipelinesDir(): string {
  return process.env.PIPELINES_DIR ?? dataDir("pipelines")
}

/** Default directory for pipeline run artifacts (per-run roots with stage sandboxes). */
export function resolvePipelineRunsDir(): string {
  return process.env.PIPELINE_RUNS_DIR ?? dataDir("pipelines", "runs")
}

@Module({
  // AgentsModule exports AgentsStorageService (a stage loads its phase's agent);
  // ClaudeRunModule the `claude -p` command builder; Gates + Approvals back the
  // mid-run stage gate (intent evaluation → parked aggregate → approval card).
  imports: [
    AgentsModule,
    ClaudeRunModule,
    GatesModule,
    ApprovalsModule,
    MemoryModule,
    ProjectsModule,
    WorkspaceModule,
  ],
  // PipelineRunsController is declared before PipelinesController so its static
  // routes (`/pipelines/runs`, `/pipelines/runs/:id`) register ahead of
  // `/pipelines/:id`, which would otherwise capture "runs" as a pipeline id.
  controllers: [PipelineRunsController, PipelinesController],
  providers: [
    { provide: PIPELINES_DIR, useFactory: resolvePipelinesDir },
    { provide: PIPELINE_RUNS_DIR, useFactory: resolvePipelineRunsDir },
    PipelinesStorageService,
    PipelineRunnerService,
  ],
  exports: [PipelinesStorageService, PipelineRunnerService],
})
export class PipelinesModule {}
