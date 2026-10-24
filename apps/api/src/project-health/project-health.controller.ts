import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { projectHealthContract } from "@zibby/contracts";
import {
  ProjectHealthConflictError,
  ProjectHealthNotFoundError,
  ProjectHealthWatcherService,
} from "./project-health-watcher.service";
import { ProjectHealthStore } from "./project-health.store";

/**
 * Implements `projectHealthContract` (TODO 11). Statuses are read from the
 * store; `check` runs one check now; `analyze` is the operator's explicit
 * request for an investigation task (a down result never dispatches one itself).
 */
@Controller()
export class ProjectHealthController {
  constructor(
    private readonly store: ProjectHealthStore,
    private readonly watcher: ProjectHealthWatcherService,
  ) {}

  @TsRestHandler(projectHealthContract)
  handler() {
    return tsRestHandler(projectHealthContract, {
      listProjectHealth: async ({ query }) => ({
        status: 200,
        body: await this.store.list(query),
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
