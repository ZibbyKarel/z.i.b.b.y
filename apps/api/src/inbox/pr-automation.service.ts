import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  type EffectiveRoadmapConfig,
  type InboxPr,
  type PrReviewLevel,
  type ScheduledTask,
  resolveRoadmapConfig,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { RoadmapStore } from "../roadmap/roadmap.store";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { SystemConfigStore } from "../system/system-config.store";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { InboxAddressCommentsService } from "./inbox-address-comments.service";
import { InboxReviewService } from "./inbox-review.service";
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
 * project's EFFECTIVE roadmap toggles (own value, else the company's `roadmapDefaults`, else off):
 *
 * - **`autoReview`** — a non-draft `to-review` PR with a known head and no review task for that
 *   head (any state: a failed or discarded review of the same head is never retried) and none
 *   in flight → `InboxReviewService.start` at the level `selectReviewLevel` picks from the PR's
 *   files (fetch failure → `quick`). Posting stays behind the `pr-review` approval.
 * - **`autoAddressComments`** — the operator's own PR with changes requested and unresolved
 *   threads, same head dedupe → `InboxAddressCommentsService.start(…, { auto: true })`. Such a
 *   run never auto-pushes: its push always parks as an approval (Tier 3 — nobody clicked).
 *
 * Throttled to {@link PR_AUTOMATION_MAX_STARTS_PER_TICK} starts per tick. Fail open per PR; a
 * `listPrs` failure ends the tick quietly. Unreadable task storage ends it too — without the
 * past tasks the head dedupe is impossible, so it fails closed (starts nothing).
 */
@Injectable()
export class PrAutomationService
  extends TickingWatcherBase
  implements OnModuleInit, OnModuleDestroy
{
  private unsubscribe: (() => void) | null = null;
  protected readonly log: ScopedLogger;
  protected readonly watcherId = "pr-automation" as const;

  constructor(
    private readonly inbox: InboxService,
    private readonly reviews: InboxReviewService,
    private readonly addressComments: InboxAddressCommentsService,
    private readonly tasks: ScheduledTasksStorageService,
    private readonly roadmap: RoadmapStore,
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
    private readonly activity: ActivityLogService,
    private readonly systemConfig: SystemConfigStore,
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
    logger: LoggerService,
  ) {
    super();
    this.log = logger.child(PrAutomationService.name);
  }

  onModuleInit(): void {
    this.arm();
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
    const configs = new Map<string, Promise<EffectiveRoadmapConfig>>();
    // Idle installs never touch GitHub: the inbox sweep runs only while some project has a
    // toggle effectively on. The resolved configs are reused for the PRs below.
    if (!(await this.anyAutomationOn(configs))) return { started: 0 };
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
    let started = 0;
    for (const pr of prs) {
      if (started >= PR_AUTOMATION_MAX_STARTS_PER_TICK) break;
      try {
        if (!pr.headSha) continue;
        let config = configs.get(pr.projectId);
        if (!config) configs.set(pr.projectId, (config = this.effectiveConfig(pr.projectId)));
        const effective = await config;
        if (effective.autoReview && wantsReview(pr) && isFresh(pr, reviewRuns)) {
          await this.startReview(pr);
          started++;
        } else if (
          effective.autoAddressComments &&
          wantsAddressing(pr) &&
          isFresh(pr, addressRuns)
        ) {
          await this.startAddressing(pr);
          started++;
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

  /** Resolve every project's effective config into `configs`; true when any toggle is on. */
  private async anyAutomationOn(
    configs: Map<string, Promise<EffectiveRoadmapConfig>>,
  ): Promise<boolean> {
    const projects = await this.projects.list().catch((error: unknown) => {
      this.log.warn("pr automation: projects unreadable — tick skipped", { error: errMsg(error) });
      return [];
    });
    const resolved = await Promise.all(
      projects.map((project) => {
        const config = this.effectiveConfig(project.id);
        configs.set(project.id, config);
        return config.catch(() => null);
      }),
    );
    return resolved.some((c) => c?.autoReview === true || c?.autoAddressComments === true);
  }

  private async startReview(pr: InboxPr): Promise<void> {
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
    const { taskId } = await this.reviews.start(
      { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title, level },
      { auto: true, headSha: pr.headSha },
    );
    this.record(pr, taskId, `auto review (${level}) ${pr.repo}#${pr.number}`);
  }

  private async startAddressing(pr: InboxPr): Promise<void> {
    const { taskId } = await this.addressComments.start(
      { projectId: pr.projectId, repo: pr.repo, number: pr.number, title: pr.title },
      { auto: true },
    );
    this.record(pr, taskId, `auto address comments ${pr.repo}#${pr.number}`);
  }

  private record(pr: InboxPr, taskId: string, summary: string): void {
    void this.activity.record({
      kind: "pr-automation-started",
      summary,
      refs: { projectId: pr.projectId, taskId, itemId: `${pr.repo}#${pr.number}` },
    });
  }

  /** Same inheritance as `RoadmapTickService`: own toggle, else company default, else off. */
  private async effectiveConfig(projectId: string): Promise<EffectiveRoadmapConfig> {
    const config = await this.roadmap.readConfig(projectId);
    const project = await this.projects.get(projectId).catch(() => null);
    const company = project ? await this.resolvedProjects.resolveCompany(project) : undefined;
    return resolveRoadmapConfig(config, company?.roadmapDefaults);
  }
}

function wantsReview(pr: InboxPr): boolean {
  return pr.bucket === "to-review" && !pr.draft;
}

function wantsAddressing(pr: InboxPr): boolean {
  return (
    pr.bucket === "mine" && pr.review === "changes-requested" && (pr.unresolvedThreads ?? 0) > 0
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
