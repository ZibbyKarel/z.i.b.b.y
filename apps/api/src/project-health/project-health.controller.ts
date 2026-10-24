import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { projectHealthContract } from "@zibby/contracts";
import {
  ProjectHealthConflictError,
  ProjectHealthDispatchError,
  ProjectHealthNotFoundError,
  ProjectHealthWatcherService,
} from "./project-health-watcher.service";

/**
 * Implements `projectHealthContract` (TODO 11). Statuses are listed through
 * the watcher (filtered against live projects); `check` runs one check now; `analyze` is the operator's explicit
 * request for an investigation task (a down result never dispatches one itself).
 */
@Controller()
export class ProjectHealthController {
  constructor(private readonly watcher: ProjectHealthWatcherService) {}

  @TsRestHandler(projectHealthContract)
  handler() {
    return tsRestHandler(projectHealthContract, {
      listProjectHealth: async ({ query }) => ({
        status: 200,
        // Filtered against live projects — a removed check never ghost-lists.
        body: await this.watcher.list(query),
      }),

      analyzeProjectHealth: async ({ params: { projectId } }) => {
        try {
          return { status: 200, body: await this.watcher.analyze(projectId) };
        } catch (err) {
          if (err instanceof ProjectHealthNotFoundError) {
            return { status: 404, body: { message: err.message } };
          }
          if (err instanceof ProjectHealthConflictError) {
            return { status: 409, body: { message: err.message } };
          }
          if (err instanceof ProjectHealthDispatchError) {
            return { status: 503, body: { message: err.message } };
          }
          throw err;
        }
      },

      checkProjectHealth: async ({ params: { projectId } }) => {
        try {
          return { status: 200, body: await this.watcher.checkNow(projectId) };
        } catch (err) {
          if (err instanceof ProjectHealthNotFoundError) {
            return { status: 404, body: { message: err.message } };
          }
          throw err;
        }
      },
    });
  }
}
