import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { externalSkillsContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { SkillConflictError, SkillNotFoundError } from "../skills/skills.errors";
import { NoSkillsFoundError, SkillRepoGitError } from "./external-skills.errors";
import { ExternalSkillsService } from "./external-skills.service";
import { InvalidSkillRepoUrlError } from "./skill-repo";

const errors = makeErrorMapper("Skill", {
  missing: [SkillNotFoundError],
  conflict: [SkillConflictError],
});

/** Bad URL → 400, nothing installable → 422, git failure → 502. */
const repoErrors = (error: unknown) => {
  if (!(error instanceof Error)) return undefined;
  const body = { message: error.message };
  if (error instanceof InvalidSkillRepoUrlError) return { status: 400 as const, body };
  if (error instanceof NoSkillsFoundError) return { status: 422 as const, body };
  if (error instanceof SkillRepoGitError) return { status: 502 as const, body };
  return undefined;
};

/** Implements `externalSkillsContract` over {@link ExternalSkillsService}. */
@Controller()
export class ExternalSkillsController {
  constructor(private readonly external: ExternalSkillsService) {}

  @TsRestHandler(externalSkillsContract)
  handler() {
    return tsRestHandler(externalSkillsContract, {
      scanExternalSkills: async ({ body: { url } }) => {
        try {
          return { status: 200 as const, body: await this.external.scan(url) };
        } catch (error) {
          const mapped = repoErrors(error);
          if (mapped) return mapped;
          throw error;
        }
      },
      installExternalSkills: ({ body: { url, paths } }) =>
        errors.created(() => this.external.install(url, paths), repoErrors),
      syncExternalSkill: ({ params: { id } }) =>
        errors.or404(
          id,
          () => this.external.sync(id),
          (error) =>
            error instanceof SkillRepoGitError
              ? { status: 502 as const, body: { message: error.message } }
              : undefined,
        ),
      syncAllExternalSkills: async () => ({
        status: 200 as const,
        body: await this.external.syncAll(),
      }),
    });
  }
}
