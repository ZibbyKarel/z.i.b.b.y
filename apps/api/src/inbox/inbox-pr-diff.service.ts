import { Injectable, Optional } from "@nestjs/common";
import type { InboxPrDiff } from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { resolveGithubToken } from "../projects/project-pr.service";
import { NoGithubLinkError } from "../projects/projects.errors";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";

const GITHUB_API = "https://api.github.com";

/** GitHub refuses (406) diffs over its own limits; we also cap what we ship to the browser. */
// ponytail: the whole body is read into memory before the cap is applied and the cap counts
// UTF-16 chars, not bytes; upgrade = per-file collapse/virtualization in FileDiffView.
export const MAX_DIFF_BYTES = 500_000;

const GITHUB_TIMEOUT_MS = 15_000;

/** GitHub answered the diff request with an unexpected status; `status` is the upstream one. */
export class GithubDiffError extends Error {
  constructor(
    public readonly status: number,
    repo: string,
    number: number,
  ) {
    super(`GitHub diff for ${repo}#${number} failed: ${status}`);
    this.name = "GithubDiffError";
  }
}

/** Reads one PR's unified diff for the Pull Requests page detail pane. Read-only (Tier 1). */
@Injectable()
export class InboxPrDiffService {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async getDiff(projectId: string, number: number): Promise<InboxPrDiff> {
    const project = await this.projects.get(projectId); // ProjectNotFoundError → 404
    const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
    if (!link) throw new NoGithubLinkError(project.id);
    const res = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls/${number}`, {
      headers: {
        accept: "application/vnd.github.diff",
        authorization: `Bearer ${link.token}`,
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (res.status === 406) return { diff: "", truncated: true };
    if (!res.ok) throw new GithubDiffError(res.status, link.repo, number);
    const text = await res.text();
    if (text.length <= MAX_DIFF_BYTES) return { diff: text, truncated: false };
    const nl = text.lastIndexOf("\ndiff --git", MAX_DIFF_BYTES - 1); // line-anchored: not "+diff --git" in a hunk
    const cut = nl >= 0 ? nl + 1 : -1;
    return { diff: text.slice(0, cut > 0 ? cut : MAX_DIFF_BYTES), truncated: true };
  }
}
