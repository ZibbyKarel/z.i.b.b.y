import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ArtifactsModule } from "../artifacts/artifacts.module";
import { GatesModule } from "../gates/gates.module";
import { LimitsModule } from "../limits/limits.module";
import { MemoryModule } from "../memory/memory.module";
import { ProjectsModule } from "../projects/projects.module";
import { ClaudeRunModule } from "../runner/claude-run.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { dataDir } from "../shared/data-dir";
import { PIPELINE_RUNS_DIR, PipelineRunnerService } from "./pipeline-runner.service";
import { PipelineRunsController } from "./pipeline-runs.controller";
import { PipelinesController } from "./pipelines.controller";
import { PIPELINES_DIR, PipelinesStorageService } from "./pipelines.storage.service";

/** Default pipelines dir, anchored to `apps/api/data/pipelines` like agents/skills. */
export function resolvePipelinesDir(): string {
  return process.env.PIPELINES_DIR ?? dataDir("pipelines");
}

/** Default directory for pipeline run artifacts (per-run roots with stage sandboxes). */
export function resolvePipelineRunsDir(): string {
  return process.env.PIPELINE_RUNS_DIR ?? dataDir("pipelines", "runs");
}

@Module({
  // AgentsModule exports AgentsStorageService (a stage loads its phase's agent);
  // ClaudeRunModule the `claude -p` command builder; Gates + Approvals back the
  // mid-run stage gate (intent evaluation → parked aggregate → approval card).
  //
  // A3: deliberately does NOT import `HandoffModule` — `HandoffModule` already
  // imports `PipelinesModule` (to resolve a pipeline-target rule's display
  // name), and `HandoffModule` -> `TasksModule` -> `PipelinesModule` is
  // already a diamond, so a static edge back here would close a module-file
  // require cycle that fans out through every module `TasksModule` pulls in
  // (Goals, Chains, Projects, …) — far more than a single forwardRef can
  // safely paper over. `PipelineRunnerService` instead resolves `HandoffService`
  // lazily via `ModuleRef` (see pipeline-runner.service.ts), the same
  // cross-module-boundary pattern `MemoryController.fireDistillNow` uses to
  // reach `MemoryDistillerService` without a static edge.
  imports: [
    AgentsModule,
    ArtifactsModule,
    ClaudeRunModule,
    GatesModule,
    ApprovalsModule,
    LimitsModule,
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
