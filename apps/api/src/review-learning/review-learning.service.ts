import { Injectable, Optional } from "@nestjs/common";
import type { Project } from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { resolveGithubToken } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ReviewCommentDistiller } from "./review-comment.distiller";
import { ReviewCommentFetcher } from "./review-comment.fetcher";
import { ReviewRuleFlowService } from "./review-rule-flow.service";
import { ReviewRulesStore } from "./review-rules.store";
import { ReviewRulesVaultService } from "./review-rules.vault.service";

/** Excerpt kept on an occurrence — enough to judge the rule, not the whole thread. */
const EXCERPT_LIMIT = 400;

type GithubLinkResolver = (
  resolved: ResolvedProjectService,
  credentials: CredentialsStore,
  project: Project,
) => Promise<{ repo: string; token: string } | null>;

/**
 * The nightly `review-learn` pass. Per project: fetch new review comments on the
 * PRs ZIBBY opened, distil them into candidate rules against that project's known
 * slugs, file each as an occurrence, and park an approval for any rule that just
 * reached its second occurrence.
 *
 * Fail-open per project (one bad repo never stops the others) and replay-safe: the
 * cursor advances only after a distillation actually produced something AND every
 * fetch endpoint succeeded, and the store refuses to count the same `commentId`
 * twice.
 */
@Injectable()
export class ReviewLearningService {
  private readonly log: ScopedLogger;
  private readonly resolveLink: GithubLinkResolver;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly fetcher: ReviewCommentFetcher,
    private readonly distiller: ReviewCommentDistiller,
    private readonly store: ReviewRulesStore,
    private readonly flow: ReviewRuleFlowService,
    private readonly vault: ReviewRulesVaultService,
    logger: LoggerService,
    @Optional() resolveLink?: GithubLinkResolver,
  ) {
    this.log = logger.child(ReviewLearningService.name);
    this.resolveLink = resolveLink ?? resolveGithubToken;
  }

  async learn(now: Date = new Date()): Promise<{ observations: number; proposed: number }> {
    const projects = await this.projects.list().catch(() => []);
    let observations = 0;
    let proposed = 0;

    for (const project of projects) {
      try {
        const result = await this.learnForProject(project, now);
        observations += result.observations;
        proposed += result.proposed;
      } catch (err) {
        this.log.warn("review learning failed for project — skipping", {
          projectId: project.id,
          error: String(err),
        });
      }
    }

    this.log.info("review learning pass complete", { observations, proposed });
    return { observations, proposed };
  }

  private async learnForProject(
    project: Project,
    now: Date,
  ): Promise<{ observations: number; proposed: number }> {
    const link = await this.resolveLink(this.resolvedProjects, this.credentials, project);
    if (!link) return { observations: 0, proposed: 0 };

    const cursor = await this.store.cursor(project.id);
    // `selfLogin` is deliberately left unpassed: ZIBBY opens its PRs with the
    // operator's own GitHub token, so ZIBBY's author identity IS the operator's
    // login. Passing `selfLogin` here would filter out the operator's own review
    // comments — precisely the feedback this feature exists to learn from.
    const { comments, failedEndpoints } = await this.fetcher.fetchNew({
      projectId: project.id,
      repo: link.repo,
      token: link.token,
      ...(cursor ? { cursor } : {}),
    });
    if (comments.length === 0) return { observations: 0, proposed: 0 };

    const known = (await this.store.list(project.id)).map((r) => ({ id: r.id, rule: r.rule }));
    const distilled = await this.distiller.distill(comments, known);
    if (distilled.length === 0) {
      // Either nothing was actionable or the distiller failed. Leaving the cursor
      // untouched costs one replayed batch and never loses a comment; the store's
      // commentId dedup makes the replay free of double-counting.
      this.log.debug("no observations distilled — cursor held", {
        projectId: project.id,
        comments: comments.length,
      });
      return { observations: 0, proposed: 0 };
    }

    const byId = new Map(comments.map((c) => [c.commentId, c]));
    let proposed = 0;
    for (const observation of distilled) {
      const source = byId.get(observation.commentId);
      if (!source) continue;
      const promoted = await this.store.record(
        project.id,
        {
          slug: observation.slug,
          rule: observation.rule,
          ...(observation.rationale ? { rationale: observation.rationale } : {}),
          occurrence: {
            commentId: source.commentId,
            prUrl: source.prUrl,
            commentUrl: source.commentUrl,
            author: source.author,
            at: source.at,
            excerpt: source.body.slice(0, EXCERPT_LIMIT),
          },
        },
        now,
      );
      if (promoted) {
        await this.flow.propose(project.id, promoted);
        proposed++;
      }
    }

    // A non-empty `failedEndpoints` means the fetch window is INCOMPLETE — some
    // endpoint's comments were never seen this pass. Advancing the cursor past a
    // window we never actually observed would permanently lose whatever landed
    // there, so the cursor is held (the whole window replays next pass; the
    // store's commentId dedup keeps that replay free of double-counting) while
    // still keeping every occurrence that DID arrive this pass.
    if (failedEndpoints.length > 0) {
      this.log.warn("review comment fetch had failed endpoints — cursor held", {
        projectId: project.id,
        failedEndpoints,
      });
      return { observations: distilled.length, proposed };
    }

    const newest = comments.reduce((max, c) => (c.at > max ? c.at : max), comments[0]?.at ?? "");
    if (newest) await this.store.setCursor(project.id, newest);

    return { observations: distilled.length, proposed };
  }
}
