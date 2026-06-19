import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { skillsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { InvalidSkillIdError, SkillConflictError, SkillNotFoundError } from "./skills.errors";
import { SkillsStorageService } from "./skills.storage.service";

const errors = makeErrorMapper("Skill", {
  missing: [SkillNotFoundError, InvalidSkillIdError],
  conflict: [SkillConflictError],
});

/**
 * Implements `skillsContract` against the file-backed storage service. Mirrors
 * `AgentsController`: bodies/params validated against the contract Zod schemas by
 * `@ts-rest/nest`; conflicts → 409, missing/unsafe id → 404.
 */
@Controller()
export class SkillsController {
  constructor(private readonly storage: SkillsStorageService) {}

  @TsRestHandler(skillsContract)
  handler() {
    return tsRestHandler(skillsContract, {
      createSkill: ({ body }) => errors.created(() => this.storage.create(body)),

      listSkills: async () => ({ status: 200, body: await this.storage.list() }),

      searchSkills: async ({ query: { q } }) => ({
        status: 200,
        body: await this.storage.search(q),
      }),

      getSkill: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateSkill: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body)),

      deleteSkill: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id);
          return { id };
        }),
    });
  }
}
