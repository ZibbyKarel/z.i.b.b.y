import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { LimitsService } from "../limits/limits.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { SystemConfigStore } from "../system/system-config.store";

/** A limit-paused run the scan considers, normalized across the two runner kinds. */
interface PausedEntry {
  kind: "agent" | "pipeline";
  runId: string;
  resumeAt: number | null | undefined;
  cycles: number;
}

/**
 * Phase 9.2 — the auto-resume daemon. On a tick it scans both runners' registries for
 * `paused-limit` runs whose `resumeAt` has passed and, when the usage window has
 * actual headroom again, resumes them (Tier 1 — silent, recorded by the activity
 * recorder off the run transitions). It owns the resilience rules the roadmap calls
 * for:
 *
 * - **Fail-closed freshness** (decision 5): a stale/unreadable snapshot skips the
 *   tick entirely — never resume on a lagging capture.
 * - **Oldest-first + inter-resume re-check** (the thundering-herd watch-out): due runs
 *   resume oldest `resumeAt` first; once one resume has consumed the window this tick,
 *   the remaining due runs are left for the next tick rather than flapping.
 * - **Bounded cycles** (decision 6): a run that keeps becoming due without ever
 *   getting headroom (a genuine flap) burns one cycle per such attempt; past
 *   the operator-owned `limitResumeMax` it is parked (pipelines, operator-resumable)
 *   or failed with a readable reason (agent runs, which have no parked state).
 *
 * The heartbeat mirrors the other daemons: `systemConfig.limitResumeTickMs` (default
 * 60s); `0` disables it so tests drive {@link tick} directly with a fake clock.
 */
@Injectable()
export class LimitResumeService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly log: ScopedLogger;
  /** Run refs being resumed right now, so a restart-then-tick can't double-resume one. */
  private readonly inflight = new Set<string>();

  constructor(
    private readonly limits: LimitsService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly systemConfig: SystemConfigStore,
    logger: LoggerService,
  ) {
    this.log = logger.child(LimitResumeService.name);
  }

  onModuleInit(): void {
    // Scan interval from the operator-owned system config; `0` disables (re-arm live).
    this.arm();
    this.unsubscribe = this.systemConfig.onChange(() => this.arm());
  }

  /** (Re-)arm the scan from `systemConfig.limitResumeTickMs`; `0` leaves it disabled. */
  private arm(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const tickMs = this.systemConfig.current().limitResumeTickMs;
    if (tickMs > 0) {
      this.timer = setInterval(() => void this.tick(), tickMs);
      this.timer.unref?.();
      this.log.info("limit-resume scan started", {
        tickMs,
        max: this.systemConfig.current().limitResumeMax,
      });
    } else {
      this.log.debug("limit-resume scan disabled (limitResumeTickMs <= 0)");
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
  }

  /** Resume (or park) every limit-paused run whose `resumeAt` has passed. */
  async tick(now: Date = new Date()): Promise<void> {
    const max = this.systemConfig.current().limitResumeMax;
    const due = this.collectDue(now.getTime());
    if (due.length === 0) return;

    let resumedThisTick = false;
    for (const entry of due) {
      if (this.inflight.has(entry.runId)) continue;

      // Cap reached → park (pipelines) / fail (agent runs); no headroom needed.
      if (entry.cycles >= max) {
        await this.guard(entry.runId, () => this.parkCapped(entry));
        continue;
      }

      const { stale, hasHeadroom } = await this.limits.resumeReadiness();
      // Decision 5: never act on a lagging capture — skip the whole tick.
      if (stale) {
        this.log.debug("limit-resume tick skipped — snapshot stale");
        return;
      }
      // Thundering-herd guard: a sibling already consumed the window this tick, so the
      // rest are left for the next tick (no cycle burned). When NO sibling has resumed
      // yet, a due run with no headroom is a genuine flap → attempt it (it re-pauses
      // immediately at the boundary check, burning one cycle toward the cap).
      if (!hasHeadroom && resumedThisTick) continue;

      await this.guard(entry.runId, async () => {
        await this.resumeOne(entry);
        resumedThisTick = true;
      });
    }
  }

  /** Gather paused-limit runs from both registries, due now, oldest `resumeAt` first. */
  private collectDue(nowMs: number): PausedEntry[] {
    const entries: PausedEntry[] = [
      ...this.agentRunner.listLimitPaused().map(
        (r): PausedEntry => ({
          kind: "agent",
          runId: r.runId,
          resumeAt: r.resumeAt,
          cycles: r.limitResumeCycles ?? 0,
        }),
      ),
      ...this.pipelineRunner.listLimitPaused().map(
        (r): PausedEntry => ({
          kind: "pipeline",
          runId: r.pipelineRunId,
          resumeAt: r.resumeAt,
          cycles: r.limitResumeCycles ?? 0,
        }),
      ),
    ];
    return entries
      .filter((e) => e.resumeAt != null && nowMs >= e.resumeAt)
      .sort((a, b) => (a.resumeAt ?? 0) - (b.resumeAt ?? 0));
  }

  private async resumeOne(entry: PausedEntry): Promise<void> {
    if (entry.kind === "agent") await this.agentRunner.resumeLimitPaused(entry.runId);
    else await this.pipelineRunner.resumeLimitPaused(entry.runId);
  }

  private async parkCapped(entry: PausedEntry): Promise<void> {
    if (entry.kind === "agent") {
      await this.agentRunner.failLimitFlapped(
        entry.runId,
        `usage limit flapped ${entry.cycles} time(s) — failed for review`,
      );
    } else {
      await this.pipelineRunner.parkLimitFlapped(entry.runId);
    }
    this.log.warn("limit-paused run capped", {
      runId: entry.runId,
      kind: entry.kind,
      cycles: entry.cycles,
    });
  }

  /** Run `fn` under the in-flight guard, tolerating a per-run failure (one bad run
   * never blocks the rest of the scan — a cleaned worktree, a deleted run, etc.). */
  private async guard(runId: string, fn: () => Promise<void>): Promise<void> {
    this.inflight.add(runId);
    try {
      await fn();
    } catch (err) {
      this.log.warn("limit-resume step failed (soft)", {
        runId,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.inflight.delete(runId);
    }
  }
}
