import * as path from "node:path"
import { Module } from "@nestjs/common"
import { PIPELINE_RUNS_DIR, PipelineRunnerService } from "./pipeline-runner.service"
import { PipelineRunsController } from "./pipeline-runs.controller"
import { PipelinesController } from "./pipelines.controller"
import { PIPELINES_DIR, PipelinesStorageService } from "./pipelines.storage.service"

/** Default pipelines dir, anchored to `apps/api/data/pipelines` like agents/skills. */
export function resolvePipelinesDir(): string {
  return process.env.PIPELINES_DIR ?? path.resolve(__dirname, "..", "..", "data", "pipelines")
}

/** Default directory for pipeline run artifacts (per-run roots with stage sandboxes). */
export function resolvePipelineRunsDir(): string {
  return (
    process.env.PIPELINE_RUNS_DIR ??
    path.resolve(__dirname, "..", "..", "data", "pipelines", "runs")
  )
}

@Module({
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
  exports: [PipelinesStorageService],
})
export class PipelinesModule {}
