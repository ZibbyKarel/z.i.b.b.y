import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { departmentsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { DepartmentNotFoundError } from "./departments.errors";
import { DepartmentsService } from "./departments.service";

const errors = makeErrorMapper("Department", {
  missing: [DepartmentNotFoundError],
});

/**
 * Implements `departmentsContract` against the fixed `DEPARTMENTS` registry. Not to
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

      getDepartment: ({ params: { id } }) => errors.or404(id, async () => this.departments.get(id)),

      markDepartmentSeen: ({ params: { id } }) =>
        errors.or404(id, async () => this.departments.markSeen(id)),

      getRoster: ({ params: { id } }) => errors.or404(id, async () => this.departments.roster(id)),

      getDepartmentSubtasks: ({ params: { id } }) =>
        errors.or404(id, async () => this.departments.subtasks(id)),
    });
  }
}
