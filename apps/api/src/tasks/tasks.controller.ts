import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { tasksContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import {
  InvalidScheduledTaskIdError,
  ScheduledTaskNotFoundError,
  ScheduledTasksStorageService,
} from "./scheduled-tasks.storage.service"
import { TaskClassifierService } from "./task-classifier.service"
import { EmptyCatalogError, TaskSchedulerService } from "./task-scheduler.service"

const errors = makeErrorMapper("Scheduled task", {
  missing: [ScheduledTaskNotFoundError, InvalidScheduledTaskIdError],
})

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
        const routing = await this.classifier.classify(body)
        if (!routing) {
          return {
            status: 422,
            body: { message: "No agents or pipelines available to route to" },
          }
        }
        return { status: 200, body: routing }
      },

      createTask: async ({ body }) => {
        try {
          return { status: 201, body: await this.scheduler.createTask(body) }
        } catch (error) {
          if (error instanceof EmptyCatalogError) {
            return { status: 422, body: { message: error.message } }
          }
          throw error
        }
      },

      listScheduledTasks: async () => ({ status: 200, body: await this.storage.list() }),

      cancelScheduledTask: ({ params: { id } }) =>
        errors.or404(id, () => this.scheduler.cancel(id)),
    })
  }
}
