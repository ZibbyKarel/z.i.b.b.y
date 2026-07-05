import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { BudgetModule } from "../budget/budget.module";
import { ChainsModule } from "../chains/chains.module";
import { GatesModule } from "../gates/gates.module";
import { GoalsModule } from "../goals/goals.module";
import { LimitsModule } from "../limits/limits.module";
import { MemoryModule } from "../memory/memory.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { AttachmentStorageService } from "./attachment-storage.service";
import { ClaudeCliRouter } from "./claude-cli-router";
import { ClaudeCliTaskNamer } from "./claude-cli-task-namer";
import { KeywordScorer } from "./keyword-scorer";
import { ScheduledTasksStorageModule } from "./scheduled-tasks-storage.module";
import { TaskClassifierService } from "./task-classifier.service";
import { TaskOutputService } from "./task-output.service";
import { TASK_ROUTER } from "./task-router";
import { TaskRunLogsController } from "./task-run-logs.controller";
import { TaskRunsController } from "./task-runs.controller";
import { TaskRunsService } from "./task-runs.service";
import { TaskSchedulerService } from "./task-scheduler.service";
import { TasksController } from "./tasks.controller";

/**
 * Task routing + the deferred-task scheduler. Reuses the agents and pipelines
 * stores (imported for their catalog) and their runner services (to dispatch a
 * task — immediately or when a scheduled one comes due). ProjectsModule + BudgetModule
 * back Phase 8's project attribution and the budget/concurrency guard; the
 * scheduled-tasks store is its own module so BudgetModule can share it cycle-free.
 * The primary router is the `claude -p` AI categorizer; the keyword scorer is the
 * always-available fallback.
 */
@Module({
  imports: [
    AgentsModule,
    PipelinesModule,
    GoalsModule,
    ChainsModule,
    ProjectsModule,
    BudgetModule,
    ApprovalsModule,
    GatesModule,
    LimitsModule,
    WorkspaceModule,
    MemoryModule,
    ScheduledTasksStorageModule,
  ],
  controllers: [TasksController, TaskRunsController, TaskRunLogsController],
  providers: [
    TaskSchedulerService,
    TaskRunsService,
    TaskClassifierService,
    TaskOutputService,
    AttachmentStorageService,
    ClaudeCliTaskNamer,
    KeywordScorer,
    { provide: TASK_ROUTER, useClass: ClaudeCliRouter },
  ],
  // Re-export the storage module + scheduler so the channel triage flow (Phase 5.3)
  // can dispatch a task and read its outcome back onto the channel item.
  exports: [TaskSchedulerService, AttachmentStorageService, ScheduledTasksStorageModule],
})
export class TasksModule {}
