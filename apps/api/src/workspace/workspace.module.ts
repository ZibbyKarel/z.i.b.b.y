import { Module } from "@nestjs/common";
import { WorkspaceService } from "./workspace.service";

/**
 * Provides the {@link WorkspaceService} (per-run git worktree management, Phase 3.1)
 * to the agent and pipeline runners. No DI deps of its own — pure `git` over
 * `execFile` — so it is a leaf module both runners import.
 */
@Module({
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
