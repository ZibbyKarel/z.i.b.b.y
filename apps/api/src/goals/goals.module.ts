import { Module } from "@nestjs/common"
import { ActivityLogModule } from "../activity/activity-log.module"
import { AgentsModule } from "../agents/agents.module"
import { BudgetModule } from "../budget/budget.module"
import { PipelinesModule } from "../pipelines/pipelines.module"
import { ProjectsModule } from "../projects/projects.module"
import { WorkspaceModule } from "../workspace/workspace.module"
import { dataDir } from "../shared/data-dir"
import { GOAL_RUNS_DIR, GoalRunnerService } from "./goal-runner.service"
import { GoalRunsController } from "./goal-runs.controller"
import { GoalsController } from "./goals.controller"
import { GOALS_DIR, GoalsStorageService } from "./goals.storage.service"

/** Default goals dir, anchored to `apps/api/data/goals` like agents/pipelines. */
export function resolveGoalsDir(): string {
  return process.env.GOALS_DIR ?? dataDir("goals")
}

/** Default directory for goal run artifacts (per-run roots with the worktree + iteration logs). */
export function resolveGoalRunsDir(): string {
  return process.env.GOAL_RUNS_DIR ?? dataDir("goals", "runs")
}

@Module({
  // AgentsModule + PipelinesModule export their runners — the goal's maker is one
  // of them, dispatched verbatim (the inner loop). Workspace backs the per-run
  // worktree; Projects resolves the target project for cwd + budget attribution.
  imports: [AgentsModule, PipelinesModule, ProjectsModule, WorkspaceModule, BudgetModule, ActivityLogModule],
  // GoalRunsController is declared before GoalsController so its static routes
  // (`/goals/runs`, `/goals/runs/:id`) register ahead of `/goals/:id`, which would
  // otherwise capture "runs" as a goal id.
  controllers: [GoalRunsController, GoalsController],
  providers: [
    { provide: GOALS_DIR, useFactory: resolveGoalsDir },
    { provide: GOAL_RUNS_DIR, useFactory: resolveGoalRunsDir },
    GoalsStorageService,
    GoalRunnerService,
  ],
  exports: [GoalsStorageService, GoalRunnerService],
})
export class GoalsModule {}
