import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  type CreateEmployeeInput,
  type Employee,
  type EmployeeQuery,
  type EmployeeWithState,
  type MinionAppearance,
  type UpdateEmployeeInput,
} from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { DepartmentsStorageService } from "../departments/departments.storage.service";
import { WorkflowRunnerService } from "../workflows/workflow-runner.service";
import { allocateAppearance } from "./employee-appearance";
import { EmployeeAllocator } from "./employee-allocator";
import { EmployeeNamesStore } from "./employee-names.store";
import { EmployeeDepartmentNotFoundError, EmployeeLeasedError } from "./employees.errors";
import { EmployeesStorageService } from "./employees.storage.service";

/**
 * Hire/fire/roster orchestration over `EmployeesStorageService` (the employee
 * records) and `EmployeeNamesStore` (the name pool) — the two-store transaction
 * every write here has to keep in sync (a name is claimed exactly when an
 * employee holds it, released exactly when it doesn't).
 */
@Injectable()
export class EmployeesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly employees: EmployeesStorageService,
    private readonly names: EmployeeNamesStore,
    private readonly agents: AgentsStorageService,
    private readonly allocator: EmployeeAllocator,
    /** D-022: the department a hire/transfer targets must exist in the store. */
    private readonly departments: DepartmentsStorageService,
    /**
     * Resolves `WorkflowRunnerService` lazily (`strict: false`): `WorkflowsModule`
     * imports `EmployeesModule`, so injecting it directly would close a module cycle.
     */
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Fail-open boot backfill of Minion appearances for records that predate them. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.backfillAppearances();
    } catch (error) {
      this.logger.error(`appearance backfill failed: ${String(error)}`);
    }
  }

  /**
   * Allocate + persist an `appearance` for every employee lacking one (stable
   * order: hiredAt, then id), unique against the active employees' looks.
   * Idempotent. Returns how many records were written.
   */
  async backfillAppearances(): Promise<number> {
    const all = await this.employees.list();
    const missing = all
      .filter((e) => !e.appearance)
      .sort((a, b) => a.hiredAt.localeCompare(b.hiredAt) || a.id.localeCompare(b.id));
    if (missing.length === 0) return 0;
    const taken: MinionAppearance[] = all
      .filter((e) => e.status === "active" && e.appearance)
      .map((e) => e.appearance as MinionAppearance);
    let written = 0;
    for (const employee of missing) {
      try {
        const appearance = await this.allocateFor(employee.name, employee.agentId, taken);
        await this.employees.update({ ...employee, appearance });
        if (employee.status === "active") taken.push(appearance);
        written++;
      } catch (error) {
        this.logger.error(`appearance backfill failed for ${employee.id}: ${String(error)}`);
      }
    }
    return written;
  }

  private async allocateFor(
    seed: string,
    agentId: string,
    taken: readonly MinionAppearance[],
  ): Promise<MinionAppearance> {
    const agent = await this.agents.get(agentId).catch(() => null);
    return allocateAppearance(
      { seed, agentId, ...(agent?.category ? { category: agent.category } : {}) },
      taken,
    );
  }

  async list(query: EmployeeQuery): Promise<EmployeeWithState[]> {
    const all = await this.employees.list();
    const filtered = all.filter(
      (e) =>
        (!query.department || e.department === query.department) &&
        (!query.agentId || e.agentId === query.agentId) &&
        (!query.status || e.status === query.status),
    );
    return Promise.all(filtered.map((e) => this.withState(e)));
  }

  async get(id: string): Promise<EmployeeWithState> {
    return this.withState(await this.employees.get(id));
  }

  private async findDepartment(id: string): Promise<{ id: string }> {
    if (!(await this.departments.exists(id))) throw new EmployeeDepartmentNotFoundError(id);
    return { id };
  }

  /** Hire one employee of `input.agentId` into `departmentId` (D-015 hire flow). */
  async hire(departmentId: string, input: CreateEmployeeInput): Promise<Employee> {
    const department = await this.findDepartment(departmentId);
    // Surfaces AgentNotFoundError (mapped to 404 by the controller) for an unknown position.
    await this.agents.get(input.agentId);
    const takenLooks = (await this.employees.list())
      .filter((e) => e.status === "active" && e.appearance)
      .map((e) => e.appearance as MinionAppearance);

    const id = this.employees.newId();
    const claimed = await this.names.claimAndAssign(input.name, id);
    const employee: Employee = {
      id,
      name: claimed.name,
      agentId: input.agentId,
      department: department.id,
      status: "active",
      hiredAt: new Date().toISOString(),
      appearance: await this.allocateFor(claimed.name, input.agentId, takenLooks),
    };
    try {
      await this.employees.create(employee);
    } catch (error) {
      await this.names.releaseByEmployeeId(id).catch(() => {});
      throw error;
    }
    void this.allocator.rosterChanged(employee.department, employee.agentId).catch(() => {});
    return employee;
  }

  /** Rename (must pick a free pool name) and/or move `id` to another department. */
  async update(id: string, patch: UpdateEmployeeInput): Promise<Employee> {
    const employee = await this.employees.get(id);
    let next = employee;

    if (patch.name && patch.name !== employee.name) {
      await this.names.releaseByEmployeeId(id);
      try {
        const claimed = await this.names.claimAndAssign(patch.name, id);
        next = { ...next, name: claimed.name };
      } catch (error) {
        // Roll back: the old name is still free at this point — reclaim it so a
        // failed rename never leaves the employee unnamed.
        await this.names.claimAndAssign(employee.name, id).catch(() => {});
        throw error;
      }
    }

    if (patch.department && patch.department !== next.department) {
      await this.findDepartment(patch.department); // throws EmployeeDepartmentNotFoundError
      next = { ...next, department: patch.department };
    }

    if (next !== employee) await this.employees.update(next);
    return next;
  }

  /** Fire `id` — soft delete: status flips to fired and its name returns to the pool. */
  async fire(id: string): Promise<Employee> {
    const employee = await this.employees.get(id);
    if (employee.status === "fired") return employee; // idempotent
    if (this.allocator.isBusy(id)) throw new EmployeeLeasedError(id);
    const fired: Employee = { ...employee, status: "fired", firedAt: new Date().toISOString() };
    await this.employees.update(fired);
    await this.names.releaseByEmployeeId(id).catch(() => {});
    return fired;
  }

  /**
   * Project an employee to its `EmployeeWithState` shape: the position's display
   * name/title (the job title is the humanized agent id, e.g. `backend-developer`
   * → "Backend Developer" — see `EmployeePositionSchema`'s docblock) and a derived
   * state: `idle` without a lease, `working` while leased, and `blocked` while
   * leased to a workflow run that is `parked` (waiting on the operator/approval)
   * or `paused-limit` — the lease stays held across those. `thinking`/`error`/`done`
   * remain unused. `currentStage` is the leased run's current phase id (the
   * stage-log key).
   */
  private workflowRuns(): WorkflowRunnerService | null {
    try {
      return this.moduleRef.get(WorkflowRunnerService, { strict: false });
    } catch {
      return null; // not wired (e.g. a slim test module) — fall back to lease-only state
    }
  }

  private async withState(employee: Employee): Promise<EmployeeWithState> {
    const agent = await this.agents.get(employee.agentId).catch(() => null);
    const busy = this.allocator.busy();
    const runId = busy.get(employee.id);
    const leased = busy.has(employee.id);
    const run = leased && runId ? this.workflowRuns()?.peekRun(runId) : undefined;
    const waiting = run?.status === "parked" || run?.status === "paused-limit";
    return {
      ...employee,
      state: !leased ? "idle" : waiting ? "blocked" : "working",
      ...(leased && runId ? { currentRunId: runId } : {}),
      ...(run?.currentStage ? { currentStage: run.currentStage } : {}),
      position: {
        id: employee.agentId,
        name: agent?.name ?? employee.agentId,
        title: positionTitle(employee.agentId),
      },
    };
  }
}

/** `backend-developer` → "Backend Developer" — the position's job title. */
function positionTitle(agentId: string): string {
  return agentId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
