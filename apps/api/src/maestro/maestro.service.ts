import { Injectable, Optional } from "@nestjs/common";
import type {
  MergeCheckState,
  MergeQueue,
  MergeQueueEntry,
  MergeQueueQuery,
  MergeQueueState,
  MergeReviewState,
  Project,
  ProjectPr,
} from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { ProjectPrService, resolveGithubToken } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

const GITHUB_API = "https://api.github.com";

/** Only the newest N open PRs per repo get the 3-call enrichment; the rest are
 *  listed with unknown signals so a huge repo can't exhaust the rate limit. */
const MAX_ENRICHED_PER_REPO = 20;
/** `stale` when not `ready` and older than this (2 weeks). */
const STALE_AFTER_HOURS = 24 * 14;

interface GitHubPullDetail {
  mergeable?: boolean | null;
  head?: { sha?: string };
}
interface GitHubCheckRun {
  status?: string;
  conclusion?: string | null;
}
interface GitHubCheckRunsResponse {
  check_runs?: GitHubCheckRun[];
}
interface GitHubReview {
  state?: string;
  user?: { login?: string };
  submitted_at?: string;
}

/** Roll up GitHub's check-runs list to one verdict. `unknown` on no data (fail-open). */
function rollupCheckState(runs: GitHubCheckRun[]): MergeCheckState {
  if (runs.length === 0) return "unknown";
  if (runs.some((r) => r.status !== "completed")) return "pending";
  const FAILING = new Set(["failure", "cancelled", "timed_out", "action_required"]);
  if (runs.some((r) => r.conclusion && FAILING.has(r.conclusion))) return "failing";
  return "passing";
}

/** Latest-per-reviewer rollup: any current CHANGES_REQUESTED wins, else any APPROVED. */
function rollupReviewState(reviews: GitHubReview[]): MergeReviewState {
  const latestByReviewer = new Map<string, GitHubReview>();
  for (const review of reviews) {
    const login = review.user?.login;
    if (!login || !review.state) continue;
    const prior = latestByReviewer.get(login);
    if (!prior || (review.submitted_at ?? "") >= (prior.submitted_at ?? "")) {
      latestByReviewer.set(login, review);
    }
  }
  const states = [...latestByReviewer.values()].map((r) => r.state);
  if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
  if (states.includes("APPROVED")) return "approved";
  return "review_required";
}

function classify(
  checkState: MergeCheckState,
  reviewState: MergeReviewState,
  mergeable: MergeQueueEntry["mergeable"],
  draft: boolean,
  ageHours: number,
): MergeQueueState {
  if (
    checkState === "passing" &&
    reviewState === "approved" &&
    mergeable !== "conflicting" &&
    !draft
  ) {
    return "ready";
  }
  if (ageHours > STALE_AFTER_HOURS) return "stale";
  return "blocked";
}

function ageHoursOf(pr: ProjectPr, now: Date): number {
  if (!pr.createdAt) return 0;
  return Math.max(0, (now.getTime() - Date.parse(pr.createdAt)) / (60 * 60 * 1000));
}

/** Bucket order for the operator's glance: ready, then blocked, then stale;
 *  within a bucket, oldest first. */
const BUCKET_ORDER: Record<MergeQueueState, number> = { ready: 0, blocked: 1, stale: 2 };
function sortEntries(entries: MergeQueueEntry[]): MergeQueueEntry[] {
  return [...entries].sort((a, b) => {
    const bucket = BUCKET_ORDER[a.queueState] - BUCKET_ORDER[b.queueState];
    if (bucket !== 0) return bucket;
    return b.ageHours - a.ageHours;
  });
}

/**
 * NS2 F5b — Maestro's read-side merge queue. Enrichment-only over
 * `ProjectPrService.listOpen` (zero merge code): per open PR, three bounded
 * REST reads (mergeability, check-runs, reviews), all tolerant-parsed and
 * fail-open to `"unknown"`. Merging stays the operator's existing gated
 * `POST /projects/:id/prs/:number/merge` — this service never calls it.
 */
@Injectable()
export class MaestroService {
  private readonly fetchImpl: typeof fetch;
  private readonly log: ScopedLogger;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly projectPr: ProjectPrService,
    logger: LoggerService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.log = logger.child(MaestroService.name);
  }

  async queue(query: MergeQueueQuery = {}, now: Date = new Date()): Promise<MergeQueue> {
    const allProjects = await this.projects.list().catch(() => []);
    const projects = query.projectId
      ? allProjects.filter((p) => p.id === query.projectId)
      : allProjects;

    const entries: MergeQueueEntry[] = [];
    for (const project of projects) {
      try {
        entries.push(...(await this.queueForProject(project, now)));
      } catch (err) {
        this.log.warn("maestro: project queue failed — skipping repo", {
          project: project.id,
          error: String(err),
        });
      }
    }

    return { entries: sortEntries(entries), generatedAt: now.toISOString() };
  }

  /** Per-project summary lines for the briefing (e.g. `"acme: 2 ready · 1 blocked"`). */
  async summaryLines(): Promise<string[]> {
    const { entries } = await this.queue();
    const byProject = new Map<string, MergeQueueEntry[]>();
    for (const entry of entries) {
      const list = byProject.get(entry.projectId) ?? [];
      list.push(entry);
      byProject.set(entry.projectId, list);
    }
    const lines: string[] = [];
    for (const [, group] of byProject) {
      const name = group[0]?.projectName ?? group[0]?.projectId ?? "?";
      const ready = group.filter((e) => e.queueState === "ready").length;
      const blocked = group.filter((e) => e.queueState === "blocked").length;
      const stale = group.filter((e) => e.queueState === "stale").length;
      const parts = [
        ready > 0 ? `${ready} ready` : null,
        blocked > 0 ? `${blocked} blocked` : null,
        stale > 0 ? `${stale} stale` : null,
      ].filter((p): p is string => p !== null);
      if (parts.length > 0) lines.push(`${name}: ${parts.join(" · ")}`);
    }
    return lines;
  }

  private async queueForProject(project: Project, now: Date): Promise<MergeQueueEntry[]> {
    const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
    if (!link) return [];

    const prs = await this.projectPr.listOpen(project.id).catch((err) => {
      this.log.debug("maestro: listOpen failed", { project: project.id, error: String(err) });
      return [] as ProjectPr[];
    });
    if (prs.length === 0) return [];

    const sorted = [...prs].sort(
      (a, b) => Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0"),
    );
    const toEnrich = new Set(sorted.slice(0, MAX_ENRICHED_PER_REPO).map((pr) => pr.number));

    const entries: MergeQueueEntry[] = [];
    for (const pr of sorted) {
      const ageHours = ageHoursOf(pr, now);
      if (!toEnrich.has(pr.number)) {
        entries.push({
          ...pr,
          projectId: project.id,
          projectName: project.name,
          repo: link.repo,
          checkState: "unknown",
          reviewState: "unknown",
          mergeable: "unknown",
          ageHours,
          // Deliberately deprioritized rather than reclassified — a capped-out
          // PR always reads as `stale` regardless of its actual age.
          queueState: "stale",
        });
        continue;
      }

      const { checkState, reviewState, mergeable } = await this.enrich(link, pr);
      const queueState = classify(checkState, reviewState, mergeable, pr.draft, ageHours);
      entries.push({
        ...pr,
        projectId: project.id,
        projectName: project.name,
        repo: link.repo,
        checkState,
        reviewState,
        mergeable,
        ageHours,
        queueState,
      });
    }
    return entries;
  }

  private async enrich(
    link: { repo: string; token: string },
    pr: ProjectPr,
  ): Promise<{
    checkState: MergeCheckState;
    reviewState: MergeReviewState;
    mergeable: MergeQueueEntry["mergeable"];
  }> {
    const headers = {
      authorization: `Bearer ${link.token}`,
      accept: "application/vnd.github+json",
    };

    let mergeable: MergeQueueEntry["mergeable"] = "unknown";
    let sha: string | undefined;
    try {
      const res = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls/${pr.number}`, {
        headers,
      });
      if (res.ok) {
        const detail = (await res.json().catch(() => null)) as GitHubPullDetail | null;
        if (detail?.mergeable === true) mergeable = "mergeable";
        else if (detail?.mergeable === false) mergeable = "conflicting";
        sha = detail?.head?.sha;
      }
    } catch (err) {
      this.log.debug("maestro: pull detail fetch failed", { repo: link.repo, error: String(err) });
    }

    let checkState: MergeCheckState = "unknown";
    if (sha) {
      try {
        const res = await this.fetchImpl(
          `${GITHUB_API}/repos/${link.repo}/commits/${sha}/check-runs`,
          { headers },
        );
        if (res.ok) {
          const body = (await res.json().catch(() => null)) as GitHubCheckRunsResponse | null;
          checkState = rollupCheckState(body?.check_runs ?? []);
        }
      } catch (err) {
        this.log.debug("maestro: check-runs fetch failed", { repo: link.repo, error: String(err) });
      }
    }

    let reviewState: MergeReviewState = "unknown";
    try {
      const res = await this.fetchImpl(
        `${GITHUB_API}/repos/${link.repo}/pulls/${pr.number}/reviews`,
        { headers },
      );
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as unknown;
        const reviews = Array.isArray(body) ? (body as GitHubReview[]) : [];
        reviewState = rollupReviewState(reviews);
      }
    } catch (err) {
      this.log.debug("maestro: reviews fetch failed", { repo: link.repo, error: String(err) });
    }

    return { checkState, reviewState, mergeable };
  }
}
