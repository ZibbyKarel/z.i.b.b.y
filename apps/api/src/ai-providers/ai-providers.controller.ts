import { Controller, UseGuards } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { aiProvidersContract } from "@zibby/contracts";
import { OperatorTokenGuard } from "../approvals/operator-token.guard";
import { AiEnginesService } from "./ai-engines.service";
import { AiProvidersSpendService } from "./ai-providers-spend.service";
import { AiProvidersStore } from "./ai-providers.store";

/** Implements `aiProvidersContract`; mutating routes need the operator token. */
@Controller()
@UseGuards(OperatorTokenGuard)
export class AiProvidersController {
  constructor(
    private readonly store: AiProvidersStore,
    private readonly spend: AiProvidersSpendService,
    private readonly engines: AiEnginesService,
  ) {}

  @TsRestHandler(aiProvidersContract)
  handler() {
    return tsRestHandler(aiProvidersContract, {
      getAiProviders: async () => ({ status: 200, body: await this.store.status() }),
      getAiProvidersSpend: async () => ({ status: 200 as const, body: await this.spend.spend() }),
      getAiEngines: async () => ({ status: 200 as const, body: await this.engines.engines() }),
      getAiProvidersUsage: async ({ query }) => ({
        status: 200 as const,
        body: await this.engines.usage(query.days),
      }),
      setOpenAiKey: async ({ body }) => {
        await this.store.writeOpenAiKey(body.apiKey);
        return { status: 200 as const, body: await this.store.status() };
      },
      clearOpenAiKey: async () => {
        await this.store.clearOpenAiKey();
        return { status: 200 as const, body: await this.store.status() };
      },
    });
  }
}
