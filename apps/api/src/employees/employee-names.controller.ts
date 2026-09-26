import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { employeeNamesContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  EmployeeNameConflictError,
  EmployeeNameInUseError,
  EmployeeNameNotFoundError,
} from "./employees.errors";
import { EmployeeNamesStore } from "./employee-names.store";

const errors = makeErrorMapper("Employee name", {
  missing: [EmployeeNameNotFoundError],
  conflict: [EmployeeNameConflictError],
});

/** Implements `employeeNamesContract` against `EmployeeNamesStore`. */
@Controller()
export class EmployeeNamesController {
  constructor(private readonly names: EmployeeNamesStore) {}

  @TsRestHandler(employeeNamesContract)
  handler() {
    return tsRestHandler(employeeNamesContract, {
      listEmployeeNames: async () => ({ status: 200, body: await this.names.list() }),

      createEmployeeName: ({ body }) => errors.created(() => this.names.create(body.name)),

      updateEmployeeName: ({ params: { id }, body }) =>
        errors.or404(
          id,
          async () => {
            if (body.name === undefined) return this.names.get(id);
            return this.names.rename(id, body.name);
          },
          (error) =>
            error instanceof EmployeeNameConflictError
              ? { status: 409, body: { message: error.message } }
              : undefined,
        ),

      deleteEmployeeName: ({ params: { id } }) =>
        errors.or404(
          id,
          async () => {
            await this.names.delete(id);
            return { id };
          },
          (error) =>
            error instanceof EmployeeNameInUseError
              ? { status: 409, body: { message: error.message } }
              : undefined,
        ),
    });
  }
}
