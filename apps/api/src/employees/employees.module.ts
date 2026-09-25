import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { dataDir } from "../shared/data-dir";
import { EmployeeAllocator } from "./employee-allocator";
import { EMPLOYEE_NAMES_DIR, EmployeeNamesStore } from "./employee-names.store";
import { EmployeeNamesController } from "./employee-names.controller";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { EMPLOYEES_DIR, EmployeesStorageService } from "./employees.storage.service";

/** Default employees dir, anchored to `apps/api/data/employees` like agents/skills. */
export function resolveEmployeesDir(): string {
  return process.env.EMPLOYEES_DIR ?? dataDir("employees");
}

/**
 * Default dir for the name-pool manifest. Deliberately its OWN dir (not nested
 * under `resolveEmployeesDir()`) — mirrors `data/teams/_teams.json` living beside,
 * not inside, any per-team file — so `employees/*.json` stays a pure one-file-
 * per-employee listing directory.
 */
export function resolveEmployeeNamesDir(): string {
  return process.env.EMPLOYEE_NAMES_DIR ?? dataDir("employee-names");
}

/**
 * D-015 — employees, the name pool, and the `EmployeeAllocator` broker.
 * `AgentsModule` is imported so hire/roster reads can resolve a position's
 * display name/category (and validate `agentId` exists on hire). Deliberately a
 * leaf module otherwise: nothing here imports `PipelinesModule`/`TasksModule`/
 * `DepartmentsModule`, so any of THEM can import `EmployeesModule` (as
 * `PipelinesModule`, `TasksModule` and `DepartmentsModule` all do) without
 * closing a cycle.
 */
@Module({
  imports: [AgentsModule],
  controllers: [EmployeesController, EmployeeNamesController],
  providers: [
    { provide: EMPLOYEES_DIR, useFactory: resolveEmployeesDir },
    { provide: EMPLOYEE_NAMES_DIR, useFactory: resolveEmployeeNamesDir },
    EmployeesStorageService,
    EmployeeNamesStore,
    EmployeeAllocator,
    EmployeesService,
  ],
  exports: [EmployeesStorageService, EmployeeNamesStore, EmployeeAllocator, EmployeesService],
})
export class EmployeesModule {}
