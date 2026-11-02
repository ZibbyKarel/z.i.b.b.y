import { Controller, UseGuards } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { aiProvidersContract } from "@zibby/contracts";
import { OperatorTokenGuard } from "../approvals/operator-token.guard";
import { AiProvidersStore } from "./ai-providers.store";

/** Implements `aiProvidersContract`; mutating routes need the operator token. */
@Controller()
@UseGuards(OperatorTokenGuard)
export class AiProvidersController {
  constructor(private readonly store: AiProvidersStore) {}

  @TsRestHandler(aiProvidersContract)
  handler() {
    return tsRestHandler(aiProvidersContract, {
      getAiProviders: async () => ({ status: 200, body: await this.store.status() }),
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
