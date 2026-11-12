import { Injectable, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import {
  type AutopilotLocation,
  type InboxPr,
  type PrReviewLevel,
  type ScheduledTask,
  type Team,
  teamSlugMatches,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { AutopilotService } from "../autopilot/autopilot.service";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { SystemConfigStore } from "../system/system-config.store";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { TeamsStorageService } from "../teams/teams.storage.service";
import { type CiFixRun, type CiTriageRun, decideCiAutofix } from "./ci-autofix";
import { InboxAddressCommentsService } from "./inbox-address-comments.service";
import { InboxCiTriageService } from "./inbox-ci-triage.service";
import { InboxFixCiService } from "./inbox-fix-ci.service";
import { InboxReviewService, ReviewOutOfScopeError } from "./inbox-review.service";
import { InboxService, isDeadTask } from "./inbox.service";
import { selectReviewLevel } from "./select-review-level";

/** At most this many auto starts per tick, across all projects, in inbox order. */
export const PR_AUTOMATION_MAX_STARTS_PER_TICK = 3;

/** `fixedSha` — the head ZIBBY's own approved address-comments push created (never new work). */
type PrRun = { repo: string; number: number; state: string; headSha?: string; fixedSha?: string };

const errMsg = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * todo-16 — the PR automation heartbeat (docs/api/inbox.md "Automatic review & comment
 * handling"). Shares `systemConfig.roadmapTickMs` with the roadmap heartbeat (read live, `0`
 * disables; tests drive {@link tick} directly). Each tick reads the PR inbox and, per PR, the
 * PR's EFFECTIVE Autopilot automation toggles (team > company > global; all off while Autopilot is off).
 * The team is the PR's own — a configured team whose code owner id the review was requested from
 * or whose member wrote it ({@link teamsOfPr}) — never the project's: one repo serves many teams.
 *
 * - **`autoReview`** — a non-draft `to-review` PR with a known head and no review task for that
 *   head (any state: a failed or discarded review of the same head is never retried) and none
 *   in flight → `InboxReviewService.start` at the level `selectReviewLevel` picks from the PR's
 *   files (fetch failure → `quick`). Posting stays behind the `pr-review` approval.
 * - **`autoAddressComments`** — the operator's own PR with unresolved
 *   threads (any review state), same head dedupe → `InboxAddressCommentsService.start(…, { auto: true })`. Such a
 *   run never auto-pushes: its push always parks as an approval (Tier 3 — nobody clicked).
 * - **`autoFixCi`** ("Automatická oprava CI mých PRs") — the operator's own non-draft PR whose CI
 *   settled red (ignored checks left out) → the step {@link decideCiAutofix} picks: a cheap
 *   `pr-ci-triage` run, a rerun of the failed jobs (flaky/infra), an auto `pr-fix-ci` run, or
 *   parking it for the operator. Waits while address-comments is in flight on the same PR.
 *
 * Throttled to {@link PR_AUTOMATION_MAX_STARTS_PER_TICK} starts per tick. Fail open per PR; a
 * `listPrs` failure ends the tick quietly. Unreadable task storage ends it too — without the
 * past tasks the head dedupe is impossible, so it fails closed (starts nothing).
 */
/** Delay of the one extra tick after boot (lets the other services settle). */
const PR_AUTOMATION_BOOT_TICK_MS = 30_000;

@Injectable()
export class PrAutomationService
  extends TickingWatcherBase
  implements OnModuleInit, OnModuleDestroy
{
  private unsubscribe: (() => void) | null = null;
  /**
   * review-scope: `repo#n@head` already skipped as out of my teams' scope — not re-checked every tick.
   * ponytail: in memory, so a restart re-checks (and re-records) each such head once.
   */
  private readonly outOfScope = new Set<string>();
  protected readonly log: ScopedLogger;
  protected readonly watcherId = "pr-automation" as const;

  constructor(
    private readonly inbox: InboxService,
    private readonly reviews: InboxReviewService,
    private readonly addressComments: InboxAddressCommentsService,
    private readonly tasks: ScheduledTasksStorageService,
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly teams: TeamsStorageService,
    private readonly autopilot: AutopilotService,
    private readonly activity: ActivityLogService,
    private readonly systemConfig: SystemConfigStore,
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
    logger: LoggerService,
    @Optional() private readonly ciTriage?: InboxCiTriageService,
    @Optional() private readonly fixCi?: InboxFixCiService,
  ) {
    super();
    this.log = logger.child(PrAutomationService.name);
  }

  onModuleInit(): void {
    this.arm();
    // The interval alone fires first after a full tick (15 min default): also sweep shortly after boot.
    if (this.tickMs() > 0)
      setTimeout(() => void this.guardedTick(), PR_AUTOMATION_BOOT_TICK_MS).unref();
    this.unsubscribe = this.systemConfig.onChange(() => this.arm());
    this.watcherHealthRegistry.register(() => this.watcherHealth());
  }

  onModuleDestroy(): void {
    this.stopTimer();
    this.unsubscribe?.();
  }

  protected tickMs(): number {
    return this.systemConfig.current().roadmapTickMs;
  }

  protected async runTick(): Promise<void> {
    await this.tick();
  }

  async tick(): Promise<{ started: number }> {
    const locations = new Map<string, Promise<AutopilotLocation>>();
    let teams: Team[];
    try {
      teams = await this.teams.list();
    } catch (error) {
      this.log.warn("pr automation: teams unreadable — tick skipped", { error: errMsg(error) });
      return { started: 0 };
    }
    // Idle installs never touch GitHub: the inbox sweep runs only while some project or team
    // has a toggle effectively on.
    if (!(await this.anyAutomationOn(teams))) return { started: 0 };
    let prs: InboxPr[];
    let tasks: ScheduledTask[];
    try {
      prs = (await this.inbox.listPrs()).prs;
      tasks = await this.tasks.list();
    } catch (error) {
      this.log.warn("pr automation: inbox or tasks unreadable — tick skipped", {
        error: errMsg(error),
      });
      return { started: 0 };
    }
    const reviewRuns = runsOf(tasks, (t) => t.prReview);
    const addressRuns = runsOf(tasks, (t) => t.prAddressComments);
    const triageRuns = ciTriageRunsOf(tasks);
    const fixRuns = ciFixRunsOf(tasks);
    let started = 0;
    for (const pr of prs) {
      if (started >= PR_AUTOMATION_MAX_STARTS_PER_TICK) break;
      try {
        if (!pr.headSha) continue;
        // A PR of several teams is automated when any of them has the toggle on.
        const matched = teamsOfPr(pr, teams);
        const places = await Promise.all(
          (matched.length ? matched : [undefined]).map((teamId) => {
            const key = `${pr.projectId}\n${teamId ?? ""}`;
            let place = locations.get(key);
            if (!place) locations.set(key, (place = this.locationOf(pr.projectId, teamId)));
            return place;
          }),
        );
        const resolved = places.map((at) => this.autopilot.automationFor(at));
        const effective = {
          autoReview: resolved.some((c) => c.autoReview),
          autoAddressComments: resolved.some((c) => c.autoAddressComments),
          autoFixCi: resolved.some((c) => c.autoFixCi),
        };
        if (
          effective.autoReview &&
          wantsReview(pr) &&
          isFresh(pr, reviewRuns) &&
          !this.outOfScope.has(headKey(pr))
        ) {
          if (await this.startReview(pr, places)) started++;
        } else if (
          effective.autoAddressComments &&
          wantsAddressing(pr) &&
          isFresh(pr, addressRuns)
        ) {
          await this.startAddressing(pr, places);
          started++;
        } else if (effective.autoFixCi && !addressingInFlight(pr, addressRuns)) {
          const key = prKey(pr);
          if (await this.stepCiAutofix(pr, places, triageRuns.get(key), fixRuns.get(key))) {
            started++;
          }
        }
      } catch (error) {
        this.log.warn("pr automation: one PR failed — skipped", {
          repo: pr.repo,
          number: pr.number,
          error: errMsg(error),
        });
      }
    }
    if (started > 0) this.log.info("pr automation tick", { started });
    return { started };
  }

  /** True when any project (company/global level) or any configured team has a toggle on. */
  private async anyAutomationOn(teams: Team[]): Promise<boolean> {
    const projects = await this.projects.list().catch((error: unknown) => {
      this.log.warn("pr automation: projects unreadable — tick skipped", { error: errMsg(error) });
      return [];
    });
    const resolved = await Promise.all(
      [
        ...projects.map(async (project) =>
          this.autopilot.automationFor(await this.locationOf(project.id)),
        ),
        ...teams.map(async (team) =>
          this.autopilot.automationFor({ companyId: team.companyId, teamId: team.id }),
        ),
      ].map((config) => config.catch(() => null)),
    );
    return resolved.some(
      (c) => c?.autoReview === true || c?.autoAddressComments === true || c?.autoFixCi === true,
    );
  }

  /** False when the review was skipped: none of the PR's files is owned by the operator's teams. */
  private async startReview(pr: InboxPr, at: AutopilotLocation[]): Promise<boolean> {
    const byContent: PrReviewLevel = await this.reviews
      .listPrFiles(pr.projectId, pr.repo, pr.number)
      .then(selectReviewLevel)
      .catch((error: unknown) => {
        this.log.warn("pr automation: PR files unreadable — quick review", {
          repo: pr.repo,
          number: pr.number,
          error: errMsg(error),
        });
        return "quick" as const;
      });
    // Security floor: `tested` / `browser` install and run the PR's code with the project's
    // secrets. Nobody looked at an auto-started PR, so a fork head (no `headRef` — InboxService
    // sets it only for same-repo heads) is capped at `thorough`, which only reads the code.
    const level: PrReviewLevel =
      !pr.headRef && (byContent === "tested" || byContent === "browser") ? "thorough" : byContent;
    let taskId: string;
    try {
      ({ taskId } = await this.reviews.start(
        { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title, level },
        { auto: true, headSha: pr.headSha, autopilotAt: at },
      ));
    } catch (error) {
      if (!(error instanceof ReviewOutOfScopeError)) throw error;
      this.outOfScope.add(headKey(pr));
      this.log.info("pr automation: review skipped — not my teams' files", {
        repo: pr.repo,
        number: pr.number,
      });
      void this.activity.record({
        kind: "pr-review-skipped",
        summary: `auto review skipped ${pr.repo}#${pr.number}: ${error.message}`.slice(0, 300),
        refs: { projectId: pr.projectId, itemId: `${pr.repo}#${pr.number}` },
      });
      return false;
    }
    this.record(pr, taskId, `auto review (${level}) ${pr.repo}#${pr.number}`);
    return true;
  }

  private async startAddressing(pr: InboxPr, at: AutopilotLocation[]): Promise<void> {
    const { taskId } = await this.addressComments.start(
      { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title },
      { auto: true, autopilotAt: at },
    );
    this.record(pr, taskId, `auto address comments ${pr.repo}#${pr.number}`);
  }

  /**
   * One CI auto-fix step for one of my PRs ({@link decideCiAutofix}). True when it started work
   * (a triage, a rerun or a fix) — parking is not a start.
   */
  private async stepCiAutofix(
    pr: InboxPr,
    at: AutopilotLocation[],
    triages: CiTriageRun[] = [],
    fixes: CiFixRun[] = [],
  ): Promise<boolean> {
    const ciTriage = this.ciTriage;
    const fixCi = this.fixCi;
    if (!ciTriage || !fixCi || !pr.headSha) return false;
    const step = decideCiAutofix(pr, triages, fixes);
    switch (step.kind) {
      case "none":
        return false;
      case "triage": {
        const project = await this.projects.get(pr.projectId);
        const { taskId } = await ciTriage.start({
          projectId: pr.projectId,
          repo: pr.repo,
          number: pr.number,
          title: pr.title,
          headSha: pr.headSha,
          failingChecks: [...(pr.ciFailingChecks ?? [])],
          ...(pr.ciCompletedAt ? { ciCompletedAt: pr.ciCompletedAt } : {}),
          ...(project.ciIgnoredChecks?.length ? { ignoredChecks: project.ciIgnoredChecks } : {}),
          autopilotAt: at,
        });
        this.record(pr, taskId, `auto CI triage ${pr.repo}#${pr.number}`);
        return true;
      }
      case "rerun": {
        // The service records the rerun itself; `failed` is parked on the next tick.
        const outcome = await ciTriage.rerun(step.triageTaskId);
        return outcome !== "failed";
      }
      case "fix": {
        const { taskId } = await fixCi.start(
          { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title },
          { auto: true, triageTaskId: step.triageTaskId },
        );
        await ciTriage.markFixStarted(step.triageTaskId, taskId);
        this.record(pr, taskId, `auto CI fix ${pr.repo}#${pr.number}`);
        return true;
      }
      case "park":
        await ciTriage.park(step.triageTaskId, step.note);
        return false;
    }
  }

  private record(pr: InboxPr, taskId: string, summary: string): void {
    void this.activity.record({
      kind: "pr-automation-started",
      summary,
      refs: { projectId: pr.projectId, taskId, itemId: `${pr.repo}#${pr.number}` },
    });
  }

  /** Where a PR of a project (and `teamId`) sits in the autopilot tree: the project's company + the team. */
  private async locationOf(projectId: string, teamId?: string): Promise<AutopilotLocation> {
    const project = await this.projects.get(projectId).catch(() => null);
    const company = project ? await this.resolvedProjects.resolveCompany(project) : undefined;
    return { ...(company?.id ? { companyId: company.id } : {}), ...(teamId ? { teamId } : {}) };
  }
}

/**
 * The configured teams a PR belongs to: those whose code owner id (`slug`) its review was
 * requested from, or whose member authored it. Never the project's team — several teams work in
 * one project, so a project-level team would pull in every other team's PRs.
 */
export function teamsOfPr(pr: InboxPr, teams: readonly Team[]): string[] {
  const owners = [
    ...(pr.reviewTeams ?? (pr.reviewTeam ? [pr.reviewTeam] : [])),
    ...(pr.authorTeams ?? []),
  ];
  return teams
    .filter((t) => t.slug && owners.some((o) => teamSlugMatches(o, t.slug ?? "")))
    .map((t) => t.id);
}

const prKey = (pr: { repo: string; number: number }): string =>
  `${pr.repo.toLowerCase()}#${pr.number}`;

/** Address-comments in flight on the PR: its push and a CI fix would race for the same branch. */
function addressingInFlight(pr: InboxPr, runs: Map<string, PrRun[]>): boolean {
  return (runs.get(prKey(pr)) ?? []).some(
    (r) => r.state === "running" || r.state === "awaiting-approval",
  );
}

/** Past `pr-ci-triage` runs per `repo#number` (lowercased repo). */
function ciTriageRunsOf(tasks: ScheduledTask[]): Map<string, CiTriageRun[]> {
  const runs = new Map<string, CiTriageRun[]>();
  for (const task of tasks) {
    const t = task.prCiTriage;
    if (!t) continue;
    const key = prKey(t);
    runs.set(key, [
      ...(runs.get(key) ?? []),
      {
        taskId: task.id,
        headSha: t.headSha,
        state: t.state,
        ...(t.verdict ? { verdict: t.verdict } : {}),
        failingChecks: t.failingChecks,
        ...(t.ciCompletedAt ? { ciCompletedAt: t.ciCompletedAt } : {}),
        ...(t.note ? { note: t.note } : {}),
        dead: isDeadTask(task),
      },
    ]);
  }
  return runs;
}

/** Past `pr-fix-ci` runs per `repo#number` (lowercased repo) — clicked ones too: they spend the chain. */
function ciFixRunsOf(tasks: ScheduledTask[]): Map<string, CiFixRun[]> {
  const runs = new Map<string, CiFixRun[]>();
  for (const task of tasks) {
    const f = task.prFixCi;
    if (!f) continue;
    const key = prKey(f);
    runs.set(key, [
      ...(runs.get(key) ?? []),
      {
        taskId: task.id,
        headSha: f.headSha,
        state: f.state,
        ...(f.fixedSha ? { fixedSha: f.fixedSha } : {}),
        ...(f.triageTaskId ? { triageTaskId: f.triageTaskId } : {}),
        dead: isDeadTask(task),
      },
    ]);
  }
  return runs;
}

const headKey = (pr: InboxPr): string =>
  `${pr.repo.toLowerCase()}#${pr.number}@${pr.headSha ?? ""}`;

function wantsReview(pr: InboxPr): boolean {
  return pr.bucket === "to-review" && !pr.draft;
}

function wantsAddressing(pr: InboxPr): boolean {
  return (
    // Any unresolved thread on my PR counts: plain review comments (no CHANGES_REQUESTED) too.
    pr.bucket === "mine" && (pr.unresolvedThreads ?? 0) > 0
  );
}

/** Past runs of one kind per `repo#number` (lowercased repo), with the dead-task state folded in. */
function runsOf(
  tasks: ScheduledTask[],
  pick: (task: ScheduledTask) => PrRun | undefined,
): Map<string, PrRun[]> {
  const runs = new Map<string, PrRun[]>();
  for (const task of tasks) {
    const run = pick(task);
    if (!run) continue;
    const key = `${run.repo.toLowerCase()}#${run.number}`;
    const state = run.state === "running" && isDeadTask(task) ? "failed" : run.state;
    runs.set(key, [...(runs.get(key) ?? []), { ...run, state }]);
  }
  return runs;
}

/** No run for this head (nor one whose approved push produced it) in any state, and none of the PR in flight. */
function isFresh(pr: InboxPr, runs: Map<string, PrRun[]>): boolean {
  const past = runs.get(`${pr.repo.toLowerCase()}#${pr.number}`) ?? [];
  return !past.some(
    (r) =>
      r.headSha === pr.headSha ||
      // A head ZIBBY itself pushed (an approved fix) is not new work: the reviewer's
      // CHANGES_REQUESTED and the skipped threads outlive the push, so without this the
      // next tick would re-run on its own output.
      (r.fixedSha !== undefined && r.fixedSha === pr.headSha) ||
      r.state === "running" ||
      r.state === "awaiting-approval",
  );
}
