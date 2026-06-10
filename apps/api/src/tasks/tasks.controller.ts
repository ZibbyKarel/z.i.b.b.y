import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { tasksContract } from "@zibby/contracts"
import { TaskClassifierService } from "./task-classifier.service"

/**
 * Implements `tasksContract`. The single endpoint classifies a task and returns
 * the routing verdict — it never starts a run (approval-first; dispatch is a
 * separate explicit call to the agent/pipeline run endpoints). A `null` verdict
 * means the catalog is empty, which surfaces as a 422.
 */
@Controller()
export class TasksController {
  constructor(private readonly classifier: TaskClassifierService) {}

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
    })
  }
}
