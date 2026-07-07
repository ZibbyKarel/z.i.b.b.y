import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { LimitsModule } from "../limits/limits.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { ScheduledTasksStorageModule } from "../tasks/scheduled-tasks-storage.module";
import { BUDGET_CONFIG_FILE, BudgetConfigStore } from "./budget-config.store";
import { BudgetController } from "./budget.controller";
import { BudgetService } from "./budget.service";
import { BUDGET_LEDGER_DIR, BudgetLedgerStore } from "./ledger.store";

/** Default dispatch-ledger dir, anchored to `apps/api/data/budget-ledger` (gitignored). */
export function resolveBudgetLedgerDir(): string {
  return process.env.BUDGET_LEDGER_DIR ?? dataDir("budget-ledger");
}

/** Default global-config file, anchored to `apps/api/data/budget.json` (committed). */
export function resolveBudgetConfigFile(): string {
  return process.env.BUDGET_CONFIG_FILE ?? dataDir("budget.json");
}

/**
 * Budgets and caps (Phase 8.1). Imports the catalog (ProjectsModule), the account
 * limits (LimitsModule) and both runners (Agents/Pipelines) for live concurrency,
 * plus the standalone scheduled-tasks store for queued/held counts. Deliberately does
 * NOT import TasksModule — TasksModule imports THIS for the scheduler's budget guard,
 * so the dependency runs one way only (no cycle). Phase 70: also imports
 * ResolvedProjectModule so the budget guard enforces a project's EFFECTIVE
 * (company-merged) budget rather than its raw `budget` field.
 */
@Module({
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    LimitsModule,
    AgentsModule,
    PipelinesModule,
    ScheduledTasksStorageModule,
  ],
  controllers: [BudgetController],
  providers: [
    { provide: BUDGET_LEDGER_DIR, useFactory: resolveBudgetLedgerDir },
    { provide: BUDGET_CONFIG_FILE, useFactory: resolveBudgetConfigFile },
    BudgetLedgerStore,
    BudgetConfigStore,
    BudgetService,
  ],
  exports: [BudgetService],
})
export class BudgetModule {}
