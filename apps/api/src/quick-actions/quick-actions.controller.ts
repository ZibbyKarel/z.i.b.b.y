import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { quickActionsContract } from "@zibby/contracts";
import { QuickActionsStore } from "./quick-actions.store";

@Controller()
export class QuickActionsController {
  constructor(private readonly quickActions: QuickActionsStore) {}

  @TsRestHandler(quickActionsContract)
  handler() {
    return tsRestHandler(quickActionsContract, {
      getQuickActions: async () => ({ status: 200, body: await this.quickActions.read() }),
      putQuickActions: async ({ body }) => ({
        status: 200,
        body: await this.quickActions.write(body),
      }),
    });
  }
}
