import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ArtifactsModule } from "../artifacts/artifacts.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { VAULT_DIR } from "../memory/vault.service";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { ScheduledTasksStorageModule } from "../tasks/scheduled-tasks-storage.module";
import { ReviewCommentDistiller } from "./review-comment.distiller";
import { ReviewCommentFetcher } from "./review-comment.fetcher";
import { ReviewRuleFlowService } from "./review-rule-flow.service";
import { REVIEW_RULES_DIR, ReviewRulesStore } from "./review-rules.store";
import { ReviewRulesVaultService } from "./review-rules.vault.service";
import { ReviewLearningService } from "./review-learning.service";
import { ZibbyPrLocator } from "./zibby-pr.locator";

/** Default review-rules dir, anchored to `ZIBBY_DATA_DIR/review-rules`. */
export function resolveReviewRulesDir(): string {
  return process.env.REVIEW_RULES_DIR ?? dataDir("review-rules");
}

/**
 * Task 9 — the nightly `review-learn` pass, wired into DI. A leaf module (like
 * `MaestroModule`, which solves the exact same import set): `ProjectsModule` (for
 * `ProjectsStorageService`), `ResolvedProjectModule` + `IntegrationsModule` (the
 * shared `resolveGithubToken` seam — `resolveGithubToken` itself is a free
 * function imported directly by `ReviewLearningService`, not a DI provider),
 * `ArtifactsModule` + `ScheduledTasksStorageModule` (both consumed by
 * `ZibbyPrLocator`), and `ApprovalsModule` (`ReviewRuleFlowService`'s approval
 * sink). None of these import this module back, so there is no cycle risk.
 *
 * `VAULT_DIR` is re-provided locally with its own factory rather than imported
 * from `MemoryModule` — `MemoryModule` does not export that token (same
 * precedent as `ProjectsModule`, which does the same for its own `ProjectPrService`
 * grounding writes).
 */
@Module({
  imports: [
    ProjectsModule,
    ResolvedProjectModule,
    IntegrationsModule,
    ArtifactsModule,
    ScheduledTasksStorageModule,
    ApprovalsModule,
  ],
  providers: [
    { provide: REVIEW_RULES_DIR, useFactory: resolveReviewRulesDir },
    { provide: VAULT_DIR, useFactory: () => process.env.VAULT_DIR ?? dataDir("vault") },
    ReviewRulesStore,
    ZibbyPrLocator,
    ReviewCommentFetcher,
    ReviewCommentDistiller,
    ReviewRulesVaultService,
    ReviewRuleFlowService,
    ReviewLearningService,
  ],
  exports: [ReviewLearningService, ReviewRulesVaultService],
})
export class ReviewLearningModule {}
