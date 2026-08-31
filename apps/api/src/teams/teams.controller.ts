import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { teamsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { TeamConflictError, TeamNotFoundError } from "./teams.errors";
import { TeamsStorageService } from "./teams.storage.service";

const errors = makeErrorMapper("Team", {
  missing: [TeamNotFoundError],
  conflict: [TeamConflictError],
});

/**
 * Implements `teamsContract` against the JSON-manifest-backed storage
 * service. Mirrors `CompaniesController` in shape; `searchTeams`
 * (`GET /teams/search`) is declared before `getTeam` in the contract so it is
 * matched as its own route rather than captured by `GET /teams/:id`.
 */
@Controller()
export class TeamsController {
  constructor(private readonly storage: TeamsStorageService) {}

  @TsRestHandler(teamsContract)
  handler() {
    return tsRestHandler(teamsContract, {
      createTeam: ({ body }) => errors.created(() => this.storage.create(body)),

      listTeams: async () => ({ status: 200, body: await this.storage.list() }),

      searchTeams: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getTeam: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateTeam: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteTeam: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.get(id); // 404 before any side effect
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
