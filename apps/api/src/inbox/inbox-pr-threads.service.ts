import { Injectable, Optional } from "@nestjs/common";
import type {
  InboxPrReviewers,
  InboxPrThread,
  ReplyInboxPrThreadInput,
  SubmitInboxPrReviewInput,
  SubmitInboxPrReviewResult,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { resolveGithubToken } from "../projects/project-pr.service";
import { NoGithubLinkError } from "../projects/projects.errors";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { githubReason } from "./inbox-review.service";
import { InboxService } from "./inbox.service";
import { type BuildReviewersInput, buildReviewers } from "./pr-reviewers";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_TIMEOUT_MS = 15_000;

// ponytail: first 100 threads x first 30 comments per PR; a bigger PR shows a truncated list.
// upgrade = cursor pagination on reviewThreads / comments.
const THREADS_QUERY =
  "query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved isOutdated path line startLine comments(first:30){nodes{id url author{login avatarUrl} createdAt body diffHunk}}}}}}}";
const REPLY_MUTATION =
  "mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}";
const RESOLVE_MUTATION = "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id}}}";
// ponytail: first 100 files / newest 100 reviews / 50 requests, CODEOWNERS only in its 3 standard spots.
const CODEOWNERS_FILE = (alias: string, path: string) =>
  `${alias}:file(path:"${path}"){object{... on Blob{text}}}`;
const REVIEWERS_QUERY = `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){author{login} files(first:100){nodes{path}} reviewRequests(first:50){nodes{requestedReviewer{__typename ... on User{login} ... on Team{slug name}}}} reviews(last:100){nodes{author{login} state comments{totalCount} onBehalfOf(first:10){nodes{slug name}}}} baseRef{target{... on Commit{${CODEOWNERS_FILE("gh", ".github/CODEOWNERS")} ${CODEOWNERS_FILE("root", "CODEOWNERS")} ${CODEOWNERS_FILE("docs", "docs/CODEOWNERS")}}}}}}}`;
// ponytail: first 50 teams x 100 members; needs read:org — on failure nesting falls back to onBehalfOf.
const ORG_TEAMS_QUERY =
  "query($org:String!,$logins:[String!]!){organization(login:$org){teams(first:50,userLogins:$logins){nodes{slug name members(first:100){nodes{login}}}}}}";

interface ReviewersNode {
  author: { login: string } | null;
  files: { nodes: { path: string }[] } | null;
  reviewRequests: {
    nodes: {
      requestedReviewer:
        | { __typename: "User"; login: string }
        | { __typename: "Team"; slug: string; name: string }
        | { __typename: "Bot" | "Mannequin" }
        | null;
    }[];
  };
  reviews: {
    nodes: {
      author: { login: string } | null;
      state: BuildReviewersInput["reviews"][number]["state"];
      comments: { totalCount: number };
      /** `null` when the token lacks read:org (partial data). */
      onBehalfOf: { nodes: { slug: string; name: string }[] } | null;
    }[];
  };
  baseRef: {
    target: Partial<Record<"gh" | "root" | "docs", { object: { text: string } | null } | null>>;
  } | null;
}

/** GitHub answered a GraphQL call with an HTTP/GraphQL error; `status` is the upstream HTTP one (200 for GraphQL errors). */
export class GithubThreadsError extends Error {
  constructor(
    public readonly status: number,
    detail: string,
    what = "review threads",
  ) {
    super(`GitHub ${what} failed: ${detail}`);
    this.name = "GithubThreadsError";
  }
}

/** The thread id is not a review thread of this PR. */
export class ThreadNotOnPrError extends Error {
  constructor(threadId: string, repo: string, number: number) {
    super(`thread ${threadId} is not on ${repo}#${number}`);
    this.name = "ThreadNotOnPrError";
  }
}

interface ThreadNode {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  startLine: number | null;
  comments: {
    nodes: {
      id: string;
      url?: string;
      author: { login: string; avatarUrl: string } | null;
      createdAt: string;
      body: string;
      diffHunk: string;
    }[];
  };
}

/** Reads a PR's review threads and replies to / resolves them (operator click, behind OperatorTokenGuard). */
@Injectable()
export class InboxPrThreadsService {
  private readonly fetchImpl: typeof fetch;
  private readonly log?: ScopedLogger;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly inbox: InboxService,
    @Optional() logger?: LoggerService,
    @Optional() private readonly activity?: ActivityLogService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.log = logger?.child(InboxPrThreadsService.name);
  }

  async list(projectId: string, number: number): Promise<InboxPrThread[]> {
    const { gql, repo } = await this.open(projectId);
    return this.read(gql, repo, number);
  }

  async reply(
    projectId: string,
    number: number,
    threadId: string,
    input: ReplyInboxPrThreadInput,
  ): Promise<InboxPrThread> {
    const { gql, repo } = await this.open(projectId);
    const before = await this.read(gql, repo, number);
    if (!before.some((t) => t.id === threadId))
      throw new ThreadNotOnPrError(threadId, repo, number);
    // Resolve first (idempotent): if it fails nothing was posted, so a retry cannot duplicate the reply.
    // ponytail: a failure in the final re-read still 502s although the reply is live; activity is recorded right after it.
    if (input.resolve) await gql(RESOLVE_MUTATION, { id: threadId });
    if (input.body) await gql(REPLY_MUTATION, { id: threadId, body: input.body });
    // Resolving changes the PR's open-thread count — don't serve the stale 30 s cache.
    this.inbox.dropPrsCache();
    void this.activity?.record({
      kind: "channel-reply", // closest existing kind for an operator GitHub reply
      summary: `replied on ${repo}#${number}`,
      refs: { projectId, itemId: threadId },
    });
    this.log?.info(`replied on ${repo}#${number}`, {
      threadId,
      replied: Boolean(input.body),
      resolved: Boolean(input.resolve),
    });
    const after = (await this.read(gql, repo, number)).find((t) => t.id === threadId);
    if (!after) throw new ThreadNotOnPrError(threadId, repo, number);
    return after;
  }

  /** Posts the operator's own review (approve / request changes / comment) on one PR. */
  async submitReview(
    projectId: string,
    number: number,
    input: SubmitInboxPrReviewInput,
  ): Promise<SubmitInboxPrReviewResult> {
    const { repo, token } = await this.open(projectId);
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${repo}/pulls/${number}/reviews`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: input.event, ...(input.body ? { body: input.body } : {}) }),
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      throw new GithubThreadsError(
        res.status,
        `HTTP ${res.status}${await githubReason(res)}`,
        "review",
      );
    }
    const { id } = (await res.json()) as { id: number };
    void this.activity?.record({
      kind: "channel-reply",
      summary: `reviewed ${repo}#${number} (${input.event})`,
      refs: { projectId },
    });
    this.log?.info(`reviewed ${repo}#${number}`, { event: input.event });
    // The review changes the PR's section — don't serve the stale 30 s cache.
    this.inbox.dropPrsCache();
    return { id };
  }

  /** The PR's reviewers tree (teams with CODEOWNER flag + their reviewing members, then people). */
  async reviewers(projectId: string, number: number): Promise<InboxPrReviewers> {
    const { gql, repo } = await this.open(projectId);
    return this.readReviewers(gql, repo, number);
  }

  /** Re-requests one person's review (operator click) and returns the updated tree. */
  async requestReview(projectId: string, number: number, login: string): Promise<InboxPrReviewers> {
    const { gql, repo, token } = await this.open(projectId);
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${repo}/pulls/${number}/requested_reviewers`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reviewers: [login] }),
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      throw new GithubThreadsError(
        res.status,
        `HTTP ${res.status}${await githubReason(res)}`,
        "review request",
      );
    }
    void this.activity?.record({
      kind: "channel-reply", // closest existing kind for an operator GitHub action
      summary: `re-requested review from ${login} on ${repo}#${number}`,
      refs: { projectId },
    });
    this.log?.info(`re-requested review on ${repo}#${number}`, { login });
    this.inbox.dropPrsCache();
    try {
      return await this.readReviewers(gql, repo, number);
    } catch (error) {
      // The request is live — don't 502 it; show the person as pending until the next read.
      this.log?.warn(`reviewers re-read failed on ${repo}#${number}`, { error: String(error) });
      return { teams: [], users: [{ login, state: "pending", commented: false }] };
    }
  }

  private async readReviewers(gql: Gql, repo: string, number: number): Promise<InboxPrReviewers> {
    const [owner = "", name] = repo.split("/");
    // Team fields need read:org — without it GitHub nulls them and adds scope errors; keep the rest.
    const data = await gql<{ repository: { pullRequest: ReviewersNode | null } | null }>(
      REVIEWERS_QUERY,
      { owner, name, n: number },
      { partial: true },
    );
    const pr = data.repository?.pullRequest;
    if (!pr) return { teams: [], users: [] };
    const requestedUsers: string[] = [];
    const requestedTeams: { slug: string; name: string }[] = [];
    for (const { requestedReviewer: r } of pr.reviewRequests.nodes) {
      if (r?.__typename === "User") requestedUsers.push(r.login);
      else if (r?.__typename === "Team") requestedTeams.push({ slug: r.slug, name: r.name });
    }
    const reviews = pr.reviews.nodes.flatMap((r) =>
      r.author
        ? [
            {
              author: r.author.login,
              state: r.state,
              comments: r.comments.totalCount,
              onBehalfOf: r.onBehalfOf?.nodes ?? [],
            },
          ]
        : [],
    );
    const target = pr.baseRef?.target;
    const codeowners =
      target?.gh?.object?.text ?? target?.root?.object?.text ?? target?.docs?.object?.text ?? null;
    const logins = [...new Set([...requestedUsers, ...reviews.map((r) => r.author)])];
    const teamMembers: Record<string, string[]> = {};
    const teamNames: Record<string, string> = {};
    if (logins.length)
      try {
        const org = await gql<{
          organization: {
            teams: {
              nodes: { slug: string; name: string; members: { nodes: { login: string }[] } }[];
            };
          } | null;
        }>(ORG_TEAMS_QUERY, { org: owner, logins });
        for (const t of org.organization?.teams.nodes ?? []) {
          teamMembers[t.slug] = t.members.nodes.map((m) => m.login);
          teamNames[t.slug] = t.name;
        }
      } catch (error) {
        // No read:org scope or a user-owned repo — nest by onBehalfOf only.
        this.log?.debug(`org teams unavailable for ${owner}`, { error: String(error) });
      }
    return buildReviewers({
      org: owner,
      author: pr.author?.login ?? "",
      requestedUsers,
      requestedTeams,
      reviews,
      teamMembers,
      teamNames,
      codeowners,
      files: (pr.files?.nodes ?? []).map((f) => f.path),
    });
  }

  private async read(gql: Gql, repo: string, number: number): Promise<InboxPrThread[]> {
    const [owner, name] = repo.split("/");
    const data = await gql<{
      repository: { pullRequest: { reviewThreads: { nodes: ThreadNode[] } } | null } | null;
    }>(THREADS_QUERY, { owner, name, n: number });
    const nodes = data.repository?.pullRequest?.reviewThreads.nodes ?? [];
    return nodes.map((t) => ({
      id: t.id,
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      path: t.path,
      line: t.line,
      startLine: t.startLine,
      diffHunk: t.comments.nodes[0]?.diffHunk ?? "",
      ...(t.comments.nodes[0]?.url ? { url: t.comments.nodes[0].url } : {}),
      comments: t.comments.nodes.map(({ id, author, createdAt, body }) => ({
        id,
        author,
        createdAt,
        body,
      })),
    }));
  }

  private async open(projectId: string): Promise<{ gql: Gql; repo: string; token: string }> {
    const project = await this.projects.get(projectId); // ProjectNotFoundError → 404
    const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
    if (!link) throw new NoGithubLinkError(project.id);
    const gql: Gql = async <T>(
      query: string,
      variables: Record<string, unknown>,
      opts?: { partial?: boolean },
    ) => {
      const res = await this.fetchImpl(GITHUB_GRAPHQL, {
        method: "POST",
        headers: { authorization: `Bearer ${link.token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new GithubThreadsError(res.status, `HTTP ${res.status}${await githubReason(res)}`);
      }
      const json = (await res.json()) as {
        data?: T;
        errors?: { message?: string; type?: string }[];
      };
      const scopeOnly = json.errors?.every((e) => e.type && PARTIAL_OK.has(e.type)) ?? true;
      if (json.data && opts?.partial && scopeOnly) return json.data;
      if (json.errors?.length || !json.data) {
        throw new GithubThreadsError(res.status, json.errors?.[0]?.message ?? "no data");
      }
      return json.data;
    };
    return { gql, repo: link.repo, token: link.token };
  }
}

type Gql = <T>(
  query: string,
  variables: Record<string, unknown>,
  /** `partial`: return `data` when the only errors are missing-scope ones (fields come back null). */
  opts?: { partial?: boolean },
) => Promise<T>;

const PARTIAL_OK = new Set(["INSUFFICIENT_SCOPES", "FORBIDDEN"]);
