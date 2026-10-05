import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ApprovalsModule } from "../approvals/approvals.module";
import { EmployeesModule } from "../employees/employees.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { MandateModule } from "../mandate/mandate.module";
import { dataDir } from "../shared/data-dir";
import { WorkflowsModule } from "../workflows/workflows.module";
import { TasksModule } from "../tasks/tasks.module";
import { OwnerBackfillService } from "./owner-backfill.service";
import { DEPARTMENT_SEEN_FILE, DepartmentSeenStore } from "./department-seen.store";
import { DepartmentsController } from "./departments.controller";
import { DepartmentsService } from "./departments.service";
import { NotificationsController } from "./notifications.controller";
import { RUN_READ_FILE, RunReadStore } from "./run-read.store";

/** Default seen-state file, anchored to the data root: `.zibby/data/department-seen.json`. */
export function resolveDepartmentSeenFile(): string {
  return process.env.DEPARTMENT_SEEN_FILE ?? dataDir("department-seen.json");
}

/** The bell's read state: `.zibby/data/run-read.json`. */
export function resolveRunReadFile(): string {
  return process.env.RUN_READ_FILE ?? dataDir("run-read.json");
}

/**
 * The department-federation registry endpoint (design doc
 * `docs/superpowers/specs/2026-07-08-department-federation-design.md`). Phase 82
 * wires the real aggregation: workflows storage for `department`
 * attribution, the unified task-runs feed (`TasksModule`) for run state, and
 * `ApprovalsModule` for pending Tier-3 items — read-only over all three, no
 * domain logic duplicated.
 */
@Module({
  imports: [
    WorkflowsModule,
    ApprovalsModule,
    TasksModule,
    AgentsModule,
    EmployeesModule,
    IntegrationsModule,
    MandateModule,
  ],
  controllers: [DepartmentsController, NotificationsController],
  providers: [
    { provide: DEPARTMENT_SEEN_FILE, useFactory: resolveDepartmentSeenFile },
    DepartmentSeenStore,
    { provide: RUN_READ_FILE, useFactory: resolveRunReadFile },
    RunReadStore,
    DepartmentsService,
    // NS2 F1b: one-shot startup backfill (`OnModuleInit`) — constructor-injects
    // the three owning stores, so Nest orders its init after each store's own
    // directory-ensure.
    OwnerBackfillService,
  ],
  // NS2 F3b — the briefing (and F3c chat) read department status through this.
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
