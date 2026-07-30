import { Inject, Injectable, forwardRef } from "@nestjs/common";
import type {
  Project,
  RoadmapItem,
  RoadmapItemRun,
  RoutingProposal,
  SubsystemId,
  TaskOutput,
  TaskRouting,
  TaskTarget,
} from "@zibby/contracts";
import { SUBSYSTEMS, isBlocked } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ProjectLocalService } from "../projects/project-local.service";
// 125e — see `project-pr.service.ts`'s import comment for why this needs `forwardRef`.
import { ProjectPrService } from "../projects/project-pr.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { collisionResistantId, withPathLock } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { TaskClassifierService } from "../tasks/task-classifier.service";
import { TaskRunsService } from "../tasks/task-runs.service";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { writeRoadmapBackRef } from "./roadmap-back-ref";
import { RoadmapDecompositionService } from "./roadmap-decomposition.service";
import { buildRoadmapRoutingText, buildRoadmapTaskText } from "./roadmap-task-text";
import { RoadmapItemLifecycleError } from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";
import { RoutingProposalStore } from "./routing-proposal.store";

/**
 * The subsystem a roadmap release falls back to when the switchboard can't tell
 * whose domain an item belongs to. Forge, because a roadmap item is by
 * construction delivery work on a code project — and because forge is the only
 * subsystem that owns both a delivery pipeline and specialist agents, so it is
 * the one that can actually make the "small change vs. full pipeline" call.
 *
 * Only a FALLBACK: `TaskClassifierService.classifySubsystem` still gets to pick
 * any seated subsystem, so a research- or content-shaped item can legitimately
 * route to scout. If a project ever needs a different default, this is the value
 * to promote to a `RoadmapConfig` field — not a reason to widen it speculatively
 * now.
 */
export const DEFAULT_ROADMAP_SUBSYSTEM: SubsystemId = "forge";

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
    private readonly projectLocal: ProjectLocalService,
    private readonly taskScheduler: TaskSchedulerService,
    /** The stage-1 "whose domain is this?" call for a release — see {@link classifySubsystem}. */
    private readonly classifier: TaskClassifierService,
    private readonly scheduledTasks: ScheduledTasksStorageService,
    private readonly taskRuns: TaskRunsService,
    @Inject(forwardRef(() => ProjectPrService)) private readonly projectPr: ProjectPrService,
    private readonly activity: ActivityLogService,
    private readonly decomposition: RoadmapDecompositionService,
    /** NS2 F10 — the parked Tier-3 routing questions (see {@link parkForRouting}). */
    private readonly proposals: RoutingProposalStore,
    /** NS2 F10 — the gate a parked routing question waits behind. */
    private readonly approvals: ApprovalsService,
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
      await this.markFailed(
        projectId,
        item.id,
        last,
        task.outcome.summary || "Run errored with no summary captured.",
      );
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
    await this.markFailed(
      projectId,
      item.id,
      last,
      "Run finished without producing an artifact (no PR or file output).",
    );
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
      // NS2 F10 — one parked routing question per item, by construction. Without
      // this the park would loop: `autoPickup` re-enqueues every unblocked item on
      // each tick, so an `autoPlay` project would stack a fresh approval per tick for
      // the same undecidable item. Checked HERE rather than by flipping the item's
      // lifecycle out of `enqueued`, because that flip would only move the loop —
      // `autoPickup` picks `todo` items up again — while also churning a file write
      // per tick. Staying `enqueued` is the honest state anyway: the item IS in
      // flight, waiting on the operator.
      const parked = await this.pendingRoutingItemIds(projectId);
      for (const item of enqueued) {
        if (isBlocked(item, get)) continue;
        if (parked.has(item.id)) continue;
        try {
          await this.release(project, item, items);
        } catch (error) {
          await this.markReleaseFailed(projectId, item.id, error);
        }
      }
    });
  }

  /**
   * NS2 F10 — release an item to a routing target the OPERATOR has just approved
   * (`RoutingProposalService.resume`), bypassing stage-1 classification entirely: the
   * question the classifier couldn't answer has now been answered by a human, so
   * asking it again would be both wasteful and capable of disagreeing with the
   * decision being honoured.
   *
   * Takes the same per-project gate lock as {@link drain} (a fresh acquisition — the
   * approval decision arrives on its own call stack, never inside a drain), so an
   * approval landing while a drain is in flight can't double-release the item.
   * Re-reads the item under that lock and refuses anything not still `enqueued`, which
   * is the state {@link parkForRouting} leaves it in — a second approval, or an item
   * that has moved on since, is then a no-op instead of a duplicate task.
   */
  async releaseRouted(projectId: string, itemId: string, target: TaskTarget): Promise<void> {
    return withPathLock(`roadmap-gate:${projectId}`, async () => {
      const project = await this.projects.get(projectId).catch((): Project | null => null);
      if (!project) return;
      const items = await this.roadmap.list(projectId);
      const item = items.find((i) => i.id === itemId);
      if (!item || item.lifecycle !== "enqueued") {
        this.log.info("routing approval: item is no longer parked — skipping release", {
          projectId,
          itemId,
          lifecycle: item?.lifecycle ?? "missing",
        });
        return;
      }
      try {
        await this.release(project, item, items, target);
      } catch (error) {
        await this.markReleaseFailed(projectId, itemId, error);
      }
    });
  }

  /**
   * Create the item's task (Play → task) and flip it to `running`.
   *
   * NS2 F10 — `approvedTarget` is the operator-approved stage-1 target from
   * {@link releaseRouted}; when present, classification is skipped and this target is
   * used verbatim. When absent (the ordinary drain path) stage 1 runs as before, and
   * an AMBIGUOUS verdict diverts to {@link parkForRouting} instead of dispatching —
   * this method then returns without creating a task and without touching `runs[]`.
   */
  private async release(
    project: Project,
    item: RoadmapItem,
    allItems: RoadmapItem[],
    approvedTarget?: TaskTarget,
  ): Promise<void> {
    // `project.path` is optional (Phase 98) — most projects live at
    // `<cloneRoot>/<project.id>` instead, and `resolveForRun` already knows how
    // to find that (or auto-clone it from `gitRemote` when it isn't there yet).
    // Throws `ProjectLocalUnresolvedError` only when NEITHER `path` nor a
    // cloneRoot clone nor a `gitRemote` resolves anything — caught by `drain`'s
    // per-item try/catch same as any other release failure.
    const local = await this.projectLocal.resolveForRun(project);
    const text = buildRoadmapTaskText(item, allItems);
    // The item's own words, footer-free. Used for BOTH routing stages: stage 1 here and
    // stage 2 inside `createTask` (via `CreateTaskInput.routingText`), so the framing
    // `text` carries for the actor never reaches a ranker.
    const routingText = buildRoadmapRoutingText(item);
    // The sink this release REQUIRES — the same value stamped on the task below, but
    // needed BEFORE routing, because it constrains which units are eligible at all
    // (`ClassifyTaskInput.output`). A roadmap item defaults to a PR: an imported issue
    // is by construction "implement this → PR".
    const output = item.output ?? { type: "pr" as const };
    const routing = approvedTarget
      ? null
      : await this.classifySubsystem(routingText, local.path, output);
    // NS2 F10 — the Tier-3 exit. An ambiguous stage-1 verdict means the switchboard
    // weighed two subsystems and couldn't separate them; on this path nobody is
    // watching a preview, and guessing wrong costs an entire wrong subsystem's run.
    // So park and ask. Returning HERE (before `createTask`) is load-bearing: the item
    // must never reach `lifecycle: "running"` without a task, or `reconcileRunning`
    // kills it as "Run finished without producing an artifact".
    if (routing?.ambiguous) {
      await this.parkForRouting(item, text, local.path, routing);
      return;
    }
    const result = await this.taskScheduler.createTask(
      {
        title: item.name,
        text,
        routingText,
        paths: [local.path],
        ...(item.attachmentSetId ? { attachmentSetId: item.attachmentSetId } : {}),
        output,
      },
      Date.now(),
      // trustedProjectId = item.projectId: the roadmap item's own foreign key,
      // not client-asserted text — exactly the "server-side caller already
      // matched the engagement" carve-out `createTask`'s own docblock names
      // (same pattern `channel-triage-flow.service.ts`'s tier-1 dispatch uses).
      // `paths`-based attribution (`matchProject`) can't be relied on here: it
      // only ever matches a project's STORED `path` field, which a Phase-98
      // project like this one legitimately never sets.
      project.id,
      // explicitTarget = the SUBSYSTEM this item belongs to (see
      // `classifySubsystem` below), or `undefined` when no subsystem is seated
      // — in which case this falls back to the old undirected full-catalog
      // classify rather than failing. background — false: the synchronous
      // server-side call pattern (`automations/scheduler.service.ts`), so the
      // gate always learns the real outcome (dispatched/pending/scheduled)
      // before it writes the item's `running` run record.
      //
      // NS2 F10: `approvedTarget` (an operator's answer to a parked routing
      // question) takes precedence — it IS the explicit target, and an explicit
      // target is a hard override by contract.
      approvedTarget ?? routing?.target,
      false,
    );
    // The reverse edge (task -> item), so the run detail can link back to the
    // issue without scanning every project's roadmap. Best-effort on purpose:
    // the release itself already happened and the FORWARD edge below is the
    // authoritative one — a failed back-ref must never fail a dispatch.
    await writeRoadmapBackRef(this.scheduledTasks, this.log, result.task.id, item);
    await this.writeClassificationTrace(result.task.id, routing);
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

  /**
   * NS2 F10 — the Tier-3 park: persist the routing question and hand the operator one
   * clear decision instead of guessing which subsystem owns the item.
   *
   * **The item's lifecycle is left alone (`enqueued`).** Idempotency comes from
   * {@link pendingRoutingItemIds}, which {@link drain} consults before releasing — not
   * from moving the item out of the enqueued set. Moving it would not actually stop
   * the loop: `autoPickup` re-enqueues every unblocked `todo` item on each tick, so a
   * `todo` flip would re-park the same item every tick AND churn a write each time.
   * Staying `enqueued` also reads honestly on the board — the item is in flight,
   * blocked on the operator rather than on a dependency.
   *
   * Adding a dedicated `awaiting-routing` lifecycle would say it more precisely, at
   * the cost of rippling through `roadmapReadiness`, the board's columns and their
   * i18n; that is the follow-up if the enqueued reading proves confusing, not a
   * reason to hold this.
   */
  private async parkForRouting(
    item: RoadmapItem,
    text: string,
    projectPath: string,
    routing: TaskRouting,
  ): Promise<void> {
    const proposal: RoutingProposal = {
      id: collisionResistantId("routing"),
      projectId: item.projectId,
      itemId: item.id,
      text,
      projectPath,
      pick: routing.target,
      confidence: routing.confidence,
      reason: routing.reason,
      runnerUp: routing.runnerUp,
      createdAt: new Date().toISOString(),
    };
    await this.proposals.create(proposal);
    await this.approvals.requestApproval({
      runId: proposal.id,
      kind: "routing-proposal",
      skill: "switchboard",
      action: "route",
      // Both candidates, because the whole reason this is parked is that the two
      // were inseparable — showing only the winner would hide the actual question.
      detail: routingQuestion(item.name, routing),
      risk: "medium",
      ...(routing.target.kind === "subsystem" ? { ownerSubsystem: routing.target.id } : {}),
    });
    this.log.info("roadmap release parked for a routing decision", {
      projectId: item.projectId,
      itemId: item.id,
      proposalId: proposal.id,
      pick: routing.target.kind === "subsystem" ? routing.target.id : routing.target.kind,
      confidence: routing.confidence,
    });
    void this.activity.record({
      kind: "approval-requested",
      summary: `Routing needs you: ${routingQuestion(item.name, routing)}`,
      refs: { projectId: item.projectId, itemId: item.id },
    });
  }

  /**
   * NS2 F10 — the item ids in a project that already have a parked routing question,
   * so {@link drain} can skip them instead of re-asking. A scan of a directory that
   * holds one file per OPEN question (each is deleted on approve or reject), read once
   * per drain rather than per item — the same "check before you fire again" shape as
   * `HandoffFiredStore.hasFired`. Fail-open: an unreadable store yields an empty set,
   * so a broken proposals dir degrades to today's guess-and-dispatch rather than
   * wedging every release.
   */
  private async pendingRoutingItemIds(projectId: string): Promise<Set<string>> {
    // try/catch, not `.catch()`: a store that throws SYNCHRONOUSLY never produces a
    // promise to attach a handler to, so `.catch()` alone would let the failure escape
    // and wedge the whole drain — the opposite of the fail-open this promises.
    try {
      const all = await this.proposals.list();
      return new Set(all.filter((p) => p.projectId === projectId).map((p) => p.itemId));
    } catch (error) {
      this.log.warn("routing-proposal scan failed — releasing without the park guard", {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Set();
    }
  }

  /**
   * NS2 F10 — the reject side of a parked routing question: drop the proposal and put
   * the item back to `todo`.
   *
   * `todo` (rather than leaving it `enqueued`) is what makes "no, I'll handle the
   * routing" stick: an enqueued item is exactly what the next drain would pick up, and
   * with the proposal now gone the idempotency guard would no longer hold it back — so
   * it would be re-classified and re-parked. Returning it to `todo` hands it to the
   * operator, whose re-entry is Play with the subsystem named explicitly (a hard
   * override that skips the classifier entirely).
   *
   * Reads the proposal BEFORE deleting it, since the item it points at is the only way
   * back to that lifecycle write. Never throws — the approval decision is already
   * recorded by the time this runs.
   */
  async cancelRouting(proposalId: string): Promise<void> {
    const proposal = await this.proposals.get(proposalId).catch((): RoutingProposal | null => null);
    if (proposal) {
      const now = new Date().toISOString();
      await this.roadmap
        .update(proposal.projectId, proposal.itemId, (current) => ({
          ...current,
          // Only un-enqueue an item still waiting on this question; one that has moved
          // on (a manual Play landed first) must not be dragged backwards.
          ...(current.lifecycle === "enqueued" ? { lifecycle: "todo" as const } : {}),
          updatedAt: now,
        }))
        .catch(() => null);
    }
    await this.proposals.delete(proposalId).catch(() => {});
    this.log.info("routing proposal rejected — item left with the operator", {
      proposalId,
      itemId: proposal?.itemId,
    });
  }

  /**
   * Ask the ONE question a gate release should ask the switchboard — "whose
   * domain is this?" — and let that subsystem pick its own unit
   * (`TaskSchedulerService.resolveSubsystemTarget` →
   * `TaskClassifierService.classifyWithinSubsystem`). This is the North-Star-2
   * Subsystem Charter applied to the roadmap: *"The global classifier only picks
   * the subsystem; the subsystem picks the unit."*
   *
   * It replaces the previous `explicitTarget: undefined` ("the classifier picks
   * the target", the original Phase-125 Play UX decision, which predates the F2
   * federation work). The practical difference: a narrow roadmap item can now
   * land on a single owned agent — forge's `fullstack-developer`, say — instead
   * of paying for Architekt → Kodér ⇄ Review → Tester → Dokumentátor, because
   * that pipeline-vs-agent call is made INSIDE forge with forge's mandate and
   * `EFFORT_RULE` in the prompt.
   *
   * {@link DEFAULT_ROADMAP_SUBSYSTEM} is nominated as the not-confident
   * fallback: a roadmap item is by construction delivery work on a code project.
   *
   * Never throws and never blocks a release. A classifier failure, or a
   * federation with no seated subsystem at all, returns `null` — the caller then
   * dispatches with no explicit target, i.e. exactly the old undirected
   * behaviour. Failing a release because the ROUTING lookup fell over would be a
   * strictly worse outcome than routing it the old way.
   */
  private async classifySubsystem(
    text: string,
    projectPath: string,
    output: TaskOutput,
  ): Promise<TaskRouting | null> {
    try {
      const routing = await this.classifier.classifySubsystem(
        { text, paths: [projectPath], output },
        DEFAULT_ROADMAP_SUBSYSTEM,
      );
      // Belt to `classifySubsystem`'s own braces: its catalog is subsystem-only
      // and seated-only by construction, so this can't fire — but a non-subsystem
      // target reaching `createTask` as an explicit target would bypass the whole
      // subsystem layer silently, which is worth one cheap check.
      if (routing && routing.target.kind !== "subsystem") return null;
      return routing;
    } catch (error) {
      this.log.warn("roadmap subsystem classify failed — releasing undirected instead", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Persist the stage-1 verdict onto the task so the run detail can still answer
   * "why did this land here". `TaskSchedulerService.dispatch` only builds a trace
   * when IT did the classifying, and this release hands it an explicit target —
   * so without this write the classification panel would go blank for exactly the
   * runs whose routing is most worth explaining. Best-effort, same posture as the
   * back-ref: a missing trace costs an explanation, never a dispatch.
   */
  private async writeClassificationTrace(
    taskId: string,
    routing: TaskRouting | null,
  ): Promise<void> {
    if (!routing || routing.target.kind !== "subsystem") return;
    try {
      await this.scheduledTasks.setClassification(taskId, {
        stage1: routing.target,
        confidence: routing.confidence,
        reason: routing.reason,
        matchedTerms: routing.matchedTerms,
        subsystem: routing.target.id,
      });
    } catch (error) {
      this.log.warn("roadmap classification trace write failed (non-fatal)", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** A release itself failed (e.g. `createTask` threw) — no task/run to record. */
  private async markReleaseFailed(
    projectId: string,
    itemId: string,
    error: unknown,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);
    this.log.warn("roadmap item release failed — marking failed", {
      projectId,
      itemId,
      error: reason,
    });
    await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      lifecycle: "failed",
      lastFailureReason: reason,
      updatedAt: new Date().toISOString(),
    }));
    void this.activity.record({
      kind: "roadmap-item-outcome",
      summary: "Roadmap item failed to dispatch",
      refs: { projectId, itemId, status: "failed" },
    });
  }

  private async markFailed(
    projectId: string,
    itemId: string,
    run: RoadmapItemRun,
    reason: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.roadmap.update(projectId, itemId, (current) => ({
      ...current,
      lifecycle: "failed",
      lastFailureReason: reason,
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

/** A routing target's operator-facing name — a subsystem's registry name, else its kind. */
function targetLabel(target: TaskTarget): string {
  if (target.kind === "subsystem") {
    return SUBSYSTEMS.find((s) => s.id === target.id)?.name ?? target.id;
  }
  return "id" in target ? target.id : target.kind;
}

/**
 * NS2 F10 — the one-line question an operator reads in the approvals queue. Names
 * BOTH candidates when there is a runner-up ("Forge, or Codex?") and falls back to
 * the weak-winner phrasing when the router named no alternative — the two are
 * genuinely different questions, and a single generic string would flatten the more
 * actionable one.
 */
function routingQuestion(itemName: string, routing: TaskRouting): string {
  const pick = targetLabel(routing.target);
  if (!routing.runnerUp) {
    return `"${itemName}" — no subsystem clearly owns this (best guess ${pick}). Release to ${pick}?`;
  }
  return `"${itemName}" — ${pick} or ${targetLabel(routing.runnerUp.target)}? Release to ${pick}?`;
}
