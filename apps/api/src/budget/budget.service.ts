import { Injectable } from "@nestjs/common";
import type { BudgetStatus, GlobalBudget, ProjectBudgetStatus } from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { LimitsService } from "../limits/limits.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { BudgetConfigStore } from "./budget-config.store";
import { BudgetLedgerStore, type LedgerEntry } from "./ledger.store";

/** Why a dispatch is over-cap — the axis the guard reports and the approval names. */
export type BudgetOverReason =
  | "project-daily"
  | "project-weekly"
  | "project-monthly"
  | "project-daily-cost"
  | "project-weekly-cost"
  | "project-monthly-cost"
  | "global";

/**
 * The `spend-past-cap` gate's dollar facts (Phase 12) — set only on a dollar-cap
 * hold. The index signature keeps this structurally assignable to
 * `IntendedAction["metrics"]` (`Record<string, number>`) at the `gates.evaluate`
 * call site, not just for a fresh object literal.
 */
export interface BudgetOverMetrics {
  costUsd: number;
  capUsd: number;
  [key: string]: number;
}

/** The budget guard's verdict for one dispatch. */
export type BudgetCheck =
  | { ok: true }
  | { ok: false; over: BudgetOverReason; detail: string; metrics?: BudgetOverMetrics };

const over = (
  reason: BudgetOverReason,
  detail: string,
  metrics?: BudgetOverMetrics,
): BudgetCheck => ({
  ok: false,
  over: reason,
  detail,
  ...(metrics ? { metrics } : {}),
});

/**
 * The per-engagement budget guard (Phase 8.1). Owns three reads the dispatch path
 * needs: {@link check} (is this dispatch within the project caps + the global account
 * ceiling?), {@link recordDispatch} (append the enforcement ledger line — awaited,
 * NOT the best-effort activity log), and {@link countRunning} (live concurrency for
 * the queue, decision 8). {@link status} assembles the read-only dashboard payload.
 *
 * Budget is **fail-closed** (decision 6): an unreadable ledger or limits snapshot
 * means the spend position is unknown → treat as over-cap (hold + approval), never
 * fail-open. Law 3 makes budget the one place fail-open is wrong.
 */
@Injectable()
export class BudgetService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly ledger: BudgetLedgerStore,
    private readonly config: BudgetConfigStore,
    private readonly projects: ProjectsStorageService,
    private readonly resolved: ResolvedProjectService,
    private readonly limits: LimitsService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly tasks: ScheduledTasksStorageService,
    logger: LoggerService,
  ) {
    this.log = logger.child(BudgetService.name);
  }

  /**
   * Is this dispatch within budget? Checks the global account ceiling first (any
   * project, including unattributed), then the project's daily/weekly run caps. Any
   * read error → over("global") (fail-closed).
   */
  async check(projectId: string | undefined, now: Date = new Date()): Promise<BudgetCheck> {
    // Global account ceiling — applies to every dispatch.
    try {
      const [config, limits] = await Promise.all([this.config.read(), this.limits.snapshot()]);
      if (!limits.stale) {
        if (
          config.pauseAtRollingPct != null &&
          limits.rolling.usedPct >= config.pauseAtRollingPct
        ) {
          return over(
            "global",
            `account at ${limits.rolling.usedPct}% of the 5h window (pause ≥ ${config.pauseAtRollingPct}%)`,
          );
        }
        if (config.pauseAtWeeklyPct != null && limits.weekly.usedPct >= config.pauseAtWeeklyPct) {
          return over(
            "global",
            `account at ${limits.weekly.usedPct}% of the weekly window (pause ≥ ${config.pauseAtWeeklyPct}%)`,
          );
        }
      }
    } catch (error) {
      this.log.warn("budget global check failed — holding (fail-closed)", {
        error: error instanceof Error ? error.message : String(error),
      });
      return over(
        "global",
        "spend position unknown (limits/config unreadable) — holding for approval",
      );
    }

    // Per-project run-count caps. Phase 70: EFFECTIVE budget (the project's own
    // fields merged over its company's defaults), not the raw `project.budget` —
    // a company-less project (or a dangling `companyId`) resolves to its own raw
    // budget unchanged, so this is behavior-preserving for every project without a
    // company.
    if (projectId) {
      const budget = await this.projects
        .get(projectId)
        .then((p) => this.resolved.resolveBudget(p))
        .catch(() => undefined);
      if (budget?.dailyRuns != null || budget?.weeklyRuns != null || budget?.monthlyRuns != null) {
        try {
          if (budget.dailyRuns != null) {
            const used = await this.ledger.countDaily(projectId, now);
            if (used >= budget.dailyRuns) {
              return over("project-daily", `daily run cap reached (${used}/${budget.dailyRuns})`);
            }
          }
          if (budget.weeklyRuns != null) {
            const used = await this.ledger.countWeekly(projectId, now);
            if (used >= budget.weeklyRuns) {
              return over(
                "project-weekly",
                `weekly run cap reached (${used}/${budget.weeklyRuns})`,
              );
            }
          }
          if (budget.monthlyRuns != null) {
            const used = await this.ledger.countMonthly(projectId, now);
            if (used >= budget.monthlyRuns) {
              return over(
                "project-monthly",
                `monthly run cap reached (${used}/${budget.monthlyRuns})`,
              );
            }
          }
        } catch (error) {
          this.log.warn("budget ledger unreadable — holding (fail-closed)", {
            projectId,
            error: error instanceof Error ? error.message : String(error),
          });
          return over(
            "global",
            "spend position unknown (ledger unreadable) — holding for approval",
          );
        }
      }

      // Phase 12: per-project dollar caps. Estimate = spent-so-far + the average
      // cost of this project's own finished runs in the window (decision 3) — with
      // no cost line yet, the average is 0 so the estimate is just spent-so-far.
      // Only runs when at least one dollar cap is actually set (unchanged behavior
      // for every project that never adopts a cost cap).
      if (
        budget?.dailyCostCapUsd != null ||
        budget?.weeklyCostCapUsd != null ||
        budget?.monthlyCostCapUsd != null
      ) {
        try {
          if (budget.dailyCostCapUsd != null) {
            const { sum, count } = await this.ledger.sumCostDaily(projectId, now);
            const estimate = sum + (count > 0 ? sum / count : 0);
            if (estimate > budget.dailyCostCapUsd) {
              return over(
                "project-daily-cost",
                `daily cost cap reached ($${estimate.toFixed(2)}/$${budget.dailyCostCapUsd.toFixed(2)})`,
                { costUsd: estimate, capUsd: budget.dailyCostCapUsd },
              );
            }
          }
          if (budget.weeklyCostCapUsd != null) {
            const { sum, count } = await this.ledger.sumCostWeekly(projectId, now);
            const estimate = sum + (count > 0 ? sum / count : 0);
            if (estimate > budget.weeklyCostCapUsd) {
              return over(
                "project-weekly-cost",
                `weekly cost cap reached ($${estimate.toFixed(2)}/$${budget.weeklyCostCapUsd.toFixed(2)})`,
                { costUsd: estimate, capUsd: budget.weeklyCostCapUsd },
              );
            }
          }
          if (budget.monthlyCostCapUsd != null) {
            const { sum, count } = await this.ledger.sumCostMonthly(projectId, now);
            const estimate = sum + (count > 0 ? sum / count : 0);
            if (estimate > budget.monthlyCostCapUsd) {
              return over(
                "project-monthly-cost",
                `monthly cost cap reached ($${estimate.toFixed(2)}/$${budget.monthlyCostCapUsd.toFixed(2)})`,
                { costUsd: estimate, capUsd: budget.monthlyCostCapUsd },
              );
            }
          }
        } catch (error) {
          this.log.warn("budget cost ledger unreadable — holding (fail-closed)", {
            projectId,
            error: error instanceof Error ? error.message : String(error),
          });
          return over(
            "global",
            "spend position unknown (cost ledger unreadable) — holding for approval",
          );
        }
      }
    }
    return { ok: true };
  }

  /** Append one started-run line to the enforcement ledger (awaited on dispatch). */
  recordDispatch(entry: LedgerEntry, now: Date = new Date()): Promise<void> {
    return this.ledger.record(entry, now);
  }

  /**
   * Append one finished-run cost line (Phase 12) — awaited by the caller
   * (task-scheduler's `reconcileOutcome`) but best-effort here: a write failure is
   * logged, never thrown, so a ledger hiccup can't crash the outcome write-back.
   */
  async recordCost(
    entry: { projectId: string; taskId?: string; runRef: string; kind: string; costUsd: number },
    now: Date = new Date(),
  ): Promise<void> {
    try {
      await this.ledger.recordCost({ at: now.toISOString(), ...entry }, now);
    } catch (error) {
      this.log.warn("cost ledger write failed (best-effort, run outcome still recorded)", {
        ...entry,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Top-level runs currently consuming a concurrency slot for `projectId`. Counts
   * agent runs (running / awaiting-approval / paused-limit) labelled with the project
   * and pipeline runs (running / paused-limit) whose `projectPath` is the project's
   * path — pipeline STAGE runs live in the pipeline runner's own core and never reach
   * these registries, so they are not double-counted (the watch-out).
   *
   * Phase 9: a `paused-limit` run still owns its slot — releasing it would let the
   * queued task AND the auto-resumed run both start at window reset (double-dispatch).
   */
  async countRunning(projectId: string): Promise<number> {
    const project = await this.projects.get(projectId).catch(() => null);
    if (!project) return 0;
    const labels = new Set([project.id, project.name, project.path]);
    let n = 0;
    for (const run of this.agentRunner.listRunning()) {
      const active =
        run.status === "running" ||
        run.status === "awaiting-approval" ||
        run.status === "paused-limit";
      if (active && labels.has(run.project)) n += 1;
    }
    for (const run of this.pipelineRunner.list()) {
      const active = run.status === "running" || run.status === "paused-limit";
      if (active && run.projectPath === project.path) n += 1;
    }
    return n;
  }

  /** The full budget readout — pure read from ledger + limits + runners + task store. */
  async status(now: Date = new Date()): Promise<BudgetStatus> {
    const config = await this.config.read().catch((): GlobalBudget => ({}));
    const limits = await this.limits.snapshot();
    const paused =
      !limits.stale &&
      ((config.pauseAtRollingPct != null && limits.rolling.usedPct >= config.pauseAtRollingPct) ||
        (config.pauseAtWeeklyPct != null && limits.weekly.usedPct >= config.pauseAtWeeklyPct));

    const projects = await this.projects.list().catch(() => []);
    const tasks = await this.tasks.list().catch(() => []);
    const queuedByProject = new Map<string, number>();
    const heldByProject = new Map<string, number>();
    for (const task of tasks) {
      if (!task.projectId) continue;
      const bucket =
        task.status === "queued" ? queuedByProject : task.status === "held" ? heldByProject : null;
      if (bucket) bucket.set(task.projectId, (bucket.get(task.projectId) ?? 0) + 1);
    }

    const rows: ProjectBudgetStatus[] = [];
    for (const project of projects) {
      // Phase 70: the EFFECTIVE budget (company defaults + this project's own
      // overrides, field-level) — a company-less project resolves to its own raw
      // `budget` unchanged, so this readout is behavior-preserving for every
      // project without a company.
      const budget = await this.resolved.resolveBudget(project);
      if (!budget) continue; // only engagements with a budget appear in the readout
      const [daily, weekly, monthly, dailyCost, weeklyCost, monthlyCost, running] =
        await Promise.all([
          this.ledger.countDaily(project.id, now).catch(() => 0),
          this.ledger.countWeekly(project.id, now).catch(() => 0),
          this.ledger.countMonthly(project.id, now).catch(() => 0),
          this.ledger.sumCostDaily(project.id, now).catch(() => ({ sum: 0, count: 0 })),
          this.ledger.sumCostWeekly(project.id, now).catch(() => ({ sum: 0, count: 0 })),
          this.ledger.sumCostMonthly(project.id, now).catch(() => ({ sum: 0, count: 0 })),
          this.countRunning(project.id),
        ]);
      rows.push({
        projectId: project.id,
        name: project.name,
        daily: {
          used: daily,
          ...(budget.dailyRuns != null ? { cap: budget.dailyRuns } : {}),
        },
        weekly: {
          used: weekly,
          ...(budget.weeklyRuns != null ? { cap: budget.weeklyRuns } : {}),
        },
        monthly: {
          used: monthly,
          ...(budget.monthlyRuns != null ? { cap: budget.monthlyRuns } : {}),
        },
        // Phase 12: the dollar-window counterparts, same shape as daily/weekly/monthly
        // above — spentUsd always reported, capUsd only when the project set one.
        dailyCost: {
          spentUsd: dailyCost.sum,
          ...(budget.dailyCostCapUsd != null ? { capUsd: budget.dailyCostCapUsd } : {}),
        },
        weeklyCost: {
          spentUsd: weeklyCost.sum,
          ...(budget.weeklyCostCapUsd != null ? { capUsd: budget.weeklyCostCapUsd } : {}),
        },
        monthlyCost: {
          spentUsd: monthlyCost.sum,
          ...(budget.monthlyCostCapUsd != null ? { capUsd: budget.monthlyCostCapUsd } : {}),
        },
        running,
        ...(budget.maxConcurrent != null ? { maxConcurrent: budget.maxConcurrent } : {}),
        queued: queuedByProject.get(project.id) ?? 0,
        held: heldByProject.get(project.id) ?? 0,
      });
    }

    return {
      global: {
        rolling: limits.rolling,
        weekly: limits.weekly,
        stale: limits.stale,
        ...(config.pauseAtRollingPct != null
          ? { pauseAtRollingPct: config.pauseAtRollingPct }
          : {}),
        ...(config.pauseAtWeeklyPct != null ? { pauseAtWeeklyPct: config.pauseAtWeeklyPct } : {}),
        paused,
      },
      projects: rows,
    };
  }
}
