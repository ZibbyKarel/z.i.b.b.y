import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { AgentRun, PipelineRun } from "@zibby/contracts"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
import { ActivityLogService } from "./activity-log.service"

/**
 * Records run transitions into the activity log (Phase 6.1) — the
 * {@link RunRecorderService} twin: it consumes both runners, so it sits a level
 * ABOVE Agents/Pipelines (a recorder inside either would close a DI cycle), and
 * subscribes `onRunStatus` so the runner internals stay untouched.
 *
 * Dedup is in-memory and best-effort (decision 4): a `Map<runRef, kind>` records
 * only when the mapped kind changes. NO marker files, NO bootstrap sweep — unlike
 * {@link RunRecorderService}'s `claim()`, the cost of a duplicate here is one
 * harmless log line (a restart mid-run at worst re-logs one transition), not a
 * corrupted vault note. An accountability record, not a transactional store.
 */
@Injectable()
export class ActivityRecorderService implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribers: Array<() => void> = []
  /** Last activity-kind recorded for each run ref, to suppress repeat emissions. */
  private readonly seen = new Map<string, string>()

  constructor(
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly activity: ActivityLogService,
  ) {}

  onModuleInit(): void {
    this.unsubscribers.push(
      this.agentRunner.onRunStatus((run) => this.onAgent(run)),
      this.pipelineRunner.onRunStatus((run) => this.onPipeline(run)),
    )
  }

  onModuleDestroy(): void {
    for (const unsub of this.unsubscribers.splice(0)) unsub()
  }

  private onAgent(run: AgentRun): void {
    const kind = run.status === "running" ? "run-started" : isTerminalAgent(run.status) ? "run-finished" : null
    if (!kind || !this.changed(run.runId, kind)) return
    const title = run.title ? ` ${run.title}` : ""
    void this.activity.record({
      kind,
      summary:
        kind === "run-started"
          ? `agent ${run.agentId} started${title}`
          : `agent ${run.agentId}${title} → ${run.status}`,
      refs: { runRef: run.runId, agentId: run.agentId, status: run.status },
    })
  }

  private onPipeline(run: PipelineRun): void {
    const kind =
      run.status === "running"
        ? "pipeline-started"
        : run.status === "parked"
          ? "pipeline-parked"
          : isTerminalPipeline(run.status)
            ? "pipeline-finished"
            : null
    if (!kind || !this.changed(run.pipelineRunId, kind)) return
    const tail = run.status === "parked" && run.parkedReason ? ` (${run.parkedReason})` : ""
    void this.activity.record({
      kind,
      summary:
        kind === "pipeline-started"
          ? `pipeline ${run.pipelineId} started`
          : `pipeline ${run.pipelineId} → ${run.status}${tail}`,
      refs: { runRef: run.pipelineRunId, pipelineId: run.pipelineId, status: run.status },
    })
  }

  /** True once per (runRef, kind) — the dedup gate. */
  private changed(runRef: string, kind: string): boolean {
    if (this.seen.get(runRef) === kind) return false
    this.seen.set(runRef, kind)
    return true
  }
}

function isTerminalAgent(status: AgentRun["status"]): boolean {
  return status === "done" || status === "error" || status === "interrupted"
}

function isTerminalPipeline(status: PipelineRun["status"]): boolean {
  return status === "done" || status === "failed"
}
