import { Injectable } from "@nestjs/common";
import {
  ROADMAP_DECOMPOSER_AGENT_ID,
  type RoadmapItem,
  type RoadmapItemRun,
  type TaskTarget,
} from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { ActivityLogService } from "../activity/activity-log.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { withPathLock } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { writeRoadmapBackRef } from "./roadmap-back-ref";
import { extractDecompositionArtifact } from "./decomposition-artifact";
import { ingestDecomposition } from "./decomposition-ingest";
import { buildDecompositionTaskText } from "./decomposition-task-text";
import { RoadmapItemLifecycleError } from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";

/**
 * The dedicated agent Play-on-a-childless-epic dispatches to. Routed
 * EXPLICITLY (`explicitTarget`, below) — never classified into: the house rule
 * is "an explicit target skips the classifier", and this is the one caller in
 * the codebase that always supplies one for this id.
 *
 * That exclusion is STRUCTURAL, not a matter of trusting the agent's own
 * instructions to bail to `[]`: the id is a member of
 * `EXPLICIT_ONLY_AGENT_IDS`, which `TaskClassifierService.agentCandidates`
 * filters out of every catalog it builds. See that constant's docblock in
 * `libs/contracts/src/tasks/task.schema.ts` for the incident that made the
 * prompt-level promise insufficient.
 */
const DECOMPOSITION_AGENT_TARGET: TaskTarget = {
  kind: "agent",
  id: ROADMAP_DECOMPOSER_AGENT_ID,
  name: "Roadmap Decomposer",
  glyph: "flow",
  category: "Roadmap",
};

/**
 * True while `epic`'s LAST recorded run is still in flight. This is the ONLY
 * in-flight guard a decomposition needs — see this file's class docblock for
 * why an epic's own `lifecycle` never moves off `todo` and so can't be used
 * as one the way an ordinary item's `lifecycle !== "todo"` already is.
 */
export function hasRunningDecomposition(epic: RoadmapItem): boolean {
  return epic.runs[epic.runs.length - 1]?.outcome === "running";
}

/**
 * Phase 125g — Play on a CHILDLESS epic (`RoadmapGateService.playEpic`'s other
 * branch, "with children", just enqueues them via the existing `playBulk`).
 * See `docs/api/roadmap.md`'s "Decomposition" and the master plan's
 * "Decomposition (125g)" section for the full picture; this docblock covers
 * only this service's own shape.
 *
 * **An epic's own `lifecycle` is deliberately left untouched by this whole
 * flow** — it stays whatever it was created as (`"todo"`) forever. An epic is
 * never itself "run" the way a task is (no PR, no merge, nothing external to
 * gate on), and leaving it `todo` is exactly what lets the operator press
 * Play on the SAME epic again once it has children — `playEpic`'s "has
 * children -> enqueue them" branch — without ever hitting the ordinary
 * `lifecycle !== "todo"` 409 a decomposed epic would otherwise be stuck
 * behind. Only the epic's own `runs[]` grows a record per attempt; that
 * record's `outcome` (`running` -> `done`/`failed`) is the only state this
 * flow needs — `running` is the dispatch guard ({@link
 * hasRunningDecomposition}), `done`/`failed` are simply history once an
 * attempt finishes (a `failed` epic is still childless and still `todo`, so
 * pressing Play again is already the natural "retry", no dedicated
 * restart/resume action needed the way an ordinary item has one).
 *
 * **The agent never writes a roadmap file.** {@link dispatch} sends the
 * epic's name + description to the dedicated, explicitly-routed agent above;
 * its ENTIRE contribution to the run is a JSON array in its own transcript.
 * {@link reconcile} is the only thing that ever calls `RoadmapStore.put` for
 * the resulting children — one auditable write path, fed by the pure {@link
 * ingestDecomposition} (Law 3: nothing here self-dispatches; every ingested
 * child lands `lifecycle: "todo"`, inert until the operator plays it).
 *
 * {@link reconcile} is a fully-tested MECHANISM, not a ticker — the same
 * posture `RoadmapGateService.reconcileRunning`/`reconcileAwaitingMerge`
 * shipped in 125e before 125h wires a periodic call to any of them.
 */
@Injectable()
export class RoadmapDecompositionService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly roadmap: RoadmapStore,
    private readonly projects: ProjectsStorageService,
    private readonly taskScheduler: TaskSchedulerService,
    private readonly scheduledTasks: ScheduledTasksStorageService,
    private readonly agentRunner: AgentRunnerService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.log = logger.child(RoadmapDecompositionService.name);
  }

  /**
   * Dispatch a decomposition run for a CHILDLESS epic — the caller
   * (`RoadmapGateService.playEpic`) has already confirmed `children.length
   * === 0`. Throws {@link RoadmapItemLifecycleError} (409) when one is
   * already in flight; that is the only lifecycle check this method makes,
   * since the epic's own `lifecycle` never gates anything here (see the
   * class docblock).
   */
  async dispatch(projectId: string, epic: RoadmapItem): Promise<RoadmapItem> {
    if (hasRunningDecomposition(epic)) {
      throw new RoadmapItemLifecycleError(
        projectId,
        epic.id,
        "already has a decomposition run in flight",
      );
    }
    const project = await this.projects.get(projectId);
    if (!project.path) {
      throw new Error(
        `project "${projectId}" has no local path configured — the decomposer cannot attribute a run to it`,
      );
    }
    const text = buildDecompositionTaskText(epic);
    const result = await this.taskScheduler.createTask(
      {
        title: `Rozfázovat epik: ${epic.name}`.slice(0, 200),
        text,
        paths: [project.path],
        // Tier-1, no delivery to make: the agent's whole job is its own
        // transcript — it never touches the worktree, so there is nothing
        // for a `pr`/`file` output to deliver.
        output: { type: "void" },
      },
      Date.now(),
      // trustedProjectId — NEVER: attribution stays server-derived via `paths` (Law 4).
      undefined,
      DECOMPOSITION_AGENT_TARGET,
      // background: false — the same synchronous server-call pattern the ordinary
      // gate's `release()` uses, so this call always learns the real dispatch
      // outcome before writing the epic's run record.
      false,
    );
    // Same reverse edge an ordinary release writes (`RoadmapGateService.release`)
    // — an epic is a roadmap item too, so its decomposition run links back to it.
    await writeRoadmapBackRef(this.scheduledTasks, this.log, result.task.id, epic);
    const now = new Date().toISOString();
    const run: RoadmapItemRun = {
      taskId: result.task.id,
      ...(result.outcome === "dispatched" ? { runRef: result.runRef } : {}),
      startedAt: now,
      outcome: "running",
    };
    const updated = await this.roadmap.update(projectId, epic.id, (current) => ({
      ...current,
      runs: [...current.runs, run],
      updatedAt: now,
    }));
    void this.activity.record({
      kind: "roadmap-item-dispatched",
      summary: `Decomposition dispatched for epic: ${epic.name}`,
      refs: { projectId, itemId: epic.id, taskId: result.task.id },
    });
    return updated;
  }

  /**
   * Resolve every epic in a project with an in-flight decomposition run.
   * Per-item try/catch — one epic's failure never blocks the rest. A
   * periodic call is 125h's job; this is the fully-tested mechanism it will
   * call (mirrors `RoadmapGateService.reconcileRunning`'s own posture).
   */
  async reconcile(projectId: string): Promise<void> {
    const items = await this.roadmap.list(projectId);
    for (const epic of items) {
      if (epic.level !== "epic" || !hasRunningDecomposition(epic)) continue;
      try {
        await this.reconcileOne(projectId, epic.id);
      } catch (error) {
        this.log.warn("decomposition reconcile failed for one epic — stays running", {
          projectId,
          itemId: epic.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Locked per epic so two overlapping `reconcile` calls (e.g. an operator's
   * action racing a future tick) can never both decide to ingest the same
   * run's children twice. The idempotency guard itself has two independent
   * layers, checked in order: (1) the epic's LAST run must still read
   * `outcome: "running"` — re-read fresh inside the lock, so a call that lost
   * the race sees the other's write and no-ops; (2) even across a restart,
   * the epic must still be CHILDLESS — the exact same test `playEpic` used to
   * decide to decompose in the first place, so an already-ingested epic can
   * never be ingested again even if a crash happened between creating the
   * children and marking the run `done`.
   */
  private async reconcileOne(projectId: string, epicId: string): Promise<void> {
    return withPathLock(`roadmap-decomposition:${projectId}:${epicId}`, async () => {
      const epic = await this.roadmap.get(projectId, epicId);
      const last = epic.runs[epic.runs.length - 1];
      if (!last || last.outcome !== "running") return;

      const siblings = await this.roadmap.list(projectId);
      if (siblings.some((i) => i.parentId === epicId)) {
        // Already ingested (or genuinely already has children from elsewhere) —
        // never ingest a second time; just close out the run record.
        await this.markRunOutcome(projectId, epicId, last, "done");
        return;
      }

      const task = await this.scheduledTasks.get(last.taskId).catch(() => null);
      if (!task?.outcome) return; // still running, or the task record is gone — try again later

      if (task.outcome.status === "error" || !task.runRef) {
        await this.finishFailed(projectId, epicId, last);
        return;
      }

      const log = await this.agentRunner
        .readLog(task.runRef, 0)
        .then((chunk) => chunk.content)
        .catch(() => "");
      const artifact = extractDecompositionArtifact(log);
      if (!artifact) {
        await this.finishFailed(projectId, epicId, last);
        return;
      }

      const now = new Date().toISOString();
      const { items: children, droppedEdges } = ingestDecomposition(artifact, epic, now);
      for (const child of children) {
        await this.roadmap.put(child);
      }
      await this.markRunOutcome(projectId, epicId, last, "done");
      void this.activity.record({
        kind: "roadmap-item-outcome",
        summary: `Decomposition done — ${children.length} child task(s) created`,
        refs: { projectId, itemId: epicId, status: "done", taskId: last.taskId },
      });
      if (droppedEdges > 0) {
        this.log.warn("decomposition ingest dropped invalid dependsOn ordinal(s)", {
          projectId,
          itemId: epicId,
          droppedEdges,
        });
      }
    });
  }

  private async finishFailed(
    projectId: string,
    epicId: string,
    run: RoadmapItemRun,
  ): Promise<void> {
    await this.markRunOutcome(projectId, epicId, run, "failed");
    void this.activity.record({
      kind: "roadmap-item-outcome",
      summary: "Decomposition run finished with no usable artifact",
      refs: { projectId, itemId: epicId, status: "failed", taskId: run.taskId },
    });
  }

  private async markRunOutcome(
    projectId: string,
    epicId: string,
    run: RoadmapItemRun,
    outcome: "done" | "failed",
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.roadmap.update(projectId, epicId, (current) => ({
      ...current,
      runs: current.runs.map((r) =>
        r.taskId === run.taskId ? { ...r, outcome, finishedAt: now } : r,
      ),
      updatedAt: now,
    }));
  }
}
