import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { type UpdateAgentInput, agentsContract } from "@zibby/contracts";
import { unknownDepartment422 } from "../departments/departments.errors";
import { DepartmentsStorageService } from "../departments/departments.storage.service";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { AgentConflictError, AgentNotFoundError, InvalidAgentIdError } from "./agents.errors";
import { AgentsStorageService } from "./agents.storage.service";

const errors = makeErrorMapper("Agent", {
  missing: [AgentNotFoundError, InvalidAgentIdError],
  conflict: [AgentConflictError],
});

const unprocessable = (message: string) => ({ status: 422 as const, body: { message } });

/**
 * Implements `agentsContract` against the file-backed storage service. Request
 * bodies, query and path params are validated against the contract's Zod schemas
 * by `@ts-rest/nest` before a handler runs (invalid input → 400).
 */
@Controller()
export class AgentsController {
  constructor(
    private readonly storage: AgentsStorageService,
    private readonly departments: DepartmentsStorageService,
  ) {}

  /**
   * Department guard for an update, mirroring create: an update that would leave an
   * agent that has a department with none → 422; an unknown department → 422. The patch
   * is a merge, so an update that does not mention `department` keeps the stored one;
   * only an explicit empty/undefined value would clear it. An agent that has no
   * department (pre-backfill) stays updatable. Returns the 422 response or null.
   * Throws the storage not-found error for an unknown id (read whenever the body names a
   * `department`). An empty `department` never reaches here over HTTP (schema 400); this
   * is defence-in-depth for in-process callers.
   */
  async departmentUpdateGuard(id: string, body: UpdateAgentInput) {
    if (!("department" in body)) return null;
    // Existence first, so a missing agent is a 404 whatever department the body names.
    const existing = await this.storage.get(id);
    if (body.department) {
      const missing = await this.departments.firstMissing([body.department]);
      return missing ? unknownDepartment422(missing) : null;
    }
    return existing.department ? unprocessable("department is required") : null;
  }

  @TsRestHandler(agentsContract)
  handler() {
    return tsRestHandler(agentsContract, {
      createAgent: async ({ body }) => {
        // NS2 F1b: every new agent must be attributed to a department — pre-F1
        // agents are exempt (tagged by the owner-backfill sweep instead), so
        // this is a create-only guard, not a schema-level requirement.
        if (!body.department) {
          return unprocessable("department is required");
        }
        const missing = await this.departments.firstMissing([body.department]);
        if (missing) return unknownDepartment422(missing);
        return errors.created(() => this.storage.create(body));
      },

      listAgents: async () => ({ status: 200, body: await this.storage.list() }),

      searchAgents: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getAgent: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateAgent: async ({ params: { id }, body }) => {
        try {
          const refused = await this.departmentUpdateGuard(id, body);
          if (refused) return refused;
        } catch (error) {
          if (errors.isMissing(error)) return errors.notFound(id);
          throw error;
        }
        return errors.or404(id, () => this.storage.update(id, body));
      },

      deleteAgent: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
