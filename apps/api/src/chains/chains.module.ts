import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module";
import { MemoryModule } from "../memory/memory.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { dataDir } from "../shared/data-dir";
import { CHAIN_RUNS_DIR, ChainRunnerService } from "./chain-runner.service";
import { ChainRunsController } from "./chain-runs.controller";
import { ChainsController } from "./chains.controller";
import { CHAINS_DIR, ChainsStorageService } from "./chains.storage.service";

/** Default chains dir, anchored to the data root like agents/pipelines. */
export function resolveChainsDir(): string {
  return process.env.CHAINS_DIR ?? dataDir("chains");
}

/** Default chain-run records dir (one JSON per run — files are the truth). */
export function resolveChainRunsDir(): string {
  return process.env.CHAIN_RUNS_DIR ?? dataDir("chains", "runs");
}

/**
 * Pipeline chaining (N2b): operator-authored chain definitions + the
 * completion-driven runner that hands each step's durable artifact (N2a) to the
 * next step as its input. Imports the pipelines module (step execution + create-
 * time validation), the artifact registry (the handoff medium), memory (vault
 * artifact content) and projects (project-file artifact content).
 */
@Module({
  imports: [PipelinesModule, ArtifactsModule, MemoryModule, ProjectsModule],
  // ChainRunsController first: its static `/chains/runs` routes must register
  // ahead of `/chains/:id` (same ordering trick as the pipelines module).
  controllers: [ChainRunsController, ChainsController],
  providers: [
    { provide: CHAINS_DIR, useFactory: resolveChainsDir },
    { provide: CHAIN_RUNS_DIR, useFactory: resolveChainRunsDir },
    ChainsStorageService,
    ChainRunnerService,
  ],
  exports: [ChainsStorageService, ChainRunnerService],
})
export class ChainsModule {}
