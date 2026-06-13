import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { goalsContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import {
  GoalConflictError,
  GoalNotFoundError,
  InvalidGoalError,
  InvalidGoalIdError,
} from "./goals.errors"
import { GoalsStorageService } from "./goals.storage.service"

const errors = makeErrorMapper("Goal", {
  missing: [GoalNotFoundError, InvalidGoalIdError],
  conflict: [GoalConflictError],
})

/** A structurally-invalid goal definition (e.g. bad verifier spec) maps to a 422. */
const invalid = (error: unknown) =>
  error instanceof InvalidGoalError
    ? ({ status: 422, body: { message: error.message } } as const)
    : undefined

/** Implements `goalsContract` against the file-backed storage service. */
@Controller()
export class GoalsController {
  constructor(private readonly storage: GoalsStorageService) {}

  @TsRestHandler(goalsContract)
  handler() {
    return tsRestHandler(goalsContract, {
      createGoal: ({ body }) => errors.created(() => this.storage.create(body), invalid),

      listGoals: async () => ({ status: 200, body: await this.storage.list() }),

      getGoal: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),

      updateGoal: ({ params: { id }, body }) =>
        errors.or404(id, () => this.storage.update(id, body), invalid),

      deleteGoal: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.delete(id)
          return { id }
        }),
    })
  }
}
