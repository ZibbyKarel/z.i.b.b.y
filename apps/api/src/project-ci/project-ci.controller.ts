import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { projectCiContract } from "@zibby/contracts";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { ProjectCiConflictError, ProjectCiService } from "./project-ci.service";

/** Implements `projectCiContract` (todo-10): base-branch CI read + the operator's "Fix CI" click. */
@Controller()
export class ProjectCiController {
  constructor(private readonly ci: ProjectCiService) {}

  @TsRestHandler(projectCiContract)
  handler() {
    return tsRestHandler(projectCiContract, {
      getProjectCi: async ({ params: { projectId } }) => {
        try {
          return { status: 200, body: await this.ci.get(projectId) };
        } catch (err) {
          if (err instanceof ProjectNotFoundError)
            return { status: 404, body: { message: err.message } };
          throw err;
        }
      },
      fixProjectCi: async ({ params: { projectId } }) => {
        try {
          return { status: 201, body: await this.ci.fix(projectId) };
        } catch (err) {
          if (err instanceof ProjectNotFoundError)
            return { status: 404, body: { message: err.message } };
          if (err instanceof ProjectCiConflictError)
            return { status: 409, body: { message: err.message } };
          if (err instanceof NoGithubLinkError)
            return { status: 422, body: { message: err.message } };
          throw err;
        }
      },
    });
  }
}
