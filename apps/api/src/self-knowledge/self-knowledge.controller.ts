import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { selfKnowledgeContract } from "@zibby/contracts";
import { SelfKnowledgeService } from "./self-knowledge.service";

/** Implements `selfKnowledgeContract` against the {@link SelfKnowledgeService}. */
@Controller()
export class SelfKnowledgeController {
  constructor(private readonly selfKnowledge: SelfKnowledgeService) {}

  @TsRestHandler(selfKnowledgeContract)
  handler() {
    return tsRestHandler(selfKnowledgeContract, {
      getSelfKnowledge: async () => ({ status: 200, body: await this.selfKnowledge.compose() }),
    });
  }
}
