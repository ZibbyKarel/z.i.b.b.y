import { Inject, Injectable, Optional, forwardRef } from "@nestjs/common";
import {
  type CredentialsInput,
  type MergeMethod,
  type MergeProjectPrResult,
  type Project,
  type ProjectPr,
  type ProjectPrUpdateResult,
  githubRepoFor,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
// 125e — the roadmap gate's eager merge signal (see `recordMerge` below). This
// closes a genuine circular provider dependency with `RoadmapGateService`
// (RoadmapModule already depends on ProjectsModule for `ProjectsStorageService`
// and the classes reach into each other), resolved with `forwardRef` on both the
// module registration (`projects.module.ts` <-> `roadmap.module.ts`) and this
// constructor injection, exactly like the pre-existing `ResolvedProjectModule` <->
// `IntegrationsModule` <-> `ProjectsModule` triangle.
import { RoadmapGateService } from "../roadmap/roadmap-gate.service";
import { NoGithubLinkError, PrNotMergeableError, PrUpdateRefusedError } from "./projects.errors";
import { ProjectsStorageService } from "./projects.storage.service";
import { ResolvedProjectService } from "./resolved-project.service";

const GITHUB_API = "https://api.github.com";

/** Bounds the open-PRs listing call — this feeds the Release merge queue and
 *  the briefing/`get_status` chat tool, so a stalled request must not hang it. */
const LIST_OPEN_TIMEOUT_MS = 8_000;

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
 * `resolveGithubLink` so `SecurityService` and `ReleaseService` reach the
 * exact same token-resolution seam (company-merged integrations,
 * `CredentialsStore` read, `tokenOf` narrowing) without duplicating it.
 * `ProjectPrService` itself delegates to this function below.
 */
export async function resolveGithubToken(
  resolvedProjects: ResolvedProjectService,
  credentials: CredentialsStore,
  project: Project,
): Promise<{ repo: string; token: string; username?: string } | null> {
  const integrations = await resolvedProjects.resolveIntegrations(project);
  const github = integrations.find((integration) => integration.config.kind === "github");
  if (!github) return null;
  // Phase 129 (G2): a company-owned integration takes the repo from the project's gitRemote.
  const repo = githubRepoFor(github, project);
  if (!repo) return null;
  const creds = await credentials.read(github.id);
  const token = creds ? tokenOf(creds) : null;
  if (!token) return null;
  const username = github.config.kind === "github" ? github.config.username : undefined;
  return { repo, token, ...(username ? { username } : {}) };
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
  /** Phase 129 P3 — PR change listeners (the PR inbox drops its cache); registered at startup. */
  private readonly changedListeners: ((repo: string, number: number) => void)[] = [];

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
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

  /** Register a callback fired after every successful merge / close / draft toggle (no module cycle). */
  onPrChanged(listener: (repo: string, number: number) => void): void {
    this.changedListeners.push(listener);
  }

  private notifyChanged(repo: string, number: number): void {
    for (const listener of this.changedListeners) {
      try {
        listener(repo, number);
      } catch {
        // a listener failure must never surface as a failure of the change itself
      }
    }
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
   * of a fail-open posture, which is fine for a status read but not for gating a
   * fresh dispatch.
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
   * "Never: Auto-merge" means no watcher/workflow in this codebase may invoke
   * this method on the project's behalf.
   */
  async merge(
    projectId: string,
    number: number,
    method?: MergeMethod,
    deleteBranch = false,
  ): Promise<MergeProjectPrResult> {
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
      // Record the merge (activity + roadmap gate). Merging
      // itself is unconditional and un-gated by this: a recording failure must
      // NEVER surface as a merge failure (the merge already happened on GitHub).
      await this.recordMerge(projectId, link.repo, number, body.sha).catch(() => {});
      this.notifyChanged(link.repo, number);
    }
    const cleanup = merged && deleteBranch ? await this.deleteHeadBranch(link, number) : {};

    return {
      merged,
      url: `https://github.com/${link.repo}/pull/${number}`,
      ...(body.sha ? { sha: body.sha } : {}),
      ...cleanup,
    };
  }

  /**
   * todo-15 — close an open PR without merging (`PATCH /repos/{repo}/pulls/{number}`).
   * Like `merge`, reached ONLY from the operator-triggered controller route (the UI confirms
   * first) and denied to the chat self-API; no scheduler, monitor or runner calls it.
   */
  async close(projectId: string, number: number): Promise<ProjectPrUpdateResult> {
    const link = await this.requireLink(projectId);
    const res = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls/${number}`, {
      method: "PATCH",
      headers: this.ghHeaders(link.token),
      body: JSON.stringify({ state: "closed" }),
    });
    if (res.status === 403 || res.status === 409 || res.status === 422) {
      throw new PrUpdateRefusedError(projectId, number, await ghMessage(res));
    }
    if (!res.ok) throw new Error(`github close PR #${number}: HTTP ${res.status}`);
    const pull = (await res.json()) as { state?: string; draft?: boolean; html_url?: string };
    this.notifyChanged(link.repo, number);
    return {
      url: pull.html_url ?? `https://github.com/${link.repo}/pull/${number}`,
      state: pull.state === "open" ? "open" : "closed",
      draft: pull.draft === true,
    };
  }

  /**
   * todo-15 — convert a PR to draft (`draft: true`) or mark it ready for review. GitHub's REST
   * API cannot do either, so this reads the PR's `node_id` and runs the GraphQL
   * `convertPullRequestToDraft` / `markPullRequestReadyForReview` mutation. Operator-only, same
   * guard as `close`. A PR already in the requested state is a no-op.
   */
  async setDraft(
    projectId: string,
    number: number,
    draft: boolean,
  ): Promise<ProjectPrUpdateResult> {
    const link = await this.requireLink(projectId);
    const headers = this.ghHeaders(link.token);
    const read = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls/${number}`, {
      headers,
    });
    if (!read.ok) throw new Error(`github read PR #${number}: HTTP ${read.status}`);
    const pull = (await read.json()) as {
      node_id?: string;
      state?: string;
      draft?: boolean;
      html_url?: string;
    };
    const url = pull.html_url ?? `https://github.com/${link.repo}/pull/${number}`;
    if (pull.state !== "open")
      throw new PrUpdateRefusedError(projectId, number, "the PR is not open");
    if ((pull.draft === true) === draft) return { url, state: "open", draft };
    if (!pull.node_id) throw new Error(`github read PR #${number}: no node_id`);

    const mutation = draft ? "convertPullRequestToDraft" : "markPullRequestReadyForReview";
    const res = await this.fetchImpl(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `mutation($id: ID!) { ${mutation}(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
        variables: { id: pull.node_id },
      }),
    });
    if (!res.ok) throw new Error(`github ${mutation} PR #${number}: HTTP ${res.status}`);
    const body = (await res.json()) as { errors?: { message?: string }[] };
    if (body.errors?.length) {
      throw new PrUpdateRefusedError(projectId, number, body.errors[0]?.message);
    }
    this.notifyChanged(link.repo, number);
    return { url, state: "open", draft };
  }

  private async requireLink(projectId: string): Promise<{ repo: string; token: string }> {
    const project = await this.projects.get(projectId); // 404 before anything else
    const link = await this.resolveGithubLink(project);
    if (!link) throw new NoGithubLinkError(projectId);
    return link;
  }

  private ghHeaders(token: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    };
  }

  /**
   * Phase 129 P3 — delete a merged PR's head branch
   * (`DELETE /repos/{repo}/git/refs/heads/{branch}`). Skipped for a fork (head repo ≠
   * base repo — not ours to delete). Never throws: the merge already happened, so a
   * failed lookup/delete only comes back as a `note`.
   */
  private async deleteHeadBranch(
    link: { repo: string; token: string },
    number: number,
  ): Promise<Pick<MergeProjectPrResult, "branchDeleted" | "note">> {
    const headers = {
      authorization: `Bearer ${link.token}`,
      accept: "application/vnd.github+json",
    };
    try {
      const res = await this.fetchImpl(`${GITHUB_API}/repos/${link.repo}/pulls/${number}`, {
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} reading the PR`);
      const pull = (await res.json()) as {
        head?: { ref?: string; repo?: { full_name?: string } | null };
        base?: { repo?: { full_name?: string } | null };
      };
      const branch = pull.head?.ref;
      const headRepo = pull.head?.repo?.full_name?.toLowerCase();
      const baseRepo = (pull.base?.repo?.full_name ?? link.repo).toLowerCase();
      if (!branch) throw new Error("PR has no head branch");
      if (headRepo !== baseRepo) {
        return { branchDeleted: false, note: "head branch is on a fork — not deleted" };
      }
      const del = await this.fetchImpl(
        `${GITHUB_API}/repos/${link.repo}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
        { method: "DELETE", headers },
      );
      // 422 = the ref is already gone (e.g. the repo auto-deletes head branches).
      if (!del.ok && del.status !== 422) throw new Error(`HTTP ${del.status} deleting ${branch}`);
      return { branchDeleted: true };
    } catch (error) {
      return {
        branchDeleted: false,
        note: `merged, but the branch was not deleted: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Record a completed merge: the `merge-completed` activity entry plus the
   * roadmap gate's eager release signal.
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
  }
}

/** GitHub's error `message`, or undefined when the body is not JSON. */
async function ghMessage(res: Response): Promise<string | undefined> {
  return res
    .json()
    .then((b: { message?: string }) => b.message)
    .catch(() => undefined);
}
