import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { handoffContract } from "@zibby/contracts";
import { HandoffRuleStore } from "./handoff-rule.store";

/**
 * Implements `handoffContract` against the seeded, file-backed rule set. v1 is
 * read-only (list only) — CRUD is deferred to the Part-2 rule-editor UI spec.
 */
@Controller()
export class HandoffController {
  constructor(private readonly rules: HandoffRuleStore) {}

  @TsRestHandler(handoffContract)
  handler() {
    return tsRestHandler(handoffContract, {
      getHandoffRules: async () => ({ status: 200, body: await this.rules.list() }),
    });
  }
}
