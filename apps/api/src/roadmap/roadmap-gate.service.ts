import { Inject, Injectable, forwardRef } from "@nestjs/common";
import type { Project, RoadmapItem, RoadmapItemRun } from "@zibby/contracts";
import { isBlocked } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
// 125e — see `project-pr.service.ts`'s import comment for why this needs `forwardRef`.
import { ProjectPrService } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { withPathLock } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { TaskRunsService } from "../tasks/task-runs.service";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { RoadmapDecompositionService } from "./roadmap-decomposition.service";
import { buildRoadmapTaskText } from "./roadmap-task-text";
import { RoadmapItemLifecycleError } from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";

/** Parse a PR number out of a GitHub PR url (`.../pull/123`); `undefined` if it doesn't match. */
export function parsePrNumberFromUrl(url: string): number | undefined {
  const match = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Phase 125e — the dependency gate: the ONE thing that decides when a roadmap item
 * may become a real `ScheduledTask`. See `docs/plans/phase-125-project-roadmap.md`
 * ("The dependency problem", "Lifecycle", "Play → task") and `docs/api/roadmap.md`
 * for the full picture; this docblock covers only this service's own shape.
 *
 * **Where a dispatch may come from.** Two provenances, and only two: an operator's
 * `play`/`playBulk`/`restart`/`resume` click, or {@link autoPickup} on a project
 * that has explicitly opted in via `RoadmapConfig.autoPlay` (off by default, set
 * per project on the Integrations tab). The opt-in IS the operator's consent —
 * standing instead of per-item. Neither provenance reaches past the merge gate:
 * this service only ever creates a task on its own branch and waits, so Law 3
 * ("no autonomous commit to the outside world") holds unchanged — nothing here
 * merges, pushes to a shared branch, or deploys.
 *
 * **Play records intent only.** `play`/`playBulk`/`restart` stamp `lifecycle:
 * "enqueued"` + `enqueuedAt` and immediately attempt a {@link drain} — they never
 * create a task themselves. `override` sets the Tier-3 `overrideBlocked` flag and,
 * if the item is already `enqueued`, also attempts a drain.
 *
 * **The gate.** {@link drain} lists a project's `enqueued` items, sorts them FIFO by
 * `enqueuedAt`, and releases (creates a task for) every one NOT `isBlocked` (imported
 * from `@zibby/contracts`, never reimplemented). It asks one question only — "are
 * this item's dependencies done" — and answers it for as many items as qualify.
 *
 * **Concurrency is deliberately NOT this gate's job.** A roadmap-only cap was tried
 * and removed: "how many roadmap items may run" and 125c's `maxConcurrentRuns` are
 * the same question asked twice, and two such numbers in `/settings` can only
 * confuse or disagree. `TaskSchedulerService.createTask` owns it — it decides
 * whether a release dispatches immediately or gets `queued`/held, and it is what
 * keeps an `autoPlay` project from starting a whole twenty-task epic at once. Either
 * way the roadmap item is `running` the moment its task exists; the task's own
 * queued-vs-dispatched fate is the scheduler's business.
 *
 * **Lifecycle completion** (`running` → `awaiting-merge`/`done`/`failed`) is driven
 * by {@link reconcileRunning}, which reads the gate-created task's own `outcome` —
 * NOT by a hook from `TaskSchedulerService` (that would need a second circular
 * provider edge on top of the one `ProjectPrService` already carries for the merge
 * signal; reading the task back by id avoids it entirely). Wiring a periodic call
 * to `reconcileRunning`/`reconcileAwaitingMerge` is 125h's job (the auto-sync tick);
 * this service ships the fully-tested mechanism now.
 *
 * **Release signals** (`awaiting-merge` → `done`): {@link onMerge} is
 * `ProjectPrService.recordMerge`'s eager, fire-and-forget hook; {@link
 * reconcileAwaitingMerge} is the poll counterpart (a later sub-phase's tick calls it
 * per project), reading `ProjectPrService.isMerged` — fail-CLOSED, so an unreadable
 * PR state never releases a downstream item.
 */
@Injectable()
export class RoadmapGateService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly roadmap: RoadmapStore,
    private readonly projects: ProjectsStorageService,
    private readonly taskScheduler: TaskSchedulerService,
    private readonly scheduledTasks: ScheduledTasksStorageService,
    private readonly taskRuns: TaskRunsService,
    @Inject(forwardRef(() => ProjectPrService)) private readonly projectPr: ProjectPrService,
    private readonly activity: ActivityLogService,
    private readonly decomposition: RoadmapDecompositionService,
    logger: LoggerService,
  ) {
    this.log = logger.child(RoadmapGateService.name);
  }

  // ---------------------------------------------------------------------
  // Play / override / restart / resume
  // ---------------------------------------------------------------------

  /**
   * Enqueue a `todo` item; 409 (via {@link RoadmapItemLifecycleError}) on any
   * other lifecycle. An EPIC is routed to {@link playEpic} first — "Play on
   * an epic" (master plan, 125g) never goes through the ordinary
   * todo-gated enqueue+drain path below, since an epic's own `lifecycle`
   * never advances (see `RoadmapDecompositionService`'s class docblock).
   */
  async play(projectId: string, itemId: string): Promise<RoadmapItem> {
    const item = await this.roadmap.get(projectId, itemId);
    if (item.level === "epic") return this.playEpic(projectId, item);
    if (item.lifecycle !== "todo") {
      throw new RoadmapItemLifecycleError(
        projectId,
        itemId,
        `is already in flight (lifecycle "${item.lifecycle}")`,
      );
    }
    await this.enqueue(projectId, itemId);
    await this.drain(projectId);
    return this.roadmap.get(projectId, itemId);
  }

  /**
   * "Play on an epic" (125g, master plan's decisions table): with children,
   * enqueue every `todo` child via the EXISTING `playBulk` FIFO path (never
   * duplicated here); childless, dispatch a decomposition run instead
   * (`RoadmapDecompositionService.dispatch`). Either way the epic ITSELF is
   * returned unchanged (its own `lifecycle` is never touched by Play — see
   * `RoadmapDecompositionService`'s docblock for why), so repeatedly
   * pressing Play on the same epic — before and after it gains children —
   * is always a safe, idempotent action rather than a one-shot gate.
   */
  private async playEpic(projectId: string, epic: RoadmapItem): Promise<RoadmapItem> {
    const items = await this.roadmap.list(projectId);
    const children = items.filter((i) => i.parentId === epic.id);
    if (children.length > 0) {
      const todoChildIds = children.filter((c) => c.lifecycle === "todo").map((c) => c.id);
      if (todoChildIds.length > 0) await this.playBulk(projectId, todoChildIds);
      return this.roadmap.get(projectId, epic.id);
    }
    return this.decomposition.dispatch(projectId, epic);
  }

  /**
   * Bulk play ("zařadit vše"). Preserves `itemIds`' order for FIFO — each id's
   * `enqueuedAt` is stamped a millisecond apart so array order survives even when
   * every id is processed within the same tick. An id that doesn't resolve to a real
   * item 404s the WHOLE call (a client bug, fail fast); an id that resolves but
   * isn't `todo` is silently skipped (idempotent — a multi-select naturally mixes
   * lifecycles once some cards are already in flight) rather than aborting the batch.
   * An EPIC id is skipped the same way (125g: an epic is never enqueued/released
   * through this generic path — it is only ever reached via {@link playEpic}'s
   * own "has children" branch, which calls this method with TASK ids only; a
   * bulk-play payload that happens to include an epic id — a multi-select
   * spanning the epic row — must not fall through to a bogus release() call).
   */
  async playBulk(projectId: string, itemIds: string[]): Promise<RoadmapItem[]> {
    const base = Date.now();
    const touched: string[] = [];
    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i]!;
      const item = await this.roadmap.get(projectId, itemId); // 404s on an unknown/unsafe id
      if (item.level === "epic" || item.lifecycle !== "todo") continue;
      await this.enqueue(projectId, itemId, base + i);
      touched.push(itemId);
    }
    await this.drain(projectId);
    return Promise.all(touched.map((id) => this.roadmap.get(projectId, id)));
  }

  /**
   * Tier-3 "pustit i tak". Sets the flag on any lifecycle (it only takes effect the
   * next time the gate evaluates the item); if the item is currently `enqueued`,
   * also attempts an immediate drain so a truly-blocked-only-by-this-dependency item
   * releases right away instead of waiting for the next unrelated drain trigger.
   */
  async override(
    projectId: string,
    itemId: string,
    overrideBlocked: boolean,
  ): Promise<RoadmapItem> {
    const updated = await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      overrideBlocked,
      updatedAt: new Date().toISOString(),
    }));
    if (updated.lifecycle === "enqueued") await this.drain(projectId);
    return this.roadmap.get(projectId, itemId);
  }

  /**
   * Restart a `failed` item with a brand-new task — the same enqueue+drain path as
   * `play`, just gated on `failed` instead of `todo`. Chosen (over silently reusing
   * the old run) because a `failed` item, by definition, never produced a usable
   * artifact — there is nothing safe to resume from; a fresh worktree off the
   * current `origin/<default>` is the only sound starting point. The prior run stays
   * in `runs[]` (history), a new entry is appended once the gate releases it.
   */
  async restart(projectId: string, itemId: string): Promise<RoadmapItem> {
    const item = await this.roadmap.get(projectId, itemId);
    if (item.lifecycle !== "failed") {
      throw new RoadmapItemLifecycleError(
        projectId,
        itemId,
        `can only be restarted from "failed" (currently "${item.lifecycle}")`,
      );
    }
    await this.enqueue(projectId, itemId);
    await this.drain(projectId);
    return this.roadmap.get(projectId, itemId);
  }

  /**
   * Resume a `failed` item's LAST run in place, reusing `TaskRunsService.resume` —
   * the same unified resume machinery the run detail already exposes (a parked
   * pipeline/goal resumes; an errored/interrupted agent run re-runs with
   * `--resume <sessionId>` when one was captured). Chosen over "restart" when the
   * run itself is resumable because it is strictly cheaper (continues the same
   * session/branch instead of starting over) — the operator gets both options on a
   * `failed` card and picks per case. 409s when the last run has no `runRef` at all
   * (never actually dispatched — e.g. `createTask` itself failed at release time) or
   * when `TaskRunsService.resume` itself rejects (not currently resumable).
   */
  async resume(projectId: string, itemId: string): Promise<RoadmapItem> {
    const item = await this.roadmap.get(projectId, itemId);
    if (item.lifecycle !== "failed") {
      throw new RoadmapItemLifecycleError(
        projectId,
        itemId,
        `can only be resumed from "failed" (currently "${item.lifecycle}")`,
      );
    }
    const lastRun = item.runs[item.runs.length - 1];
    if (!lastRun?.runRef) {
      throw new RoadmapItemLifecycleError(
        projectId,
        itemId,
        "has no resumable run — use restart instead",
      );
    }
    let resumed: { runId: string };
    try {
      resumed = await this.taskRuns.resume(lastRun.runRef);
    } catch (error) {
      throw new RoadmapItemLifecycleError(
        projectId,
        itemId,
        `could not be resumed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const now = new Date().toISOString();
    return this.roadmap.update(projectId, itemId, (current) => {
      const runs = [...current.runs];
      const idx = runs.length - 1;
      const prior = runs[idx];
      if (prior) {
        runs[idx] = {
          taskId: prior.taskId,
          runRef: resumed.runId,
          startedAt: now,
          outcome: "running",
        };
      }
      return { ...current, lifecycle: "running", runs, updatedAt: now };
    });
  }

  // ---------------------------------------------------------------------
  // Auto-pickup
  // ---------------------------------------------------------------------

  /**
   * The standing-consent counterpart of `play` — what `RoadmapTickService` calls
   * each tick for a project whose `RoadmapConfig.autoPlay` is on. The caller owns
   * that check; this method assumes consent and only decides WHAT is eligible.
   *
   * Two passes, tasks before epics — existing ready work is always preferred over
   * generating more of it:
   *
   * 1. Every unblocked `todo` TASK goes through the ordinary {@link playBulk}
   *    (never a second dispatch path): it enqueues them all and drains, so the
   *    cap — not this method — decides how many actually start. Blocked items are
   *    left alone rather than enqueued: they would sit `enqueued` until their
   *    dependency lands anyway, and a later tick picks them up the moment it
   *    clears, so the extra state buys nothing.
   * 2. Every childless epic that has NEVER been decomposed gets a decomposition
   *    run. "Never" is the whole guard — `runs.length === 0`, deliberately
   *    stricter than `hasRunningDecomposition`'s in-flight check that
   *    `playEpic` relies on. An epic whose decomposition FAILED, or whose run
   *    finished `done` without yielding a single child, must not be retried by a
   *    timer: at 60s a tick that is exactly a token-burning loop. It stays for the
   *    operator's own Play, which is unchanged and still the natural retry — the
   *    same reason a `failed` task is never auto-restarted here.
   *
   * Never throws: a decomposition that rejects (e.g. a race that armed a run
   * between the list and the dispatch) is logged and skipped, so one bad epic
   * cannot cost the project its whole pass.
   */
  async autoPickup(projectId: string): Promise<void> {
    const items = await this.roadmap.list(projectId);
    const get = (id: string) => items.find((i) => i.id === id);

    const todoTaskIds = items
      .filter((i) => i.level !== "epic" && i.lifecycle === "todo" && !isBlocked(i, get))
      .map((i) => i.id);
    if (todoTaskIds.length > 0) await this.playBulk(projectId, todoTaskIds);

    for (const epic of items) {
      if (epic.level !== "epic" || epic.lifecycle === "archived") continue;
      if (epic.runs.length > 0) continue;
      // Matches `playEpic`'s own childless test exactly — every child counts,
      // archived included — so the two entry points can never disagree.
      if (items.some((i) => i.parentId === epic.id)) continue;
      try {
        await this.decomposition.dispatch(projectId, epic);
      } catch (error) {
        this.log.warn("roadmap auto-decomposition failed for one epic — others unaffected", {
          projectId,
          itemId: epic.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Release signals
  // ---------------------------------------------------------------------

  /**
   * Eager release signal — `ProjectPrService.recordMerge`'s fire-and-forget hook.
   * Never throws (every failure is caught and logged, never surfaced) — a roadmap
   * bookkeeping failure must NEVER surface as a merge failure (Law 3/the master
   * plan): the merge already happened on GitHub regardless of what happens here.
   */
  async onMerge(projectId: string, prNumber: number): Promise<void> {
    try {
      const items = await this.roadmap.list(projectId);
      let any = false;
      for (const item of items) {
        if (item.lifecycle !== "awaiting-merge") continue;
        const last = item.runs[item.runs.length - 1];
        if (last?.prNumber !== prNumber) continue;
        await this.markDone(projectId, item.id, last);
        any = true;
      }
      if (any) await this.drain(projectId);
    } catch (error) {
      this.log.warn("roadmap onMerge failed (non-fatal — the merge itself already happened)", {
        projectId,
        prNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Poll counterpart of {@link onMerge} — resolves every `awaiting-merge` item's PR
   * state via `ProjectPrService.isMerged` (fail-CLOSED: an unreadable PR state never
   * releases a downstream item). Per-item try/catch so one item's failure never
   * blocks the rest. A periodic call is 125h's job; this method is the fully-tested
   * mechanism it will call.
   */
  async reconcileAwaitingMerge(projectId: string): Promise<void> {
    const items = await this.roadmap.list(projectId);
    let any = false;
    for (const item of items) {
      if (item.lifecycle !== "awaiting-merge") continue;
      const last = item.runs[item.runs.length - 1];
      if (last?.prNumber == null) continue;
      try {
        const merged = await this.projectPr.isMerged(projectId, last.prNumber);
        if (merged) {
          await this.markDone(projectId, item.id, last);
          any = true;
        }
      } catch (error) {
        this.log.warn("roadmap awaiting-merge poll failed for one item — stays awaiting-merge", {
          projectId,
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (any) await this.drain(projectId);
  }

  /**
   * Resolve every `running` item's task outcome (the mechanism behind "Lifecycle
   * completion" — see the class docblock for why this reads the task back by id
   * rather than a scheduler-side hook). Per-item try/catch. A `file`-output item
   * reaches `done` here directly, WITHOUT ever going through `awaiting-merge` — a
   * document can never be merged and must not wait for one.
   */
  async reconcileRunning(projectId: string): Promise<void> {
    const items = await this.roadmap.list(projectId);
    let anyDone = false;
    for (const item of items) {
      if (item.lifecycle !== "running") continue;
      const last = item.runs[item.runs.length - 1];
      if (!last) continue;
      try {
        if (await this.reconcileOne(projectId, item, last)) anyDone = true;
      } catch (error) {
        this.log.warn("roadmap running-item reconcile failed — stays running", {
          projectId,
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    // `done` only: `isBlocked` clears a dependency edge exactly when the blocker
    // reaches `done`, so a move to `awaiting-merge` or `failed` unblocks nobody and
    // a drain there would have nothing to release.
    if (anyDone) await this.drain(projectId);
  }

  /** Returns `true` when the item reached `done` — the only transition that can
   * unblock a dependent, and so the only one worth a drain. */
  private async reconcileOne(
    projectId: string,
    item: RoadmapItem,
    last: RoadmapItemRun,
  ): Promise<boolean> {
    const task = await this.scheduledTasks.get(last.taskId).catch(() => null);
    if (!task?.outcome) return false; // gone, or still running — nothing to reconcile yet

    if (task.outcome.status === "error") {
      await this.markFailed(projectId, item.id, last);
      return false;
    }

    const prUrl = task.outcome.pr?.url;
    if (prUrl) {
      await this.markAwaitingMerge(projectId, item.id, last, prUrl);
      return false;
    }
    if (task.output?.type === "file") {
      await this.markDone(projectId, item.id, last);
      return true;
    }
    // Expected an artifact (a `pr` output that never produced one, or any other
    // choice) and got neither — no artifact, so the item failed (master plan:
    // "No artifact / errored → failed").
    await this.markFailed(projectId, item.id, last);
    return false;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async enqueue(
    projectId: string,
    itemId: string,
    atMs: number = Date.now(),
  ): Promise<void> {
    const enqueuedAt = new Date(atMs).toISOString();
    await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      lifecycle: "enqueued",
      enqueuedAt,
      updatedAt: enqueuedAt,
    }));
  }

  /**
   * Release every unblocked `enqueued` item in a project, FIFO by `enqueuedAt`.
   * Locked per project (`roadmap-gate:<projectId>`) so two triggers racing (e.g. an
   * operator's `play` and an in-flight `onMerge`) can never both decide to release
   * the same item.
   *
   * No throttle here on purpose — see the class docblock: `TaskSchedulerService`'s
   * `maxConcurrentRuns` is the one concurrency ceiling, and it applies to the tasks
   * these releases create.
   */
  private async drain(projectId: string): Promise<void> {
    return withPathLock(`roadmap-gate:${projectId}`, async () => {
      const project = await this.projects.get(projectId).catch((): Project | null => null);
      if (!project) return; // project gone — nothing to dispatch into; items stay enqueued
      const items = await this.roadmap.list(projectId);
      const get = (id: string) => items.find((i) => i.id === id);
      const enqueued = items
        .filter((i) => i.lifecycle === "enqueued")
        .sort((a, b) => (a.enqueuedAt ?? "").localeCompare(b.enqueuedAt ?? ""));
      for (const item of enqueued) {
        if (isBlocked(item, get)) continue;
        try {
          await this.release(project, item, items);
        } catch (error) {
          await this.markReleaseFailed(projectId, item.id, error);
        }
      }
    });
  }

  /** Create the item's task (Play → task) and flip it to `running`. */
  private async release(
    project: Project,
    item: RoadmapItem,
    allItems: RoadmapItem[],
  ): Promise<void> {
    if (!project.path) {
      throw new Error(
        `project "${project.id}" has no local path configured — the gate cannot attribute a task to it`,
      );
    }
    const text = buildRoadmapTaskText(item, allItems);
    const result = await this.taskScheduler.createTask(
      {
        title: item.name,
        text,
        paths: [project.path],
        ...(item.attachmentSetId ? { attachmentSetId: item.attachmentSetId } : {}),
        output: item.output ?? { type: "pr" },
      },
      Date.now(),
      // trustedProjectId — NEVER: attribution stays server-derived via `paths`
      // (Law 4). explicitTarget — NEVER: "the classifier picks the target" (the
      // master plan's Play UX decision). background — false: the synchronous
      // server-side call pattern (`automations/scheduler.service.ts`), so the
      // gate always learns the real outcome (dispatched/pending/scheduled)
      // before it writes the item's `running` run record.
      undefined,
      undefined,
      false,
    );
    const now = new Date().toISOString();
    const run: RoadmapItemRun = {
      taskId: result.task.id,
      ...(result.outcome === "dispatched" ? { runRef: result.runRef } : {}),
      startedAt: now,
      outcome: "running",
    };
    await this.roadmap.update(item.projectId, item.id, (current) => ({
      ...current,
      lifecycle: "running",
      runs: [...current.runs, run],
      updatedAt: now,
    }));
    void this.activity.record({
      kind: "roadmap-item-dispatched",
      summary: `Roadmap item dispatched: ${item.name}`,
      refs: { projectId: item.projectId, itemId: item.id, taskId: result.task.id },
    });
  }

  /** A release itself failed (e.g. `createTask` threw) — no task/run to record. */
  private async markReleaseFailed(
    projectId: string,
    itemId: string,
    error: unknown,
  ): Promise<void> {
    this.log.warn("roadmap item release failed — marking failed", {
      projectId,
      itemId,
      error: error instanceof Error ? error.message : String(error),
    });
    await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      lifecycle: "failed",
      updatedAt: new Date().toISOString(),
    }));
    void this.activity.record({
      kind: "roadmap-item-outcome",
      summary: "Roadmap item failed to dispatch",
      refs: { projectId, itemId, status: "failed" },
    });
  }

  private async markFailed(projectId: string, itemId: string, run: RoadmapItemRun): Promise<void> {
    const now = new Date().toISOString();
    await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      lifecycle: "failed",
      runs: current.runs.map((r) =>
        r.taskId === run.taskId ? { ...r, outcome: "failed" as const, finishedAt: now } : r,
      ),
      updatedAt: now,
    }));
    void this.activity.record({
      kind: "roadmap-item-outcome",
      summary: "Roadmap item run finished with no artifact — marked failed",
      refs: { projectId, itemId, status: "failed", taskId: run.taskId },
    });
  }

  private async markAwaitingMerge(
    projectId: string,
    itemId: string,
    run: RoadmapItemRun,
    prUrl: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const prNumber = parsePrNumberFromUrl(prUrl);
    if (prNumber === undefined) {
      this.log.warn("roadmap item's PR url did not parse a PR number — merge poll can't find it", {
        projectId,
        itemId,
        prUrl,
      });
    }
    await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      lifecycle: "awaiting-merge",
      runs: current.runs.map((r) =>
        r.taskId === run.taskId
          ? {
              ...r,
              outcome: "awaiting-merge" as const,
              prUrl,
              ...(prNumber !== undefined ? { prNumber } : {}),
            }
          : r,
      ),
      updatedAt: now,
    }));
  }

  /** Terminal `done` — a merge (onMerge/reconcileAwaitingMerge) or a document artifact (reconcileRunning). */
  private async markDone(projectId: string, itemId: string, run: RoadmapItemRun): Promise<void> {
    const now = new Date().toISOString();
    const updated = await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      lifecycle: "done",
      runs: current.runs.map((r) =>
        r.taskId === run.taskId ? { ...r, outcome: "done" as const, finishedAt: now } : r,
      ),
      updatedAt: now,
    }));
    void this.activity.record({
      kind: "roadmap-item-outcome",
      summary: `Roadmap item done: ${updated.name}`,
      refs: { projectId, itemId, status: "done", taskId: run.taskId },
    });
  }
}
