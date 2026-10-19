import { Injectable, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import type { Subscription } from "rxjs";
import { INBOX_REFRESH_ACTIVITY_KINDS } from "@zibby/contracts";
import type {
  InboxEpic,
  InboxItemsResponse,
  InboxPr,
  InboxPrBlocker,
  InboxPrCi,
  InboxPrReview,
  InboxPrSection,
  InboxPrsResponse,
  InboxRoadmapItem,
  InboxSourceError,
  InboxState,
  Project,
  RoadmapItem,
  SetInboxHidden,
} from "@zibby/contracts";
import { ActivityEventsService } from "../activity/activity-events.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { ProjectPrService, resolveGithubToken } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { RoadmapSourceService } from "../roadmap/roadmap-source.service";
import { RoadmapStore } from "../roadmap/roadmap.store";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { InboxStateStore } from "./inbox-state.store";

const GITHUB_API = "https://api.github.com";
// ponytail: whole-result in-memory cache, 30 s ceiling (web polls every 15 min + refetches
// on inbox-refresh activity). Every refresh costs 2 + teams Search calls per repo against GitHub's
// ~30/min Search limit — batch the legs with OR if an operator has many repos/teams.
const PRS_TTL_MS = 30_000;

interface GhReview {
  user?: { login?: string } | null;
  state?: string;
}
interface GhCheckRun {
  status?: string;
  conclusion?: string | null;
}
interface GhPull {
  number?: number;
  title?: string;
  html_url?: string;
  draft?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  created_at?: string;
  user?: { login?: string } | null;
  head?: { sha?: string };
}

/** Latest non-COMMENTED review per reviewer: any CHANGES_REQUESTED wins, then any APPROVED. */
export function reviewState(reviews: readonly GhReview[]): InboxPrReview {
  const latest = new Map<string, string>();
  for (const review of reviews) {
    if (!review.state || review.state === "COMMENTED" || review.state === "PENDING") continue;
    latest.set(review.user?.login ?? "", review.state);
  }
  const states = [...latest.values()];
  if (states.includes("CHANGES_REQUESTED")) return "changes-requested";
  return states.includes("APPROVED") ? "approved" : "none";
}

/** CI from check-runs only (no combined commit status). */
export function ciState(runs: readonly GhCheckRun[]): InboxPrCi {
  if (runs.some((r) => ["failure", "cancelled", "timed_out"].includes(r.conclusion ?? ""))) {
    return "failing";
  }
  if (runs.some((r) => r.status !== "completed")) return "pending";
  const ok = runs.every((r) => ["success", "neutral", "skipped"].includes(r.conclusion ?? ""));
  return runs.length > 0 && ok ? "passing" : "unknown";
}

export function blockerOf(pr: {
  ci: InboxPrCi;
  review: InboxPrReview;
  mergeable: boolean | null;
}): InboxPrBlocker {
  if (pr.ci === "failing") return "ci-failing";
  if (pr.review === "changes-requested") return "changes-requested";
  if (pr.mergeable === false) return "merge-conflict";
  if (pr.review === "approved" && pr.ci === "passing") return "ready-to-merge";
  return "awaiting-review";
}

/** Phase 129 P1 — the GitHub-style section (see `INBOX_PR_SECTIONS`). */
export function sectionOf(pr: {
  bucket: InboxPr["bucket"];
  reviewReason?: InboxPr["reviewReason"];
  ci: InboxPrCi;
  review: InboxPrReview;
  mergeable: boolean | null;
  draft: boolean;
}): InboxPrSection {
  if (pr.bucket === "to-review") {
    return pr.reviewReason === "team" ? "needs-team-review" : "needs-your-review";
  }
  if (
    pr.draft ||
    pr.ci === "failing" ||
    pr.review === "changes-requested" ||
    pr.mergeable === false
  ) {
    return "needs-action";
  }
  // `unknown` = no check-runs (a repo without CI) or unreadable checks; GitHub's own
  // branch protection still gates the merge, so only a running CI keeps it waiting.
  return pr.review === "approved" && pr.ci !== "pending" ? "ready-to-merge" : "waiting";
}

const hiddenKey = (integrationId: string, externalId: string) =>
  `${integrationId}\u0000${externalId}`;

/** Walk `parentId` up to the nearest epic (depth-capped against a cycle). */
function nearestEpic(
  item: RoadmapItem,
  byId: ReadonlyMap<string, RoadmapItem>,
): RoadmapItem | undefined {
  let current = item.parentId ? byId.get(item.parentId) : undefined;
  for (let depth = 0; current && depth < 25; depth += 1) {
    if (current.level === "epic") return current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

/** `companyId`/`teamId` of a project, omitted when unset. */
function orgOf(project: Project): { companyId?: string; teamId?: string } {
  return {
    ...(project.companyId ? { companyId: project.companyId } : {}),
    ...(project.teamId ? { teamId: project.teamId } : {}),
  };
}

/**
 * The Inbox (docs/api/inbox.md): a read-only view over the synced roadmap cache
 * narrowed to the operator's scope, plus the operator's GitHub PRs. Never writes
 * to Jira/GitHub. `fetchImpl` is injectable like `ProjectPrService`'s.
 */
@Injectable()
export class InboxService implements OnModuleInit, OnModuleDestroy {
  private readonly fetchImpl: typeof fetch;
  private activitySub?: Subscription;
  private prsCache: { at: number; value: Promise<InboxPrsResponse> } | null = null;

  constructor(
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly credentials: CredentialsStore,
    private readonly roadmap: RoadmapStore,
    private readonly roadmapSource: RoadmapSourceService,
    private readonly state: InboxStateStore,
    private readonly tasks: ScheduledTasksStorageService,
    private readonly projectPrs: ProjectPrService,
    private readonly activityEvents: ActivityEventsService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  onModuleInit(): void {
    // Phase 129 P3 — a merge (from any surface) drops the 30 s PR cache so the
    // merged PR leaves the list on the very next read instead of lingering.
    this.projectPrs.onMerged(() => this.dropPrsCache());
    // A ZIBBY action that changes PRs (task opened one, roadmap dispatch…) drops the
    // cache too, so the web's event-driven refetch reaches GitHub, not a stale copy.
    this.activitySub = this.activityEvents.stream().subscribe(({ kind }) => {
      if (INBOX_REFRESH_ACTIVITY_KINDS.includes(kind)) this.dropPrsCache();
    });
  }

  onModuleDestroy(): void {
    this.activitySub?.unsubscribe();
  }

  /** Drop the 30 s PR cache so the next read reaches GitHub. */
  dropPrsCache(): void {
    this.prsCache = null;
  }

  getState(): Promise<InboxState> {
    return this.state.read();
  }

  setHidden(body: SetInboxHidden): Promise<InboxState> {
    return this.state.setHidden(body);
  }

  async listItems(): Promise<InboxItemsResponse> {
    const [projects, state] = await Promise.all([this.projects.list(), this.state.read()]);
    const hidden = new Set(state.hidden.map((k) => hiddenKey(k.integrationId, k.externalId)));
    const items: InboxRoadmapItem[] = [];
    const epics = new Map<string, InboxEpic>();
    const syncProjectIds: string[] = [];
    let syncedAt: string | undefined;

    for (const project of projects) {
      const integrations = await this.resolvedProjects.resolveIntegrations(project);
      const all = await this.roadmap.list(project.id);
      if (integrations.some((i) => i.config.kind === "jira" || i.config.kind === "github")) {
        syncProjectIds.push(project.id);
        const last = all.reduce<string | undefined>(
          (max, i) => (i.syncedAt && (!max || i.syncedAt > max) ? i.syncedAt : max),
          undefined,
        );
        if (last && (!syncedAt || last < syncedAt)) syncedAt = last;
      }

      const byId = new Map(all.map((i) => [i.id, i]));
      for (const item of all) {
        const { source } = item;
        if (item.level !== "task" || item.lifecycle === "archived") continue;
        if (source.kind === "manual" || !item.scopeReasons?.length) continue;
        const epic = nearestEpic(item, byId);
        items.push({
          ...item,
          parentId: epic?.id, // deeper chains flattened to the nearest epic
          project: { id: project.id, name: project.name },
          ...orgOf(project),
          hidden: hidden.has(hiddenKey(source.integrationId ?? "", source.externalId ?? "")),
        });
        if (!epic || epics.has(`${project.id}/${epic.id}`)) continue;
        // Same rule as the web's `epicProgress`: every non-archived child task.
        const children = all.filter(
          (c) => c.level === "task" && c.parentId === epic.id && c.lifecycle !== "archived",
        );
        epics.set(`${project.id}/${epic.id}`, {
          id: epic.id,
          projectId: project.id,
          ...(epic.source.externalKey ? { key: epic.source.externalKey } : {}),
          title: epic.name,
          source: epic.source.kind,
          ...(epic.source.url ? { url: epic.source.url } : {}),
          done: children.filter((c) => c.lifecycle === "done").length,
          total: children.length,
        });
      }
    }

    return {
      items,
      epics: [...epics.values()],
      syncProjectIds,
      ...(syncedAt ? { syncedAt } : {}),
      errors: this.roadmapSource.lastFailures().filter((e) => syncProjectIds.includes(e.projectId)),
    };
  }

  /** Cached GitHub classification + the (uncached, local) review/rebase task state per PR. */
  async listPrs(): Promise<InboxPrsResponse> {
    const [result, { reviews, rebases }] = await Promise.all([
      this.cachedPrs(),
      this.prTaskStates(),
    ]);
    return {
      ...result,
      prs: result.prs.map((pr) => {
        const key = `${pr.repo.toLowerCase()}#${pr.number}`;
        const codeReview = reviews.get(key);
        const rebase = rebases.get(key);
        return { ...pr, ...(codeReview ? { codeReview } : {}), ...(rebase ? { rebase } : {}) };
      }),
    };
  }

  private cachedPrs(): Promise<InboxPrsResponse> {
    if (this.prsCache && Date.now() - this.prsCache.at < PRS_TTL_MS) return this.prsCache.value;
    const value = this.fetchPrs();
    this.prsCache = { at: Date.now(), value };
    value.catch(() => (this.prsCache = null));
    return value;
  }

  /**
   * Latest review task (Phase 129 P2, any level) and latest rebase task (todo-11) per
   * `repo#number`. A `running` one whose task failed or whose run errored reads `failed`.
   */
  private async prTaskStates(): Promise<{
    reviews: Map<string, NonNullable<InboxPr["codeReview"]>>;
    rebases: Map<string, NonNullable<InboxPr["rebase"]>>;
  }> {
    const tasks = await this.tasks.list().catch(() => []);
    const reviews = new Map<string, NonNullable<InboxPr["codeReview"]>>();
    const rebases = new Map<string, NonNullable<InboxPr["rebase"]>>();
    for (const task of [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const dead =
        task.status === "failed" ||
        task.status === "cancelled" ||
        task.status === "dead-letter" ||
        task.outcome?.status === "error";
      const { prReview: review, prRebase: rebase } = task;
      if (review) {
        reviews.set(`${review.repo.toLowerCase()}#${review.number}`, {
          taskId: task.id,
          state: review.state === "running" && dead ? "failed" : review.state,
        });
      }
      if (rebase) {
        rebases.set(`${rebase.repo.toLowerCase()}#${rebase.number}`, {
          taskId: task.id,
          state: rebase.state === "running" && dead ? "failed" : rebase.state,
        });
      }
    }
    return { reviews, rebases };
  }

  private async fetchPrs(): Promise<InboxPrsResponse> {
    const repos = new Map<string, { project: Project; token: string }>();
    for (const project of await this.projects.list()) {
      const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
      if (link && !repos.has(link.repo)) repos.set(link.repo, { project, token: link.token });
    }

    const teamsByToken = new Map<string, Promise<{ teams: string[]; note?: string }>>();
    const prs: InboxPr[] = [];
    const errors: InboxSourceError[] = [];
    for (const [repo, { project, token }] of repos) {
      try {
        let teams = teamsByToken.get(token);
        if (!teams) teamsByToken.set(token, (teams = this.userTeams(token)));
        const { teams: all, note } = await teams;
        if (note && !errors.some((e) => e.message === note)) {
          errors.push({ projectId: project.id, source: "github", message: note });
        }
        const owner = repo.split("/")[0]?.toLowerCase() ?? "";
        prs.push(
          ...(await this.repoPrs(
            repo,
            project,
            token,
            all.filter((t) => t.toLowerCase().startsWith(`${owner}/`)),
          )),
        );
      } catch (error) {
        errors.push({
          projectId: project.id,
          source: "github",
          message: `${repo}: ${(error as Error).message || "unknown error"}`,
        });
      }
    }
    return { prs, errors };
  }

  /**
   * Classify one repo's PRs into buckets. GitHub drops a review request once the
   * user submits a review and re-adds it on a re-request, so "disappears after I
   * review, returns on re-request" falls out of the search qualifiers for free.
   */
  private async repoPrs(
    repo: string,
    project: Project,
    token: string,
    teams: string[],
  ): Promise<InboxPr[]> {
    const base = `is:pr is:open repo:${repo}`;
    const mine = await this.search(token, `${base} author:@me`);
    const direct = await this.search(token, `${base} user-review-requested:@me`);
    const buckets = new Map<number, Pick<InboxPr, "bucket" | "reviewReason" | "reviewTeam">>();
    for (const team of teams) {
      for (const n of await this.search(token, `${base} team-review-requested:${team}`)) {
        if (!buckets.has(n))
          buckets.set(n, { bucket: "to-review", reviewReason: "team", reviewTeam: team });
      }
    }
    for (const n of direct) buckets.set(n, { bucket: "to-review", reviewReason: "direct" }); // direct wins
    for (const n of mine) buckets.set(n, { bucket: "mine" }); // mine is never "to review"

    // One PR closed between search and fetch, or a token without Checks:read, must
    // not drop the whole repo: a failed pull fetch skips that PR, failed
    // reviews/check-runs degrade to "none"/"unknown".
    const settled = await Promise.allSettled(
      [...buckets].map(async ([number, bucket]) => {
        const pull = await this.gh<GhPull>(token, `/repos/${repo}/pulls/${number}`);
        const [reviews, checks] = await Promise.all([
          this.gh<GhReview[]>(token, `/repos/${repo}/pulls/${number}/reviews?per_page=100`).catch(
            () => [],
          ),
          pull.head?.sha
            ? this.gh<{ check_runs?: GhCheckRun[] }>(
                token,
                `/repos/${repo}/commits/${pull.head.sha}/check-runs?per_page=100`,
              ).catch(() => null)
            : Promise.resolve({ check_runs: [] }),
        ]);
        const ci = checks ? ciState(checks.check_runs ?? []) : ("unknown" as const);
        const review = reviewState(Array.isArray(reviews) ? reviews : []);
        const mergeable = pull.mergeable ?? null;
        return {
          source: "github" as const,
          number,
          title: pull.title ?? "",
          url: pull.html_url ?? `https://github.com/${repo}/pull/${number}`,
          repo,
          author: pull.user?.login ?? "",
          createdAt: new Date(pull.created_at ?? Date.now()).toISOString(),
          draft: pull.draft === true,
          ci,
          review,
          mergeable,
          ...(pull.mergeable_state === "behind" ? { behind: true } : {}),
          ...bucket,
          blocker: blockerOf({ ci, review, mergeable }),
          section: sectionOf({ ...bucket, ci, review, mergeable, draft: pull.draft === true }),
          projectId: project.id,
          ...orgOf(project),
        };
      }),
    );
    return settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  }

  /** `org/slug` of every team the token's user belongs to; 401/403/404 → none + a note (token lacks read:org). */
  private async userTeams(token: string): Promise<{ teams: string[]; note?: string }> {
    // Any other failure also degrades to "no teams": mine/direct PRs don't need them.
    return this.fetchUserTeams(token).catch((error: Error) => ({
      teams: [],
      note: `github team scope unavailable (${error.message || "unknown error"})`,
    }));
  }

  private async fetchUserTeams(token: string): Promise<{ teams: string[]; note?: string }> {
    const res = await this.fetchImpl(`${GITHUB_API}/user/teams?per_page=100`, {
      headers: this.headers(token),
    });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return {
        teams: [],
        note: `github team scope unavailable (HTTP ${res.status}; token needs read:org)`,
      };
    }
    if (!res.ok) throw new Error(`github /user/teams: HTTP ${res.status}`);
    const body = (await res.json()) as { slug?: string; organization?: { login?: string } }[];
    return {
      teams: body.flatMap((t) =>
        t.slug && t.organization?.login ? [`${t.organization.login}/${t.slug}`] : [],
      ),
    };
  }

  private async search(token: string, q: string): Promise<number[]> {
    const body = await this.gh<{ items?: { number?: number }[] }>(
      token,
      `/search/issues?${new URLSearchParams({ q, per_page: "100" })}`,
    );
    return (body.items ?? []).flatMap((i) => (i.number ? [i.number] : []));
  }

  private async gh<T>(token: string, path: string): Promise<T> {
    const res = await this.fetchImpl(`${GITHUB_API}${path}`, { headers: this.headers(token) });
    if (!res.ok) throw new Error(`github ${path.split("?")[0]}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private headers(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  }
}
