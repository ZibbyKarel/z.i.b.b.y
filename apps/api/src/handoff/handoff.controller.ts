import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { handoffContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { HandoffRuleNotFoundError, SystemHandoffRuleError } from "./handoff-rule.errors";
import { HandoffRuleStore } from "./handoff-rule.store";

const errors = makeErrorMapper("Handoff rule", { missing: [HandoffRuleNotFoundError] });

/**
 * Implements `handoffContract` against the seeded, file-backed rule set. P1 — full
 * CRUD: a missing id is a 404 and a delete against a seeded system rule is a 403
 * (the store is the single arbiter of both; see `HandoffRuleStore`).
 */
@Controller()
export class HandoffController {
  constructor(private readonly rules: HandoffRuleStore) {}

  @TsRestHandler(handoffContract)
  handler() {
    return tsRestHandler(handoffContract, {
      getHandoffRules: async () => ({ status: 200, body: await this.rules.list() }),

      createHandoffRule: async ({ body }) => ({ status: 201, body: await this.rules.create(body) }),

      updateHandoffRule: ({ params: { id }, body }) =>
        errors.or404(id, () => this.rules.update(id, body)),

      deleteHandoffRule: ({ params: { id } }) =>
        errors.or404(
          id,
          async () => {
            await this.rules.delete(id);
            return { id };
          },
          (err) =>
            err instanceof SystemHandoffRuleError
              ? ({ status: 403, body: { message: err.message } } as const)
              : undefined,
        ),
    });
  }
}
