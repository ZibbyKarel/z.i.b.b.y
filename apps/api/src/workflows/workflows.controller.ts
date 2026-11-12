import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { type WorkflowPhase, workflowsContract } from "@zibby/contracts";
import { requireOperatorTokenIf } from "../approvals/operator-token.guard";
import { OperatorTokenService } from "../approvals/operator-token.service";
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
    private readonly tokens: OperatorTokenService,
  ) {}

  /**
   * A21 — pinning a step to an engine / exact model (or changing / dropping a pin) is
   * operator-only (401), like an agent's engine (A15): an agent must not move a step
   * to another engine or a paid model (Law 4). Compared per phase id against the
   * stored workflow; a phase without a stored twin counts as unpinned.
   */
  async engineGuard(
    id: string | null,
    phases: readonly WorkflowPhase[] | undefined,
    headers: Record<string, unknown>,
  ): Promise<void> {
    if (!phases) return;
    const stored = id ? ((await this.storage.get(id).catch(() => null))?.phases ?? []) : [];
    const changed = phases.some((p) => {
      const cur = stored.find((s) => s.id === p.id);
      return p.engine !== cur?.engine || p.engineModel !== cur?.engineModel;
    });
    requireOperatorTokenIf(
      changed,
      this.tokens,
      headers,
      "Changing a workflow step's AI engine or model",
    );
  }

  @TsRestHandler(workflowsContract)
  handler() {
    return tsRestHandler(workflowsContract, {
      createWorkflow: async ({ body, headers }) => {
        await this.engineGuard(null, body.phases, headers);
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

      updateWorkflow: async ({ params: { id }, body, headers }) => {
        await this.engineGuard(id, body.phases, headers);
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
