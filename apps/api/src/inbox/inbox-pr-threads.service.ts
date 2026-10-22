import { Injectable, Optional } from "@nestjs/common";
import type { InboxPrThread, ReplyInboxPrThreadInput } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { resolveGithubToken } from "../projects/project-pr.service";
import { NoGithubLinkError } from "../projects/projects.errors";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { githubReason } from "./inbox-review.service";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_TIMEOUT_MS = 15_000;

// ponytail: first 100 threads x first 30 comments per PR; a bigger PR shows a truncated list.
// upgrade = cursor pagination on reviewThreads / comments.
const THREADS_QUERY =
  "query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved isOutdated path line startLine comments(first:30){nodes{id author{login avatarUrl} createdAt body diffHunk}}}}}}}";
const REPLY_MUTATION =
  "mutation($id:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}}";
const RESOLVE_MUTATION = "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id}}}";

/** GitHub answered a GraphQL call with an HTTP/GraphQL error; `status` is the upstream HTTP one (200 for GraphQL errors). */
export class GithubThreadsError extends Error {
  constructor(
    public readonly status: number,
    detail: string,
  ) {
    super(`GitHub review threads failed: ${detail}`);
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
      comments: t.comments.nodes.map(({ id, author, createdAt, body }) => ({
        id,
        author,
        createdAt,
        body,
      })),
    }));
  }

  private async open(projectId: string): Promise<{ gql: Gql; repo: string }> {
    const project = await this.projects.get(projectId); // ProjectNotFoundError → 404
    const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
    if (!link) throw new NoGithubLinkError(project.id);
    const gql: Gql = async <T>(query: string, variables: Record<string, unknown>) => {
      const res = await this.fetchImpl(GITHUB_GRAPHQL, {
        method: "POST",
        headers: { authorization: `Bearer ${link.token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new GithubThreadsError(res.status, `HTTP ${res.status}${await githubReason(res)}`);
      }
      const json = (await res.json()) as { data?: T; errors?: { message?: string }[] };
      if (json.errors?.length || !json.data) {
        throw new GithubThreadsError(res.status, json.errors?.[0]?.message ?? "no data");
      }
      return json.data;
    };
    return { gql, repo: link.repo };
  }
}

type Gql = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;
