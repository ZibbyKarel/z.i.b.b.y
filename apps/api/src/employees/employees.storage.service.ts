import { Inject, Injectable } from "@nestjs/common";
import { type DepartmentId, type Employee, EmployeeSchema } from "@zibby/contracts";
import { EntityFileStore, collisionResistantId } from "../shared/file-storage";
import { EmployeeNotFoundError, InvalidEmployeeIdError } from "./employees.errors";

/** DI token carrying the absolute path of the directory that holds employee files. */
export const EMPLOYEES_DIR = "EMPLOYEES_DIR";

const ID_REGEX = /^[a-zA-Z0-9._-]+$/;

/**
 * Durable, file-backed persistence for employees: one `<id>.json` per employee in
 * a configurable directory (D-015) — same atomic-write / tolerant-parse shape as
 * `ApprovalsStorageService`. Firing is soft (handled by `EmployeesService`, which
 * writes the record back with `status: "fired"`) — there is no delete path here,
 * so a fired employee's run history stays a readable archive.
 */
@Injectable()
export class EmployeesStorageService extends EntityFileStore<Employee> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = ID_REGEX;

  constructor(@Inject(EMPLOYEES_DIR) dir: string) {
    super(dir);
  }

  /** A fresh, filename-safe, collision-resistant employee id. */
  newId(): string {
    return collisionResistantId("employee");
  }

  async create(employee: Employee): Promise<Employee> {
    await this.writeEntity(employee);
    return employee;
  }

  async update(employee: Employee): Promise<Employee> {
    await this.writeEntity(employee);
    return employee;
  }

  /** Active employees holding `agentId` (the position) inside `department` — the allocator's roster read. */
  async listActiveByPosition(department: DepartmentId, agentId: string): Promise<Employee[]> {
    const all = await this.list();
    return all.filter(
      (e) => e.status === "active" && e.department === department && e.agentId === agentId,
    );
  }

  /**
   * D-017: every active employee holding `agentId`, across ALL departments — used
   * by the single-agent dispatch path when the task carries no department context,
   * to find any department that can lease the position (first by `department` id,
   * for determinism). Empty when the position has no employee anywhere.
   */
  async listActiveByPositionAnyDepartment(agentId: string): Promise<Employee[]> {
    const all = await this.list();
    return all
      .filter((e) => e.status === "active" && e.agentId === agentId)
      .sort((a, b) => a.department.localeCompare(b.department));
  }

  protected idOf(employee: Employee): string {
    return employee.id;
  }

  protected serialize(employee: Employee): string {
    return JSON.stringify(employee);
  }

  protected tryParse(raw: string): Employee | null {
    return this.parseJson(EmployeeSchema, raw);
  }

  protected compare(a: Employee, b: Employee): number {
    return a.id.localeCompare(b.id);
  }

  protected notFound(id: string): Error {
    return new EmployeeNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidEmployeeIdError(id);
  }
}
