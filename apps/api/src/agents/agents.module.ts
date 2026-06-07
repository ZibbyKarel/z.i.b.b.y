import { Module } from "@nestjs/common"
import { AgentRunnerService, RUNS_DIR } from "./agent-runner.service"
import { AgentRunsController } from "./agent-runs.controller"
import { ApprovalsModule } from "../approvals/approvals.module"
import { GatesController } from "../gates/gates.controller"
import { GatesModule } from "../gates/gates.module"
import { LimitsModule } from "../limits/limits.module"
import { ClaudeRunModule } from "../runner/claude-run.module"
import { dataDir } from "../shared/data-dir"
import { AgentsController } from "./agents.controller"
import { AGENTS_DIR, AgentsStorageService } from "./agents.storage.service"
import { CategoriesController } from "./categories.controller"
import { CategoriesStorageService } from "./categories.storage.service"

/**
 * Default data directory when `AGENTS_DIR` is not set. Anchored to the api app's
 * own `apps/api/data/agents` (gitignored) via this file's location rather than
 * the process cwd, so dev (`ts-node`, cwd `apps/api`) and the test runner
 * (cwd = repo root) resolve to the same place instead of scattering a stray
 * `data/agents` wherever the process happened to start.
 */
export function resolveAgentsDir(): string {
  return process.env.AGENTS_DIR ?? dataDir("agents")
}

/** Default directory for run artifacts (logs + per-run sandboxes); a sibling of the
 * agents dir, resolved the same way so dev and the test runner agree. */
export function resolveRunsDir(): string {
  return process.env.AGENT_RUNS_DIR ?? dataDir("agents", "runs")
}

@Module({
  imports: [ApprovalsModule, GatesModule, ClaudeRunModule, LimitsModule],
  // CategoriesController, AgentRunsController and GatesController are declared
  // before AgentsController so their static / more-specific routes
  // (`GET /agents/categories`, `GET /agents/running`, `GET /agents/:id/gates`) are
  // registered ahead of the agents resource's `GET /agents/:id`.
  controllers: [CategoriesController, AgentRunsController, GatesController, AgentsController],
  providers: [
    { provide: AGENTS_DIR, useFactory: resolveAgentsDir },
    { provide: RUNS_DIR, useFactory: resolveRunsDir },
    AgentsStorageService,
    CategoriesStorageService,
    AgentRunnerService,
  ],
  exports: [AgentsStorageService, CategoriesStorageService, AgentRunnerService],
})
export class AgentsModule {}
