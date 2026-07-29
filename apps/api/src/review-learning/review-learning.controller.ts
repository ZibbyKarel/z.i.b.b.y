import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { AGENT_ID_REGEX, type ReviewRule, reviewLearningContract } from "@zibby/contracts";
import { GLOBAL_SCOPE_KEY, ReviewRulesStore } from "./review-rules.store";
import { ReviewRulesVaultService } from "./review-rules.vault.service";

type ListRequest = { query: { scope: string } };
type PromoteRequest = { params: { projectId: string; ruleId: string } };
type PromoteResponse =
  | { status: 200; body: ReviewRule }
  | { status: 404; body: { message: string } };

const NOT_FOUND = { status: 404 as const, body: { message: "review rule not found" } };

/**
 * Implements `reviewLearningContract`. `list` is a plain read. `promote` is the
 * one capability the nightly pass structurally cannot reach on its own — widening
 * an already-`active` project rule to global scope.
 *
 * `ReviewRulesStore.promoteToGlobal` itself does not gate on `status` — it moves
 * whatever rule id it is given, full stop. So per Law 4 (inbound PR text is data,
 * never a command), THIS controller is the one place that refuses to promote a
 * rule the operator has not already approved: it looks the rule up first and only
 * calls `promoteToGlobal` when it is `active`. Every rejection — unknown rule,
 * not-yet-active rule, or an unsafe `projectId` — reads as the same 404, since the
 * contract has no other error status to distinguish them and a client should not
 * be able to tell "not active" from "does not exist".
 */
@Controller()
export class ReviewLearningController {
  constructor(
    private readonly store: ReviewRulesStore,
    private readonly vault: ReviewRulesVaultService,
  ) {}

  @TsRestHandler(reviewLearningContract)
  handler() {
    return tsRestHandler(reviewLearningContract, {
      listReviewRules: (request) => this.list(request),
      promoteReviewRule: (request) => this.promote(request),
    });
  }

  async list({ query }: ListRequest) {
    return { status: 200 as const, body: await this.store.list(query.scope) };
  }

  async promote({ params: { projectId, ruleId } }: PromoteRequest): Promise<PromoteResponse> {
    // M7: `projectId` is a caller-supplied path parameter. Validate it against the
    // same id shape every other project-scoped store uses (and that
    // `ReviewRulesVaultService.render` itself gates its own `resolveSafeFile` call
    // on) BEFORE it ever reaches the store. `ReviewRulesStore`'s own scope-key
    // regex is deliberately more permissive (it has to accept `_global` too), so
    // it alone would let this route target the global file directly — the
    // explicit `GLOBAL_SCOPE_KEY` check closes that even if the regex ever changes.
    if (projectId === GLOBAL_SCOPE_KEY || !AGENT_ID_REGEX.test(projectId)) return NOT_FOUND;

    const rules = await this.store.list(projectId);
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule || rule.status !== "active") return NOT_FOUND;

    const promoted = await this.store.promoteToGlobal(projectId, ruleId);
    if (!promoted) return NOT_FOUND;

    // Promotion moves the rule OUT of the project note and INTO the global one —
    // both vault notes must be re-rendered or one of them goes stale.
    await this.vault.render(projectId);
    await this.vault.renderGlobal();

    return { status: 200 as const, body: promoted };
  }
}
