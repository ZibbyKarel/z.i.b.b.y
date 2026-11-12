import { Injectable, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import type { Subscription } from "rxjs";
import { INBOX_REFRESH_ACTIVITY_KINDS, qualifyTeamSlug } from "@zibby/contracts";
import type {
  InboxItemsResponse,
  InboxPr,
  InboxPrBlocker,
  InboxPrCi,
  InboxPrReview,
  InboxPrRun,
  InboxPrSection,
  InboxPrsResponse,
  InboxSourceError,
  InboxState,
  Project,
  RoadmapItem,
  RoadmapTaskOverride,
  ScheduledTask,
  SetInboxHidden,
} from "@zibby/contracts";
import { ActivityEventsService } from "../activity/activity-events.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { isIgnoredCheck } from "./ci-checks";
import { ProjectPrService, resolveGithubToken } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { TeamsStorageService } from "../teams/teams.storage.service";
import { InboxIssuesService, InboxItemNotFoundError } from "./inbox-issues.service";
import { InboxStateStore } from "./inbox-state.store";

const GITHUB_API = "https://api.github.com";
// ponytail: whole-result in-memory cache, 30 s ceiling (web polls every 15 min + refetches
// on inbox-refresh activity). Every refresh costs 2 + teams Search calls per repo against GitHub's
// ~30/min Search limit — batch the legs with OR if an operator has many repos/teams.
const PRS_TTL_MS = 30_000;

interface GhReview {
  user?: { login?: string } | null;
  state?: string;
  commit_id?: string;
}
interface GhCheckRun {
  name?: string;
  status?: string;
  conclusion?: string | null;
  completed_at?: string | null;
}
interface GhPull {
  number?: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  draft?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  created_at?: string;
  updated_at?: string;
  user?: { login?: string; avatar_url?: string } | null;
  head?: { sha?: string; ref?: string; repo?: { full_name?: string } | null };
  base?: { ref?: string };
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

/** The operator's own latest APPROVED/CHANGES_REQUESTED review (DISMISSED/PENDING ignored), else "commented". */
export function myReviewState(
  reviews: readonly GhReview[],
  login: string | undefined,
): "approved" | "changes-requested" | "commented" {
  return myVerdict(reviews, login)?.state ?? "commented";
}

/** The operator's own latest APPROVED/CHANGES_REQUESTED review and the commit it was given on. */
export function myVerdict(
  reviews: readonly GhReview[],
  login: string | undefined,
): { state: "approved" | "changes-requested"; sha?: string } | undefined {
  const verdict = login
    ? reviews
        .filter((r) => r.user?.login === login)
        .filter((r) => r.state === "APPROVED" || r.state === "CHANGES_REQUESTED")
        .at(-1)
    : undefined;
  if (!verdict) return undefined;
  return {
    state: verdict.state === "APPROVED" ? "approved" : "changes-requested",
    ...(verdict.commit_id && /^[0-9a-f]{40}$/.test(verdict.commit_id)
      ? { sha: verdict.commit_id }
      : {}),
  };
}

const FAILED_CONCLUSIONS = ["failure", "cancelled", "timed_out"];

/** The check-runs that count: those not matched by the project's `ciIgnoredChecks`. */
function countedRuns(runs: readonly GhCheckRun[], ignored?: readonly string[]): GhCheckRun[] {
  return runs.filter((r) => !(r.name && isIgnoredCheck(r.name, ignored)));
}

/** CI from check-runs only (no combined commit status); ignored checks are left out (all ignored → `unknown`). */
export function ciState(runs: readonly GhCheckRun[], ignored?: readonly string[]): InboxPrCi {
  const counted = countedRuns(runs, ignored);
  if (counted.some((r) => FAILED_CONCLUSIONS.includes(r.conclusion ?? ""))) return "failing";
  if (counted.some((r) => r.status !== "completed")) return "pending";
  const ok = counted.every((r) => ["success", "neutral", "skipped"].includes(r.conclusion ?? ""));
  return counted.length > 0 && ok ? "passing" : "unknown";
}

/** `ciSettled` / `ciFailingChecks` / `ciCompletedAt` over the non-ignored check-runs. */
export function ciDetails(
  runs: readonly GhCheckRun[],
  ignored?: readonly string[],
): Pick<InboxPr, "ciSettled" | "ciFailingChecks" | "ciCompletedAt"> {
  const counted = countedRuns(runs, ignored);
  const failing = [
    ...new Set(
      counted
        .filter((r) => FAILED_CONCLUSIONS.includes(r.conclusion ?? ""))
        .map((r) => r.name ?? ""),
    ),
  ]
    .filter(Boolean)
    .sort();
  const completed = counted
    .map((r) => (r.completed_at ? Date.parse(r.completed_at) : NaN))
    .filter((t) => Number.isFinite(t));
  return {
    ciSettled: counted.length > 0 && counted.every((r) => r.status === "completed"),
    ciFailingChecks: failing,
    ...(completed.length > 0
      ? { ciCompletedAt: new Date(Math.max(...completed)).toISOString() }
      : {}),
  };
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
  if (pr.bucket === "reviewed") return "reviewed-by-you";
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

/** `companyId`/`teamId` of a project, omitted when unset. */
function orgOf(project: Project): { companyId?: string; teamId?: string } {
  return {
    ...(project.companyId ? { companyId: project.companyId } : {}),
    ...(project.teamId ? { teamId: project.teamId } : {}),
  };
}

/**
 * The Inbox (docs/api/inbox.md): the operator's live assigned issues (`InboxIssuesService`)
 * plus the operator's GitHub PRs. Never writes to Jira/GitHub. `fetchImpl` is injectable like `ProjectPrService`'s.
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
    private readonly issues: InboxIssuesService,
    private readonly state: InboxStateStore,
    private readonly tasks: ScheduledTasksStorageService,
    private readonly projectPrs: ProjectPrService,
    private readonly activityEvents: ActivityEventsService,
    private readonly teamsStorage: TeamsStorageService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  onModuleInit(): void {
    // Phase 129 P3 — a merge (from any surface) drops the 30 s PR cache so the
    // merged PR leaves the list on the very next read instead of lingering.
    this.projectPrs.onPrChanged(() => this.dropPrsCache());
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
    this.issues.dropCache(); // the issue list carries ZIBBY's overlay and linked PRs
  }

  getState(): Promise<InboxState> {
    return this.state.read();
  }

  setHidden(body: SetInboxHidden): Promise<InboxState> {
    return this.state.setHidden(body);
  }

  listItems(refresh = false): Promise<InboxItemsResponse> {
    return this.issues.list(refresh, () => this.cachedPrs(refresh));
  }

  /** Hand one live issue to ZIBBY: local record if missing, then the roadmap gate's play. */
  async processItem(
    projectId: string,
    itemId: string,
    override?: RoadmapTaskOverride,
  ): Promise<RoadmapItem> {
    const { items } = await this.listItems();
    const item = items.find((i) => i.projectId === projectId && i.id === itemId);
    if (!item) throw new InboxItemNotFoundError(projectId, itemId);
    return this.issues.process(item, override);
  }

  /** Cached GitHub classification + the (uncached, local) review/rebase/address-comments task state per PR. */
  async listPrs(refresh = false): Promise<InboxPrsResponse> {
    const [result, { reviews, rebases, addressings, fixes, runs }] = await Promise.all([
      this.cachedPrs(refresh),
      this.prTaskStates(),
    ]);
    return {
      ...result,
      prs: result.prs.map((pr) => {
        const key = `${pr.repo.toLowerCase()}#${pr.number}`;
        const codeReview = reviews.get(key);
        const rebase = rebases.get(key);
        const addressComments = addressings.get(key);
        const fixCi = fixes.get(key);
        const prRuns = runs.get(key);
        return {
          ...pr,
          ...(codeReview ? { codeReview } : {}),
          ...(rebase ? { rebase } : {}),
          ...(addressComments ? { addressComments } : {}),
          ...(fixCi ? { fixCi } : {}),
          ...(prRuns ? { runs: prRuns.reverse() } : {}),
        };
      }),
    };
  }

  private cachedPrs(refresh = false): Promise<InboxPrsResponse> {
    if (!refresh && this.prsCache && Date.now() - this.prsCache.at < PRS_TTL_MS) {
      return this.prsCache.value;
    }
    const value = this.fetchPrs();
    const entry = { at: Date.now(), value };
    this.prsCache = entry;
    value.catch(() => {
      if (this.prsCache === entry) this.prsCache = null;
    });
    return value;
  }

  /**
   * Latest review task (Phase 129 P2, any level), latest rebase task (todo-11) and latest
   * address-comments task (PR inbox redesign) per `repo#number`. A `running` one whose task
   * failed or whose run errored reads `failed`.
   */
  private async prTaskStates(): Promise<{
    reviews: Map<string, NonNullable<InboxPr["codeReview"]>>;
    rebases: Map<string, NonNullable<InboxPr["rebase"]>>;
    addressings: Map<string, NonNullable<InboxPr["addressComments"]>>;
    fixes: Map<string, NonNullable<InboxPr["fixCi"]>>;
    runs: Map<string, InboxPrRun[]>;
  }> {
    const tasks = await this.tasks.list().catch(() => []);
    const reviews = new Map<string, NonNullable<InboxPr["codeReview"]>>();
    const rebases = new Map<string, NonNullable<InboxPr["rebase"]>>();
    const addressings = new Map<string, NonNullable<InboxPr["addressComments"]>>();
    const fixes = new Map<string, NonNullable<InboxPr["fixCi"]>>();
    const runs = new Map<string, InboxPrRun[]>();
    for (const task of [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const dead = isDeadTask(task);
      const { prReview: review, prRebase: rebase, prAddressComments: fix } = task;
      // Oldest first here; `listPrs` reverses each list to newest first.
      const addRun = (
        pr: { repo: string; number: number; state: InboxPrRun["state"] },
        kind: InboxPrRun["kind"],
        extra: { finishedAt?: string | undefined; auto?: true | undefined } = {},
      ) => {
        const key = `${pr.repo.toLowerCase()}#${pr.number}`;
        runs.set(key, [
          ...(runs.get(key) ?? []),
          {
            taskId: task.id,
            ...(task.runRef ? { runRef: task.runRef } : {}),
            kind,
            state: pr.state === "running" && dead ? "failed" : pr.state,
            startedAt: task.createdAt,
            ...(extra.finishedAt ? { finishedAt: extra.finishedAt } : {}),
            ...(extra.auto ? { auto: true as const } : {}),
          },
        ]);
      };
      if (review) addRun(review, "review", review);
      if (fix) addRun(fix, "address-comments", fix);
      if (task.prFixCi) addRun(task.prFixCi, "fix-ci", task.prFixCi);
      if (task.prCiTriage) addRun(task.prCiTriage, "ci-triage");
      if (rebase) addRun(rebase, "rebase");
      if (review) {
        reviews.set(`${review.repo.toLowerCase()}#${review.number}`, {
          taskId: task.id,
          state: review.state === "running" && dead ? "failed" : review.state,
          ...(review.finishedAt ? { finishedAt: review.finishedAt } : {}),
          ...(review.auto ? { auto: true as const } : {}),
        });
      }
      if (rebase) {
        rebases.set(`${rebase.repo.toLowerCase()}#${rebase.number}`, {
          taskId: task.id,
          state: rebase.state === "running" && dead ? "failed" : rebase.state,
        });
      }
      if (fix) {
        addressings.set(`${fix.repo.toLowerCase()}#${fix.number}`, {
          taskId: task.id,
          state: fix.state === "running" && dead ? "failed" : fix.state,
          ...(fix.finishedAt ? { finishedAt: fix.finishedAt } : {}),
          ...(fix.auto ? { auto: true as const } : {}),
        });
      }
      const ci = task.prFixCi;
      if (ci) {
        fixes.set(`${ci.repo.toLowerCase()}#${ci.number}`, {
          taskId: task.id,
          state: ci.state === "running" && dead ? "failed" : ci.state,
          ...(ci.finishedAt ? { finishedAt: ci.finishedAt } : {}),
        });
      }
    }
    return { reviews, rebases, addressings, fixes, runs };
  }

  private async fetchPrs(): Promise<InboxPrsResponse> {
    const repos = new Map<string, { project: Project; token: string }>();
    for (const project of await this.projects.list()) {
      const link = await resolveGithubToken(this.resolvedProjects, this.credentials, project);
      if (link && !repos.has(link.repo)) repos.set(link.repo, { project, token: link.token });
    }

    // Teams with a configured code owner id: searched in addition to the user's memberships.
    const configuredSlugs = (await this.teamsStorage.list()).flatMap((t) =>
      t.slug ? [t.slug] : [],
    );
    const teamsByToken = new Map<string, Promise<{ teams: string[]; note?: string }>>();
    const loginByToken = new Map<string, Promise<string | undefined>>();
    const membersByTeam = new Map<string, Promise<Set<string>>>();
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
        let login = loginByToken.get(token);
        if (!login) loginByToken.set(token, (login = this.viewerLogin(token)));
        const repoOwner = repo.split("/")[0] ?? "";
        const owner = repoOwner.toLowerCase();
        const seen = new Set<string>();
        const ownerTeams = [...all, ...configuredSlugs.map((s) => qualifyTeamSlug(s, repoOwner))]
          .filter((t) => t.toLowerCase().startsWith(`${owner}/`))
          .filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
        const notes: string[] = [];
        const repoPrs = await this.repoPrs(repo, project, token, ownerTeams, await login, notes);
        // Configured teams the author belongs to, so a team filter also catches its members' PRs.
        const members = await Promise.all(
          configuredSlugs.map(async (s) => {
            const team = qualifyTeamSlug(s, repoOwner);
            const key = `${token}\n${team.toLowerCase()}`;
            let logins = membersByTeam.get(key);
            if (!logins) membersByTeam.set(key, (logins = this.teamMembers(token, team)));
            return { team, logins: await logins };
          }),
        );
        for (const pr of repoPrs) {
          const teams = members.filter((m) => m.logins.has(pr.author.toLowerCase()));
          if (teams.length) pr.authorTeams = teams.map((m) => m.team);
        }
        prs.push(...repoPrs);
        for (const message of notes) {
          if (!errors.some((e) => e.message === message))
            errors.push({ projectId: project.id, source: "github", message });
        }
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
    login: string | undefined,
    notes: string[] = [],
  ): Promise<InboxPr[]> {
    const base = `is:pr is:open repo:${repo}`;
    const mine = await this.search(token, `${base} author:@me`);
    const direct = await this.search(token, `${base} user-review-requested:@me`);
    // Others' PRs you reviewed; a failing search degrades to none. Set first so every other bucket overwrites it.
    const reviewed = await this.search(token, `${base} reviewed-by:@me -author:@me`).catch(
      () => [],
    );
    const buckets = new Map<number, Pick<InboxPr, "bucket" | "reviewReason" | "reviewTeam">>();
    for (const n of reviewed) buckets.set(n, { bucket: "reviewed" });
    // Every team whose search returned the PR, whichever bucket it ends up in.
    const requested = new Map<number, string[]>();
    for (const team of teams) {
      // One team search failing must not drop the repo. 422 = GitHub does not know the team
      // (a stale configured slug): silent; anything else (rate limit, 401/403, 5xx) leaves a note.
      const found = await this.search(token, `${base} team-review-requested:${team}`).catch(
        (error: Error) => {
          if (!/HTTP 422$/.test(error.message))
            notes.push(`${repo}: team ${team} search failed (${error.message || "unknown error"})`);
          return [];
        },
      );
      for (const n of found) {
        const list = requested.get(n) ?? [];
        if (!list.some((t) => t.toLowerCase() === team.toLowerCase())) list.push(team);
        requested.set(n, list);
        if (!buckets.has(n) || buckets.get(n)?.bucket === "reviewed")
          buckets.set(n, { bucket: "to-review", reviewReason: "team", reviewTeam: team });
      }
    }
    for (const n of direct) buckets.set(n, { bucket: "to-review", reviewReason: "direct" }); // direct wins
    for (const n of mine) buckets.set(n, { bucket: "mine" }); // mine is never "to review"

    // One PR closed between search and fetch, or a token without Checks:read, must
    // not drop the whole repo: a failed pull fetch skips that PR, failed
    // reviews/check-runs degrade to "none"/"unknown".
    const load = async (
      number: number,
      bucket: Pick<InboxPr, "bucket" | "reviewReason" | "reviewTeam">,
      stacked = false,
    ) => {
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
      const ignored = project.ciIgnoredChecks;
      const ci = checks ? ciState(checks.check_runs ?? [], ignored) : ("unknown" as const);
      const ciExtra = checks ? ciDetails(checks.check_runs ?? [], ignored) : {};
      const review = reviewState(Array.isArray(reviews) ? reviews : []);
      const mergeable = pull.mergeable ?? null;
      const unresolvedThreads =
        bucket.bucket === "mine"
          ? await this.unresolvedThreads(token, repo, number).catch(() => undefined)
          : undefined;
      const verdict =
        bucket.bucket === "mine"
          ? undefined
          : myVerdict(Array.isArray(reviews) ? reviews : [], login);
      const author = pull.user?.login ?? "";
      const authorName = author ? await this.userName(token, author) : undefined;
      return {
        source: "github" as const,
        number,
        title: pull.title ?? "",
        ...(pull.body?.trim() ? capDescription(pull.body) : {}),
        url: pull.html_url ?? `https://github.com/${repo}/pull/${number}`,
        repo,
        author,
        ...(authorName ? { authorName } : {}),
        ...(pull.user?.avatar_url?.startsWith("https://")
          ? { authorAvatarUrl: pull.user.avatar_url }
          : {}),
        createdAt: new Date(pull.created_at ?? Date.now()).toISOString(),
        ...(pull.updated_at ? { updatedAt: new Date(pull.updated_at).toISOString() } : {}),
        draft: pull.draft === true,
        ci,
        ...ciExtra,
        review,
        mergeable,
        ...(pull.mergeable_state === "behind" ? { behind: true } : {}),
        ...(pull.head?.ref && pull.head.repo?.full_name?.toLowerCase() === repo.toLowerCase()
          ? { headRef: pull.head.ref }
          : {}),
        ...(pull.base?.ref ? { baseRef: pull.base.ref } : {}),
        // todo-16 — the head the PR automation dedupes on; only a real 40-hex sha.
        ...(pull.head?.sha && /^[0-9a-f]{40}$/.test(pull.head.sha)
          ? { headSha: pull.head.sha }
          : {}),
        ...(unresolvedThreads !== undefined ? { unresolvedThreads } : {}),
        ...bucket,
        ...(requested.has(number) ? { reviewTeams: requested.get(number) } : {}),
        ...(verdict
          ? { myReview: verdict.state, ...(verdict.sha ? { myReviewSha: verdict.sha } : {}) }
          : bucket.bucket === "reviewed" && !stacked
            ? { myReview: "commented" as const }
            : {}),
        blocker: blockerOf({ ci, review, mergeable }),
        section: sectionOf({ ...bucket, ci, review, mergeable, draft: pull.draft === true }),
        projectId: project.id,
        ...orgOf(project),
      };
    };
    const loadAll = async (list: Parameters<typeof load>[]) =>
      (await Promise.allSettled(list.map((args) => load(...args)))).flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
    const prs = await loadAll([...buckets]);

    // todo-19 — GitHub requests no review on a draft, so a colleague's draft matches none of the
    // searches above. One stacked on a listed PR is part of a stack the operator already watches:
    // follow each stack up (base = a listed head) and add its drafts, level by level.
    // ponytail: one pulls-list call per listed same-repo head on every refresh.
    const listed = new Set(prs.map((p) => p.number));
    for (let frontier = prs; frontier.length > 0; ) {
      const found = await Promise.all(
        frontier.flatMap((p) =>
          p.headRef
            ? [
                this.gh<GhPull[]>(
                  token,
                  `/repos/${repo}/pulls?${new URLSearchParams({ state: "open", base: p.headRef, per_page: "100" })}`,
                ).catch(() => []),
              ]
            : [],
        ),
      );
      const next = found
        .flat()
        .flatMap((p) => (p.draft === true && p.number ? [p.number] : []))
        .filter((n) => !listed.has(n) && listed.add(n));
      frontier = await loadAll(next.map((n) => [n, { bucket: "reviewed" }, true]));
      prs.push(...frontier);
    }
    return prs;
  }

  /**
   * A PR author's GitHub display name, cached per login for the service's lifetime; a missing
   * name or a failed read → undefined (the row falls back to the login).
   */
  // ponytail: never-expiring cache; a renamed profile shows the old name until the API restarts.
  private readonly names = new Map<string, Promise<string | undefined>>();
  private userName(token: string, login: string): Promise<string | undefined> {
    let name = this.names.get(login);
    if (!name) {
      name = this.gh<{ name?: string | null }>(token, `/users/${encodeURIComponent(login)}`).then(
        (u) => u.name?.trim() || undefined,
        () => undefined,
      );
      this.names.set(login, name);
    }
    return name;
  }

  /** Lower-cased logins of an `org/team`'s members; any failure (unknown team, no read:org) → none. */
  private async teamMembers(token: string, team: string): Promise<Set<string>> {
    const [org, slug] = team.split("/");
    if (!org || !slug) return new Set();
    // ponytail: first 100 members only; paginate if a team ever outgrows that.
    return this.gh<{ login?: string }[]>(
      token,
      `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(slug)}/members?per_page=100`,
    ).then(
      (list) => new Set(list.flatMap((m) => (m.login ? [m.login.toLowerCase()] : []))),
      () => new Set<string>(),
    );
  }

  /** Login of the token's user; any failure → undefined (reviewed PRs then read "commented"). */
  private async viewerLogin(token: string): Promise<string | undefined> {
    return this.gh<{ login?: string }>(token, "/user").then(
      (u) => u.login,
      () => undefined,
    );
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

  /** todo-21 — unresolved review threads of one PR (GraphQL; REST has no thread state). */
  private async unresolvedThreads(token: string, repo: string, n: number): Promise<number> {
    const [owner, name] = repo.split("/");
    const res = await this.fetchImpl(`${GITHUB_API}/graphql`, {
      method: "POST",
      headers: { ...this.headers(token), "content-type": "application/json" },
      body: JSON.stringify({
        query:
          "query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}",
        variables: { owner, name, n },
      }),
    });
    if (!res.ok) throw new Error(`github graphql: HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: {
        repository?: {
          pullRequest?: { reviewThreads?: { nodes?: { isResolved?: boolean }[] } } | null;
        } | null;
      };
      errors?: unknown[];
    };
    const nodes = json.data?.repository?.pullRequest?.reviewThreads?.nodes;
    if (json.errors?.length || !nodes) throw new Error("github graphql: no data");
    // ponytail: first 100 threads; a PR with more counts only those.
    return nodes.filter((t) => t.isResolved === false).length;
  }

  private headers(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  }
}

/** A task whose PR review/rebase can no longer progress: failed, cancelled, dead-lettered, or its run errored. */
export function isDeadTask(task: ScheduledTask): boolean {
  return (
    task.status === "failed" ||
    task.status === "cancelled" ||
    task.status === "dead-letter" ||
    task.outcome?.status === "error"
  );
}

/** todo-15 — PR descriptions ride the list payload, so a huge one is capped (the UI links out). */
const DESCRIPTION_CAP = 20_000;
function capDescription(body: string): { body: string; descriptionTruncated?: true } {
  if (body.length <= DESCRIPTION_CAP) return { body };
  let end = DESCRIPTION_CAP;
  // Never split a surrogate pair: drop a dangling high surrogate.
  const last = body.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { body: body.slice(0, end), descriptionTruncated: true };
}
