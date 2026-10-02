import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { workflowsContract } from "@zibby/contracts";
import { unknownDepartment422 } from "../departments/departments.errors";
import { DepartmentsStorageService } from "../departments/departments.storage.service";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  InvalidWorkflowError,
  InvalidWorkflowIdError,
  WorkflowConflictError,
  WorkflowNotFoundError,
} from "./workflows.errors";
import { WorkflowsStorageService } from "./workflows.storage.service";

const errors = makeErrorMapper("Workflow", {
  missing: [WorkflowNotFoundError, InvalidWorkflowIdError],
  conflict: [WorkflowConflictError],
});

/** A dangling loop target (caught by the schema/storage) maps to a 422. */
const invalid = (error: unknown) =>
  error instanceof InvalidWorkflowError
    ? ({ status: 422, body: { message: error.message } } as const)
    : undefined;

const unprocessable = (message: string) => ({ status: 422 as const, body: { message } });

/**
 * Implements `workflowsContract` against the file-backed storage service. A
 * dangling loop target (caught by the schema/storage) maps to a 422; conflicts to
 * 409; missing/unsafe id to 404.
 */
@Controller()
export class WorkflowsController {
  constructor(
    private readonly storage: WorkflowsStorageService,
    private readonly departments: DepartmentsStorageService,
  ) {}

  @TsRestHandler(workflowsContract)
  handler() {
    return tsRestHandler(workflowsContract, {
      createWorkflow: async ({ body }) => {
        // NS2 F9: the mirror of `agents.controller.ts`' create guard. Since F9 the
        // switchboard routes only to departments, and a department offers only its
        // own owned units — so a workflow created without an owner would be
        // permanently unroutable. Create-only, like the agent guard: pre-F9
        // workflows are tagged by the owner-backfill sweep, not rejected on read.
        if (!body.department) return unprocessable("department is required");
        // D-022: departments are data — an owner that doesn't exist is a 422.
        const missing = await this.departments.firstMissing([body.department]);
        if (missing) return unknownDepartment422(missing);
        return errors.created(() => this.storage.create(body), invalid);
      },

      listWorkflows: async () => ({ status: 200, body: await this.storage.list() }),

      getWorkflow: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateWorkflow: async ({ params: { id }, body }) => {
        const missing = await this.departments.firstMissing([body.department]);
        if (missing) return unknownDepartment422(missing);
        return errors.or404(id, () => this.storage.update(id, body), invalid);
      },

      deleteWorkflow: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
