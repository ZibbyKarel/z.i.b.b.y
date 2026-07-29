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
 * cursor advances only when the distiller actually RAN over the whole window AND
 * every fetch endpoint succeeded, and the store refuses to count the same
 * `commentId` twice. "Ran and found nothing actionable" is a complete pass and
 * advances; "failed, timed out, or never ran" is not and holds.
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
    if (!link) {
      // Ordinary — most projects have no GitHub link at all — but it is also the
      // first thing an operator needs to rule out when a pass reports 0/0, so it
      // must not be completely silent. `debug`, and named, so `LOG_LEVEL=debug`
      // answers "why did nothing happen for this project?" without putting a line
      // per link-less project into every night's log.
      this.log.debug("project has no GitHub link — review learning skipped", {
        projectId: project.id,
      });
      return { observations: 0, proposed: 0 };
    }

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
    if (distilled.status === "incomplete") {
      // The distiller failed or never ran, so this window was never actually
      // examined — held, exactly like a failed fetch endpoint below. Costs one
      // replayed batch and loses nothing; the store's commentId dedup makes the
      // replay free of double-counting.
      this.log.warn("review distillation incomplete — cursor held", {
        projectId: project.id,
        reason: distilled.reason,
        comments: comments.length,
      });
    } else if (distilled.observations.length === 0) {
      // The OTHER zero-observation case, and the reason this branch exists: the
      // distiller ran, read the window, and found nothing worth learning from
      // (`LGTM`, `thanks`, `done`). That is a complete answer, not a failure —
      // holding the cursor here would re-fetch and re-distil the same comments
      // every night forever and strand every later comment behind
      // MAX_COMMENTS_PER_PASS's oldest-first cap.
      this.log.debug("nothing actionable in this window — cursor may advance", {
        projectId: project.id,
        comments: comments.length,
      });
    }

    const byId = new Map(comments.map((c) => [c.commentId, c]));
    let proposed = 0;
    for (const observation of distilled.observations) {
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
    // still keeping every occurrence that DID arrive this pass. Independent of,
    // and checked separately from, the distiller's own outcome above: a complete
    // distillation over an incomplete fetch window still must not advance.
    if (failedEndpoints.length > 0) {
      this.log.warn("review comment fetch had failed endpoints — cursor held", {
        projectId: project.id,
        failedEndpoints,
      });
    }

    if (distilled.status === "ok" && failedEndpoints.length === 0) {
      const newest = comments.reduce((max, c) => (c.at > max ? c.at : max), comments[0]?.at ?? "");
      if (newest) await this.store.setCursor(project.id, newest);
    }

    return { observations: distilled.observations.length, proposed };
  }
}
