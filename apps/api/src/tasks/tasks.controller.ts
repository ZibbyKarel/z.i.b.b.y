import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { tasksContract } from "@zibby/contracts";
import { ClaudeUnavailableError } from "../runner/claude-preflight.service";
import { makeErrorMapper } from "../shared/http/error-mapping";
import {
  InvalidScheduledTaskIdError,
  ScheduledTaskNotFoundError,
  ScheduledTasksStorageService,
} from "./scheduled-tasks.storage.service";
import { TaskClassifierService } from "./task-classifier.service";
import { EmptyCatalogError, TaskSchedulerService } from "./task-scheduler.service";

const errors = makeErrorMapper("Scheduled task", {
  missing: [ScheduledTaskNotFoundError, InvalidScheduledTaskIdError],
});

/**
 * Implements `tasksContract`. `classifyTask` is the side-effect-free verdict;
 * `createTask` is the action behind the New Task dialog — it classifies and
 * dispatches immediately, or (for a future `scheduledAt`) parks the task for the
 * {@link TaskSchedulerService} to fire later. An empty catalog surfaces as a 422.
 */
@Controller()
export class TasksController {
  constructor(
    private readonly classifier: TaskClassifierService,
    private readonly scheduler: TaskSchedulerService,
    private readonly storage: ScheduledTasksStorageService,
  ) {}

  @TsRestHandler(tasksContract)
  handler() {
    return tsRestHandler(tasksContract, {
      classifyTask: async ({ body }) => {
        const routing = await this.classifier.classify(body);
        if (!routing) {
          return {
            status: 422,
            body: { message: "No agents or pipelines available to route to" },
          };
        }
        return { status: 200, body: routing };
      },

      createTask: async ({ body }) => {
        try {
          // The interactive path: classify + spawn run in the BACKGROUND so the dialog
          // gets an immediate `pending` task to redirect to (the run starts off the
          // response path). A dispatch failure there — empty catalog, claude
          // unavailable, anything thrown — flips the pending task to `failed` with the
          // reason (visible in the feed), so it never silently no-ops. The sync 422/503
          // mapping is kept for the non-background server callers that still throw.
          return {
            status: 201,
            body: await this.scheduler.createTask(body, undefined, undefined, undefined, true),
          };
        } catch (error) {
          if (error instanceof EmptyCatalogError) {
            return { status: 422, body: { message: error.message } };
          }
          if (error instanceof ClaudeUnavailableError) {
            return { status: 503, body: { message: error.message } };
          }
          throw error;
        }
      },

      listScheduledTasks: async () => ({ status: 200, body: await this.storage.list() }),

      cancelScheduledTask: ({ params: { id } }) =>
        errors.or404(id, () => this.scheduler.cancel(id)),
    });
  }
}
