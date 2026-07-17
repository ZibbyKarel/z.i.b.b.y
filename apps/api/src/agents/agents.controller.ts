import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { agentsContract } from "@zibby/contracts";
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
  constructor(private readonly storage: AgentsStorageService) {}

  @TsRestHandler(agentsContract)
  handler() {
    return tsRestHandler(agentsContract, {
      createAgent: ({ body }) => {
        // NS2 F1b: every new agent must be attributed to a subsystem — pre-F1
        // agents are exempt (tagged by the owner-backfill sweep instead), so
        // this is a create-only guard, not a schema-level requirement.
        if (!body.ownerSubsystem) {
          return Promise.resolve(unprocessable("ownerSubsystem is required"));
        }
        return errors.created(() => this.storage.create(body));
      },

      listAgents: async () => ({ status: 200, body: await this.storage.list() }),

      searchAgents: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getAgent: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateAgent: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteAgent: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
