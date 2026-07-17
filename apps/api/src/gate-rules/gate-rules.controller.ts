import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { gateRulesContract } from "@zibby/contracts";
import { makeErrorMapper } from "../shared/http/error-mapping";
import { GateRuleNotFoundError, InvalidGateRuleIdError } from "./gate-rules.errors";
import { GateRulesStorageService } from "./gate-rules.storage.service";

const errors = makeErrorMapper("Gate rule", {
  missing: [GateRuleNotFoundError, InvalidGateRuleIdError],
});

/**
 * Implements `gateRulesContract` — CRUD + reorder over the global gate-rule catalog
 * (the "Pravidla schvalování" page). A thin HTTP wrapper over the storage service;
 * a missing id is a 404 and a reorder that is not a permutation of the catalog is a
 * 422 (the storage layer is the single arbiter of both).
 *
 * NS2 F3a — no write-time harden-only 422 for subsystem-tagged rules HERE, by
 * decision: the evaluator now lives downstream of this module (`GatesModule`
 * imports `GateRulesModule` to feed the per-subsystem bucket), so injecting
 * `GateEvaluatorService` into this controller would close a module/import cycle
 * (gates ⇄ gate-rules — the madge guard rejects it). The guarantee is untouched:
 * `matchOnce`'s strictest-of-buckets makes a weakening catalog rule inert at eval
 * time (the floor still wins), which is the actual security boundary — the 422
 * would only have been a write-time UX nicety (`validateSubsystemRuleHardenOnly`
 * exists on the evaluator for any future caller that sits above both modules).
 */
@Controller()
export class GateRulesController {
  constructor(private readonly store: GateRulesStorageService) {}

  @TsRestHandler(gateRulesContract)
  handler() {
    return tsRestHandler(gateRulesContract, {
      listGateRules: async () => ({ status: 200, body: { rules: await this.store.list() } }),

      createGateRule: async ({ body }) => ({ status: 201, body: await this.store.create(body) }),

      reorderGateRules: async ({ body: { ids } }) => {
        const rules = await this.store.reorder(ids);
        if (!rules)
          return { status: 422, body: { message: "ids must be a permutation of the catalog" } };
        return { status: 200, body: { rules } };
      },

      updateGateRule: ({ params: { id }, body }) =>
        errors.or404(id, () => this.store.update(id, body)),

      deleteGateRule: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.store.remove(id);
          return { id };
        }),
    });
  }
}
