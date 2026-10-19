import { Injectable, Optional } from "@nestjs/common";
import type { InboxPrDiff } from "@zibby/contracts";
import { CredentialsStore } from "../integrations/credentials.store";
import { resolveGithubToken } from "../projects/project-pr.service";
import { NoGithubLinkError } from "../projects/projects.errors";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";

const GITHUB_API = "https://api.github.com";

/** GitHub refuses (406) diffs over its own limits; we also cap what we ship to the browser. */
export const MAX_DIFF_BYTES = 2_000_000;

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
    });
    if (res.status === 406) return { diff: "", truncated: true };
    if (!res.ok) throw new Error(`GitHub diff for ${link.repo}#${number} failed: ${res.status}`);
    const text = await res.text();
    if (text.length <= MAX_DIFF_BYTES) return { diff: text, truncated: false };
    const nl = text.lastIndexOf("\ndiff --git", MAX_DIFF_BYTES - 1); // line-anchored: not "+diff --git" in a hunk
    const cut = nl >= 0 ? nl + 1 : -1;
    return { diff: text.slice(0, cut > 0 ? cut : MAX_DIFF_BYTES), truncated: true };
  }
}
