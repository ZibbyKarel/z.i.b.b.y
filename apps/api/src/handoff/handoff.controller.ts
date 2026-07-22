import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { handoffContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { SignalKindNotFoundError, SystemSignalKindError } from "./handoff-signal-kind.errors";
import { HandoffRuleNotFoundError, SystemHandoffRuleError } from "./handoff-rule.errors";
import { HandoffRuleStore } from "./handoff-rule.store";
import { SignalKindService } from "./signal-kind.service";

const errors = makeErrorMapper("Handoff rule", { missing: [HandoffRuleNotFoundError] });
const signalKindErrors = makeErrorMapper("Handoff signal kind", {
  missing: [SignalKindNotFoundError],
});

/**
 * Implements `handoffContract` against the seeded, file-backed rule set AND (B1)
 * the seeded, file-backed signal-kind registry. P1 — full rule CRUD: a missing id
 * is a 404 and a delete against a seeded system rule is a 403 (the store is the
 * single arbiter of both; see `HandoffRuleStore`). B1 — signal-kind CRUD mirrors
 * the exact same shape via `SignalKindService`: a missing id is a 404, an
 * update/delete against a built-in (`system: true`) kind is a 403.
 */
@Controller()
export class HandoffController {
  constructor(
    private readonly rules: HandoffRuleStore,
    private readonly signalKinds: SignalKindService,
  ) {}

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

      listSignalKinds: async () => ({ status: 200, body: await this.signalKinds.list() }),

      createSignalKind: async ({ body }) => ({
        status: 201,
        body: await this.signalKinds.create(body),
      }),

      updateSignalKind: ({ params: { id }, body }) =>
        signalKindErrors.or404(
          id,
          () => this.signalKinds.update(id, body),
          (err) =>
            err instanceof SystemSignalKindError
              ? ({ status: 403, body: { message: err.message } } as const)
              : undefined,
        ),

      deleteSignalKind: ({ params: { id } }) =>
        signalKindErrors.or404(
          id,
          async () => {
            await this.signalKinds.delete(id);
            return { id };
          },
          (err) =>
            err instanceof SystemSignalKindError
              ? ({ status: 403, body: { message: err.message } } as const)
              : undefined,
        ),
    });
  }
}
