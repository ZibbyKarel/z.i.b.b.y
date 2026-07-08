import { Injectable, Optional } from "@nestjs/common";
import type { CredentialsInput, Integration, MergeMethod, Project, ProjectPr } from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { NoGithubLinkError, PrNotMergeableError } from "./projects.errors";
import { ProjectsStorageService } from "./projects.storage.service";
import { ResolvedProjectService } from "./resolved-project.service";

const GITHUB_API = "https://api.github.com";

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
    // Optional so Nest doesn't try to DI-resolve a plain function type —
    // production defaults to the global `fetch`; tests inject a stub (mirrors
    // `JiraIssueFlowService`'s `@Optional() adapter?` seam).
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** The project's effective github integration's repo + stored token, or `null`. */
  private async resolveGithubLink(project: Project): Promise<{ repo: string; token: string } | null> {
    const integrations = await this.resolvedProjects.resolveIntegrations(project);
    const github = integrations.find(
      (integration): integration is Integration & { config: { kind: "github"; repo: string } } =>
        integration.config.kind === "github",
    );
    if (!github) return null;
    const creds = await this.credentials.read(github.id);
    const token = creds ? tokenOf(creds) : null;
    if (!token) return null;
    return { repo: github.config.repo, token };
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

    const res = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls?state=open&per_page=50`, {
      headers: { authorization: `Bearer ${link.token}`, accept: "application/vnd.github+json" },
    });
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
  ): Promise<{ merged: boolean; url?: string }> {
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
    const body = (await res.json()) as { merged?: boolean };
    return { merged: body.merged === true, url: `https://github.com/${link.repo}/pull/${number}` };
  }
}
