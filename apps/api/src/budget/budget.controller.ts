import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { budgetContract } from "@zibby/contracts";
import { BudgetConfigStore } from "./budget-config.store";
import { BudgetService } from "./budget.service";

/**
 * Implements `budgetContract`: the per-engagement budget readout plus the
 * operator-owned global pause thresholds. All three routes are thin adapters —
 * `getBudget` assembles a pure read, the config routes own `data/budget.json`.
 */
@Controller()
export class BudgetController {
  constructor(
    private readonly budget: BudgetService,
    private readonly config: BudgetConfigStore,
  ) {}

  @TsRestHandler(budgetContract)
  handler() {
    return tsRestHandler(budgetContract, {
      getBudget: async () => ({ status: 200, body: await this.budget.status() }),
      getBudgetConfig: async () => ({ status: 200, body: await this.config.read() }),
      updateBudgetConfig: async ({ body }) => ({
        status: 200,
        body: await this.config.write(body),
      }),
    });
  }
}
