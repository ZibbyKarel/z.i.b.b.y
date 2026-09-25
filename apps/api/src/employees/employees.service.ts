import { Injectable } from "@nestjs/common";
import {
  type CreateEmployeeInput,
  DEPARTMENTS,
  type DepartmentId,
  type Employee,
  type EmployeeQuery,
  type EmployeeWithState,
  type UpdateEmployeeInput,
} from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
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
export class EmployeesService {
  constructor(
    private readonly employees: EmployeesStorageService,
    private readonly names: EmployeeNamesStore,
    private readonly agents: AgentsStorageService,
    private readonly allocator: EmployeeAllocator,
  ) {}

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

  /** Hire one employee of `input.agentId` into `departmentId` (D-015 hire flow). */
  async hire(departmentId: string, input: CreateEmployeeInput): Promise<Employee> {
    const department = findDepartment(departmentId);
    // Surfaces AgentNotFoundError (mapped to 404 by the controller) for an unknown position.
    await this.agents.get(input.agentId);

    const id = this.employees.newId();
    const claimed = await this.names.claimAndAssign(input.name, id);
    const employee: Employee = {
      id,
      name: claimed.name,
      agentId: input.agentId,
      department: department.id,
      status: "active",
      hiredAt: new Date().toISOString(),
    };
    try {
      await this.employees.create(employee);
    } catch (error) {
      await this.names.releaseByEmployeeId(id).catch(() => {});
      throw error;
    }
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
      findDepartment(patch.department); // throws EmployeeDepartmentNotFoundError
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
   * name/title (best-effort — `title` reads `Agent.category`, see
   * `EmployeePositionSchema`'s docblock) and a derived state. `state` is scoped to
   * what the allocator's in-memory lease table alone can tell (`working` while
   * leased, `idle` otherwise) — the full O-04 six-state vocabulary (thinking /
   * blocked / error / done) needs the underlying run's own status, which would
   * pull AgentRunnerService/PipelineRunnerService into this module; left for a
   * follow-up (documented in the ZE-01 report) rather than widening this phase's
   * dependency graph.
   */
  private async withState(employee: Employee): Promise<EmployeeWithState> {
    const agent = await this.agents.get(employee.agentId).catch(() => null);
    const busy = this.allocator.busy();
    const runId = busy.get(employee.id);
    const leased = busy.has(employee.id);
    return {
      ...employee,
      state: leased ? "working" : "idle",
      ...(leased && runId ? { currentRunId: runId } : {}),
      position: {
        id: employee.agentId,
        name: agent?.name ?? employee.agentId,
        ...(agent?.category ? { title: agent.category } : {}),
      },
    };
  }
}

function findDepartment(id: string): { id: DepartmentId } {
  const department = DEPARTMENTS.find((d) => d.id === id);
  if (!department) throw new EmployeeDepartmentNotFoundError(id);
  return department;
}
