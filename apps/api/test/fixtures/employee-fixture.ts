import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { DepartmentId, Employee } from "@zibby/contracts";

/**
 * D-015/D-017 test helper: writes an `Employee` record straight to disk, so an
 * e2e pipeline/task fixture that dispatches a bare placeholder agent id (one
 * never registered as a real `Agent`, e.g. `"writer"`) still has someone to
 * lease. Bypasses the hire HTTP flow on purpose — `POST /api/employees` (via
 * `EmployeesService.hire`) validates the position against a real, registered
 * `Agent` record, a constraint these placeholder ids fail by design.
 *
 * Writes into `dir` — pass the suite's own `EMPLOYEES_DIR` override when it has
 * one, or (when a describe block never overrides `EMPLOYEES_DIR`) the shared
 * per-file `${ZIBBY_DATA_DIR}/employees` root that `vitest.setup.ts` seeds.
 */
export async function seedEmployeeFixture(
  dir: string,
  opts: { id: string; agentId: string; department: DepartmentId; name?: string },
): Promise<Employee> {
  await fs.mkdir(dir, { recursive: true });
  const employee: Employee = {
    id: opts.id,
    name: opts.name ?? opts.id,
    agentId: opts.agentId,
    department: opts.department,
    status: "active",
    hiredAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(dir, `${opts.id}.json`), JSON.stringify(employee));
  return employee;
}

/** The employees dir a describe block resolves when it never overrides `EMPLOYEES_DIR` itself. */
export function defaultEmployeesDir(): string {
  const root = process.env.ZIBBY_DATA_DIR;
  if (!root)
    throw new Error(
      "defaultEmployeesDir: ZIBBY_DATA_DIR is not set (vitest.setup.ts should pin it)",
    );
  return path.join(root, "employees");
}
