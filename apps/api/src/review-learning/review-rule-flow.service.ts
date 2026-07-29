import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { ReviewRule } from "@zibby/contracts";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ReviewRulesStore } from "./review-rules.store";
import { ReviewRulesVaultService } from "./review-rules.vault.service";

/** The action name shown on the approval card. */
const ADOPT_ACTION = "review.rule_adopt";

/** The approval's runId is the (project, rule) pair — the rule's durable address. */
export function reviewRuleRunId(projectId: string, ruleId: string): string {
  return `${projectId}/${ruleId}`;
}

export function parseReviewRuleRunId(runId: string): { projectId: string; ruleId: string } | null {
  const slash = runId.indexOf("/");
  if (slash <= 0 || slash === runId.length - 1) return null;
  return { projectId: runId.slice(0, slash), ruleId: runId.slice(slash + 1) };
}

/** The enrichment JSON packed into `Approval.detail`, read back by the web feed. */
function buildEnrichment(projectId: string, rule: ReviewRule) {
  return {
    summary: `Naučené review pravidlo: „${rule.rule}"`,
    actorKind: "skill",
    glyph: "bot",
    preview: {
      kind: "diff",
      file: `${projectId}-review-rules.md`,
      meta: `${rule.occurrences.length}× v review${rule.rationale ? ` — ${rule.rationale}` : ""}`,
      hunks: [
        {
          h: "pravidlo",
          lines: [["add", rule.rule] as ["add", string]],
        },
        {
          h: "výskyty",
          lines: rule.occurrences.map(
            (o) => ["add", `${o.commentUrl} — ${o.excerpt}`] as ["add", string],
          ),
        },
      ],
    },
    source: "review-learning",
  };
}

/**
 * The `review-rule` approval runner. A rule reaches this flow only on its SECOND
 * occurrence, and it is parked unconditionally: unlike `AgentProposalFlowService`
 * there is deliberately no gate evaluation, because a no-match evaluation defaults
 * to `allow` and this rule was distilled from text an outsider wrote in a PR
 * comment (Law 4) — `rule.rule`, `rule.rationale`, and every `occurrence.excerpt`
 * are DATA shown to the operator for a decision, never executed or trusted, and
 * this flow must not activate anything on its own. Parking unconditionally is
 * strictly stronger than any gate verdict and needs no `POLICY.md` change. The
 * operator's decision is the only path to `active`.
 */
@Injectable()
export class ReviewRuleFlowService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;

  constructor(
    private readonly approvals: ApprovalsService,
    private readonly store: ReviewRulesStore,
    private readonly vault: ReviewRulesVaultService,
    logger: LoggerService,
  ) {
    this.log = logger.child(ReviewRuleFlowService.name);
  }

  onModuleInit(): void {
    this.approvals.register("review-rule", this);
  }

  /** Park the Tier-3 approval for a rule that has now been seen twice. */
  async propose(projectId: string, rule: ReviewRule): Promise<void> {
    await this.approvals.requestApproval({
      runId: reviewRuleRunId(projectId, rule.id),
      kind: "review-rule",
      skill: "review-learning",
      action: ADOPT_ACTION,
      detail: JSON.stringify(buildEnrichment(projectId, rule)),
      risk: "low",
    });
    this.log.info("review rule parked for approval", { projectId, ruleId: rule.id });
  }

  /** Approve → activate and re-render the project's rules note. */
  async resume(runId: string): Promise<void> {
    const parsed = parseReviewRuleRunId(runId);
    if (!parsed) {
      this.log.warn("review-rule resume skipped (malformed runId)", { runId });
      return;
    }
    const rule = await this.store.setStatus(parsed.projectId, parsed.ruleId, "active");
    if (!rule) {
      this.log.warn("review-rule resume skipped (unknown rule)", parsed);
      return;
    }
    await this.vault.render(parsed.projectId);
    this.log.info("review rule approved and grounded", parsed);
  }

  /**
   * Reject → retire. The rule keeps absorbing occurrences but is never proposed
   * again. `ApprovalsService.reject()` calls `cancel` UNAWAITED (its interface
   * return type is `void`), so any rejection here would become an unhandled
   * promise rejection — every step is wrapped so nothing can escape this method.
   */
  async cancel(runId: string): Promise<void> {
    const parsed = parseReviewRuleRunId(runId);
    if (!parsed) {
      this.log.warn("review-rule cancel skipped (malformed runId)", { runId });
      return;
    }
    try {
      await this.store.setStatus(parsed.projectId, parsed.ruleId, "retired");
      this.log.info("review rule rejected and retired", parsed);
    } catch (err) {
      this.log.error("review-rule cancel failed to retire rule", {
        ...parsed,
        error: String(err),
      });
    }
  }
}
