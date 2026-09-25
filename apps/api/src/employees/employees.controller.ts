import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { employeesContract } from "@zibby/contracts";
import { AgentNotFoundError } from "../agents/agents.errors";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  EmployeeDepartmentNotFoundError,
  EmployeeLeasedError,
  EmployeeNamePoolEmptyError,
  EmployeeNameUnavailableError,
  EmployeeNotFoundError,
  InvalidEmployeeIdError,
} from "./employees.errors";
import { EmployeesService } from "./employees.service";

const errors = makeErrorMapper("Employee", {
  missing: [
    EmployeeNotFoundError,
    InvalidEmployeeIdError,
    EmployeeDepartmentNotFoundError,
    AgentNotFoundError,
  ],
});

/** True for the "no name available" family — a 409 on hire/rename, per PART-E. */
function nameUnavailable(error: unknown): { status: 409; body: { message: string } } | undefined {
  if (
    error instanceof EmployeeNameUnavailableError ||
    error instanceof EmployeeNamePoolEmptyError
  ) {
    return { status: 409, body: { message: error.message } };
  }
  return undefined;
}

/**
 * Implements `employeesContract` against `EmployeesService`. `hireEmployee` hangs
 * off the department path (`POST /departments/:id/employees`) — an unknown
 * department OR an unknown agent (position) both map to 404 via the shared
 * `missing` list; a taken/unavailable name maps to 409 via `nameUnavailable`.
 */
@Controller()
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @TsRestHandler(employeesContract)
  handler() {
    return tsRestHandler(employeesContract, {
      listEmployees: async ({ query }) => ({
        status: 200,
        body: await this.employees.list(query),
      }),

      getEmployee: ({ params: { id } }) => errors.or404(id, () => this.employees.get(id)),

      // A 201-on-success route, so `created` (not `or404`) drives the success
      // status; its `extra` folds in the 404s `or404` would otherwise give (an
      // unknown department or position) alongside the 409 name cases.
      hireEmployee: ({ params: { id }, body }) =>
        errors.created(
          () => this.employees.hire(id, body),
          (error) =>
            error instanceof EmployeeDepartmentNotFoundError || error instanceof AgentNotFoundError
              ? errors.notFound(id)
              : nameUnavailable(error),
        ),

      updateEmployee: ({ params: { id }, body }) =>
        errors.or404(id, () => this.employees.update(id, body), nameUnavailable),

      fireEmployee: ({ params: { id } }) =>
        errors.or404(
          id,
          () => this.employees.fire(id),
          (error) =>
            error instanceof EmployeeLeasedError
              ? { status: 409, body: { message: error.message } }
              : undefined,
        ),
    });
  }
}
