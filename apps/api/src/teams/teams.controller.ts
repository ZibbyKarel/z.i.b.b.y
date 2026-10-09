import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { teamsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { KbReaderService } from "../kb/kb-reader.service";
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
  constructor(
    private readonly storage: TeamsStorageService,
    private readonly kbReader: KbReaderService,
  ) {}

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

      getTeamKbGraph: async ({ params: { id } }) => {
        const team = await this.storage.get(id).catch((e: unknown) => {
          if (errors.isMissing(e)) return null;
          throw e;
        });
        if (!team?.knowledgeBase) {
          return { status: 404 as const, body: { message: `Team "${id}" has no knowledge base` } };
        }
        return { status: 200 as const, body: await this.kbReader.graph(team.knowledgeBase) };
      },

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
