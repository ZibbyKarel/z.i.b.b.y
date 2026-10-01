import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { departmentsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  DepartmentConflictError,
  DepartmentNotFoundError,
  InvalidDepartmentIdError,
  UnknownDivisionError,
} from "./departments.errors";
import { DepartmentsService } from "./departments.service";

const errors = makeErrorMapper("Department", {
  missing: [DepartmentNotFoundError, InvalidDepartmentIdError],
  conflict: [DepartmentConflictError],
});

const unprocessable = (error: unknown) =>
  error instanceof UnknownDivisionError
    ? ({ status: 422, body: { message: error.message } } as const)
    : undefined;

/**
 * Implements `departmentsContract` against the department file store (D-022). Not to
 * be confused with `HealthModule`'s `DepartmentHealthService` — unrelated concept
 * (liveness of backend/vault/integrations/scheduler), never touched here.
 */
@Controller()
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @TsRestHandler(departmentsContract)
  handler() {
    return tsRestHandler(departmentsContract, {
      getDepartments: async () => ({ status: 200, body: await this.departments.list() }),

      listUnownedEntities: async () => ({
        status: 200,
        body: await this.departments.listUnowned(),
      }),

      listDivisions: async () => ({ status: 200, body: await this.departments.listDivisions() }),

      createDepartment: async ({ body }) => {
        const result = await errors.created(
          async () => this.departments.create(body),
          unprocessable,
        );
        return result;
      },

      updateDepartment: ({ params: { id }, body }) =>
        errors.or404(id, async () => this.departments.update(id, body), unprocessable),

      getDepartment: ({ params: { id } }) => errors.or404(id, async () => this.departments.get(id)),

      markDepartmentSeen: ({ params: { id } }) =>
        errors.or404(id, async () => this.departments.markSeen(id)),

      getRoster: ({ params: { id } }) => errors.or404(id, async () => this.departments.roster(id)),

      getDepartmentSubtasks: ({ params: { id } }) =>
        errors.or404(id, async () => this.departments.subtasks(id)),
    });
  }
}
