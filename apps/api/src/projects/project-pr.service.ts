import { Inject, Injectable, Optional, forwardRef } from "@nestjs/common";
import type {
  CredentialsInput,
  Integration,
  MergeMethod,
  Project,
  ProjectPr,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { MergeWatchStore } from "../maestro/merge-watch.store";
// 125e — the roadmap gate's eager merge signal (see `recordMerge` below). This
// closes a genuine circular provider dependency with `RoadmapGateService`
// (RoadmapModule already depends on ProjectsModule for `ProjectsStorageService`
// and the classes reach into each other), resolved with `forwardRef` on both the
// module registration (`projects.module.ts` <-> `roadmap.module.ts`) and this
// constructor injection, exactly like the pre-existing `ResolvedProjectModule` <->
// `IntegrationsModule` <-> `ProjectsModule` triangle.
import { RoadmapGateService } from "../roadmap/roadmap-gate.service";
import { NoGithubLinkError, PrNotMergeableError } from "./projects.errors";
import { ProjectsStorageService } from "./projects.storage.service";
import { ResolvedProjectService } from "./resolved-project.service";

const GITHUB_API = "https://api.github.com";

/** Bounds the open-PRs listing call — this feeds the Maestro merge queue and
 *  the briefing/`get_status` chat tool, so a stalled request must not hang it. */
const LIST_OPEN_TIMEOUT_MS = 8_000;

/** NS2 F7b-2 — how long a merge is watched for its target-branch CI outcome. */
const POST_MERGE_WINDOW_MIN = 120;

/** Satisfy `MERGE_WATCH_ID_REGEX` (`merge-watch.store.ts`) — mirrors `sentry.monitor.ts`'s helper. */
function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

interface GitHubPull {
  number?: number;
  title?: string;
  html_url?: string;
  user?: { login?: string };
  head?: { ref?: string };
  draft?: boolean;
  created_at?: string;
}

/** PAT from the closed credentials union (null if absent) — same shape as the CI monitor. */
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null;
}

/**
 * NS2 F5a/F5b — the project's effective github integration's repo + stored
 * token, or `null`. Extracted out of {@link ProjectPrService}'s private
 * `resolveGithubLink` so `SentinelService` and `MaestroService` reach the
 * exact same token-resolution seam (company-merged integrations,
 * `CredentialsStore` read, `tokenOf` narrowing) without duplicating it.
 * `ProjectPrService` itself delegates to this function below.
 */
export async function resolveGithubToken(
  resolvedProjects: ResolvedProjectService,
  credentials: CredentialsStore,
  project: Project,
): Promise<{ repo: string; token: string } | null> {
  const integrations = await resolvedProjects.resolveIntegrations(project);
  const github = integrations.find(
    (integration): integration is Integration & { config: { kind: "github"; repo: string } } =>
      integration.config.kind === "github",
  );
  if (!github) return null;
  const creds = await credentials.read(github.id);
  const token = creds ? tokenOf(creds) : null;
  if (!token) return null;
  return { repo: github.config.repo, token };
}

/** Map one GitHub `pulls` list entry to the wire `ProjectPr` shape; `null` for a malformed entry. */
function toProjectPr(pull: GitHubPull): ProjectPr | null {
  if (pull.number === undefined) return null;
  return {
    number: pull.number,
    title: pull.title ?? "",
    url: pull.html_url ?? "",
    ...(pull.user?.login ? { author: pull.user.login } : {}),
    ...(pull.head?.ref ? { branch: pull.head.ref } : {}),
    draft: pull.draft === true,
    ...(pull.created_at ? { createdAt: new Date(pull.created_at).toISOString() } : {}),
  };
}

/**
 * Phase 78 — the open-PR overview and operator-triggered merge for a project's
 * linked GitHub repo. Reuses the CI monitor's GitHub-REST posture exactly:
 * `Bearer <token>`, rate-limit handling on 429/403, an injectable `fetchImpl`
 * for tests (`@github-ci.monitor.ts` is the reference).
 *
 * `listOpen` resolves the project's EFFECTIVE (company-merged) integrations —
 * same seam `ResolvedProjectService` already gives every other project reader —
 * and never errors on a missing link: no github integration, or an integration
 * with no stored token, both read as "nothing to show" (`[]`), never an error
 * page (the Phase 78 plan's "Data source" section). `merge` is the opposite:
 * an explicit operator click needs a real answer, so a missing link there is a
 * 422, not a silent no-op.
 */
@Injectable()
export class ProjectPrService {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    // NS2 F7b-2 — the merge-record → post-merge-poll loop's write side.
    private readonly mergeWatch: MergeWatchStore,
    private readonly activity: ActivityLogService,
    // 125e — see the import comment above for why this needs `forwardRef`.
    @Inject(forwardRef(() => RoadmapGateService)) private readonly roadmapGate: RoadmapGateService,
    // Optional so Nest doesn't try to DI-resolve a plain function type —
    // production defaults to the global `fetch`; tests inject a stub (mirrors
    // `JiraIssueFlowService`'s `@Optional() adapter?` seam).
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** The project's effective github integration's repo + stored token, or `null`. */
  private async resolveGithubLink(
    project: Project,
  ): Promise<{ repo: string; token: string } | null> {
    return resolveGithubToken(this.resolvedProjects, this.credentials, project);
  }

  /**
   * Open PRs for the project's linked repo (`GET /repos/{repo}/pulls?state=open`),
   * newest per GitHub's default order. `[]` when the project has no github link/
   * token — never an error. A hard GitHub failure (rate limit, non-2xx) still
   * throws, same as the CI monitor: a real upstream failure is not silently
   * swallowed into an empty list.
   */
  async listOpen(projectId: string): Promise<ProjectPr[]> {
    const project = await this.projects.get(projectId); // 404 before anything else
    const link = await this.resolveGithubLink(project);
    if (!link) return [];

    const res = await this.fetchImpl(
      `${GITHUB_API}/repos/${link.repo}/pulls?state=open&per_page=50`,
      {
        headers: { authorization: `Bearer ${link.token}`, accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(LIST_OPEN_TIMEOUT_MS),
      },
    );
    if (res.status === 429 || res.status === 403) {
      throw new Error(`github rate limited (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`github pulls: HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    const pulls = Array.isArray(body) ? (body as GitHubPull[]) : [];

    const prs: ProjectPr[] = [];
    for (const pull of pulls) {
      const pr = toProjectPr(pull);
      if (pr) prs.push(pr);
    }
    return prs;
  }

  /**
   * One PR's minimal live state (`GET /repos/{repo}/pulls/{number}`) — the roadmap
   * gate's merge-state poll (125e), reading every `awaiting-merge` item's PR. Mirrors
   * `listOpen`'s error posture exactly: 404 → `null` (PR/repo gone), 429/403 → throws
   * "github rate limited", any other non-2xx → throws, no github link → `null`.
   */
  async getPr(
    projectId: string,
    number: number,
  ): Promise<{ number: number; merged: boolean; state: "open" | "closed" } | null> {
    const project = await this.projects.get(projectId); // 404 before anything else
    const link = await this.resolveGithubLink(project);
    if (!link) return null;

    const res = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls/${number}`, {
      headers: { authorization: `Bearer ${link.token}`, accept: "application/vnd.github+json" },
    });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status === 403) {
      throw new Error(`github rate limited (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`github pull #${number}: HTTP ${res.status}`);
    const body = (await res.json()) as { number?: number; merged?: boolean; state?: string };
    return {
      number: body.number ?? number,
      merged: body.merged === true,
      state: body.state === "closed" ? "closed" : "open",
    };
  }

  /**
   * Fail-CLOSED: unknown/gone/no-link/rate-limited → `false`. A dependency GATE must
   * never release a downstream roadmap item on an unreadable PR state — the opposite
   * of `PostMergeWatchService.rollup`'s fail-open `"pending"`, which is watching an
   * ALREADY-merged sha's CI outcome, not gating a fresh dispatch.
   */
  async isMerged(projectId: string, number: number): Promise<boolean> {
    try {
      const pr = await this.getPr(projectId, number);
      return pr?.merged === true;
    } catch {
      return false;
    }
  }

  /**
   * Merge one open PR (`PUT /repos/{repo}/pulls/{number}/merge`).
   *
   * **This method is the ONLY merge path in ZIBBY, and it is reached ONLY from
   * the operator-triggered `POST /projects/:id/prs/:number/merge` controller
   * route below — it is never called from any scheduler, monitor, or autonomous
   * runner.** Merging is a Tier-3, "surface and wait" action (CLAUDE.md): the
   * web UI gates every call behind a mandatory confirm dialog, and the Law
   * "Never: Auto-merge" means no watcher/pipeline in this codebase may invoke
   * this method on the project's behalf.
   */
  async merge(
    projectId: string,
    number: number,
    method?: MergeMethod,
  ): Promise<{ merged: boolean; url?: string; sha?: string }> {
    const project = await this.projects.get(projectId); // 404 before anything else
    const link = await this.resolveGithubLink(project);
    if (!link) throw new NoGithubLinkError(projectId);

    const res = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls/${number}/merge`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${link.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: JSON.stringify(method ? { merge_method: method } : {}),
    });
    if (res.status === 405 || res.status === 409) {
      const detail = await res
        .json()
        .then((b: { message?: string }) => b.message)
        .catch(() => undefined);
      throw new PrNotMergeableError(projectId, number, detail);
    }
    if (!res.ok) throw new Error(`github merge PR #${number}: HTTP ${res.status}`);
    const body = (await res.json()) as { merged?: boolean; sha?: string };
    const merged = body.merged === true;

    if (merged) {
      // NS2 F7b-2 — record the merge + start the post-merge CI watch. Merging
      // itself is unconditional and un-gated by this: a recording failure must
      // NEVER surface as a merge failure (the merge already happened on GitHub).
      await this.recordMerge(projectId, link.repo, number, body.sha).catch(() => {});
    }

    return {
      merged,
      url: `https://github.com/${link.repo}/pull/${number}`,
      ...(body.sha ? { sha: body.sha } : {}),
    };
  }

  /**
   * NS2 F7b-2 — the merge loop's head: an activity entry (always) and, when the
   * response carried a sha, a `watching` {@link MergeWatch} for
   * `PostMergeWatchService` to poll. `prTitle` falls back to the PR number — the
   * title isn't known at this call site (only `listOpen` reads it).
   */
  private async recordMerge(
    projectId: string,
    repo: string,
    number: number,
    sha: string | undefined,
  ): Promise<void> {
    void this.activity.record({
      kind: "merge-completed",
      summary: sha
        ? `Merged PR #${number} in ${repo} (${sha.slice(0, 7)})`
        : `Merged PR #${number} in ${repo}`,
      refs: { projectId, itemId: `pr-${number}` },
    });
    // 125e — the roadmap gate's EAGER release signal: an item `awaiting-merge` on
    // this exact PR becomes `done` and its project's enqueued items drain.
    // Deliberately UNAWAITED (fire-and-forget, per the master plan's "Release
    // signals") — the operator's merge response must never wait on roadmap
    // bookkeeping — and independently `.catch`ed here (not just relying on this
    // method's own caller wrapping it in `.catch(() => {})`): an unawaited rejection
    // is invisible to that outer catch and would otherwise surface as an unhandled
    // rejection. Either way, a roadmap bookkeeping failure must NEVER surface as a
    // merge failure — the merge already happened on GitHub.
    void this.roadmapGate.onMerge(projectId, number).catch(() => {});
    if (!sha) return; // no sha in the response — nothing to watch

    const mergedAt = new Date();
    const deadline = new Date(mergedAt.getTime() + POST_MERGE_WINDOW_MIN * 60_000);
    await this.mergeWatch.putNew({
      id: `merge-${slug(repo)}-${sha}`,
      projectId,
      repo,
      sha,
      prNumber: number,
      prTitle: `PR #${number}`,
      mergedAt: mergedAt.toISOString(),
      deadline: deadline.toISOString(),
      attempts: 0,
      state: "watching",
    });
  }
}
