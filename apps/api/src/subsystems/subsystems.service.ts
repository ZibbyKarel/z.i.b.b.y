import { Injectable } from "@nestjs/common";
import {
  SUBSYSTEMS,
  type SubsystemId,
  type SubsystemState,
  type SubsystemWithStatus,
  type UnownedEntity,
} from "@zibby/contracts";
import type { Approval } from "@zibby/contracts";
import type { TaskRun } from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ChainsStorageService } from "../chains/chains.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { TaskRunsService } from "../tasks/task-runs.service";
import { SubsystemSeenStore } from "./subsystem-seen.store";
import { SubsystemNotFoundError } from "./subsystems.errors";

/**
 * Precedence when several conditions apply to the SAME subsystem — waiting-on-you
 * must never be masked by ambient activity. Distinct from {@link LIST_ORDER_RANK}:
 * this only decides which single `state` wins for one subsystem.
 */
const STATE_PRECEDENCE: Record<SubsystemState, number> = {
  waiting: 0,
  running: 1,
  report: 2,
  idle: 3,
};

/**
 * `list()`'s severity ordering ACROSS subsystems: `waiting` first, then `report`,
 * then `running`, then `idle` — a Tier-2 report outranks quiet ambient Tier-1 work
 * for "what needs a look" purposes, even though `running` outranks `report` in
 * {@link STATE_PRECEDENCE} for a single subsystem's headline state.
 */
const LIST_ORDER_RANK: Record<SubsystemState, number> = {
  waiting: 0,
  report: 1,
  running: 2,
  idle: 3,
};

interface Aggregate {
  state: SubsystemState;
  tier2Count: number;
  tier3Count: number;
}

/** A pipeline run owned by a subsystem, kept around for the approval-attribution pass. */
interface OwnedPipelineRun {
  runId: string;
  owner: SubsystemId;
}

/**
 * Phase 82 — real aggregation, replacing the phase-80 stub. A thin layer over
 * EXISTING domain services (pipelines/chains storage for `ownerSubsystem`
 * attribution, the unified task-runs feed for run state, the approvals service
 * for pending Tier-3 items) — it duplicates no run/approval semantics, only
 * reads and correlates.
 *
 * Per subsystem, in precedence order `waiting > running > report > idle`:
 * - `running`: an owned pipeline/chain has a currently-`running` run.
 * - `waiting` (+ `tier3Count`): pending approvals attributable to an owned
 *   pipeline's run. Attribution mirrors the web's `approvalForRun` matching
 *   (`apps/web/features/runs/run.ts`) — a `pipeline-output` approval's `runId`
 *   IS the pipeline run id; a `pipeline-stage` approval's `runId` is the STAGE
 *   run id, prefixed with the pipeline run id (`${pipelineRunId}.${phaseId}_…`).
 *   Every other approval kind (`agent`, `channel`, `task`, `proposed-task`,
 *   `task-output`, `jira-issue`, `machine`, `agent-proposal`) has no pipeline to
 *   attribute through and is silently excluded — no data loss, the global
 *   approvals surface still shows it; this is a lens.
 * - `report` (+ `tier2Count`): owned pipeline/chain runs that went terminal
 *   (`done` or `error`) after the subsystem's `lastSeenAt` (`SubsystemSeenStore`).
 *   Neither `PipelineRun` nor `ChainRun` carries its own completion timestamp,
 *   so this uses the best available signal: the backing task's
 *   `taskOutcomeFinishedAt` when the run was dispatched from one, else the
 *   run's own `startedAt` (close enough for a coarse "since last visit" read —
 *   phase 82 scope; a run's own finish time can be added later without
 *   affecting this shape).
 *
 * Counts are independent of the headline `state` — a subsystem can carry a
 * `tier2Count` while its state reads `waiting` because a Tier-3 item outranks it.
 */
@Injectable()
export class SubsystemsService {
  constructor(
    private readonly pipelines: PipelinesStorageService,
    private readonly chains: ChainsStorageService,
    private readonly taskRuns: TaskRunsService,
    private readonly approvals: ApprovalsService,
    private readonly seen: SubsystemSeenStore,
    private readonly agents: AgentsStorageService,
    private readonly integrations: IntegrationsStorageService,
  ) {}

  /**
   * All eight subsystems with real status, sorted for LISTS/BRIEFINGS: `waiting`
   * first (by `tier3Count` desc), then `report` (by `tier2Count` desc), then
   * `running`, then `idle`; registry order is the stable tiebreak ("report
   * severity, not recency, drives ordering" — design doc). The web subsystem
   * STRIP does not consume this ordering — it keeps every node at a FIXED
   * position (nodes never move); this sort exists for feeds that read the list
   * top-to-bottom, not for the strip's layout.
   */
  async list(): Promise<SubsystemWithStatus[]> {
    const aggregates = await this.aggregateAll();
    const rows = SUBSYSTEMS.map((subsystem) => withAggregate(subsystem, aggregates));
    return [...rows].sort((a, b) => {
      const rankDiff = LIST_ORDER_RANK[a.state] - LIST_ORDER_RANK[b.state];
      if (rankDiff !== 0) return rankDiff;
      if (a.state === "waiting") return b.tier3Count - a.tier3Count;
      if (a.state === "report") return b.tier2Count - a.tier2Count;
      return 0; // Array#sort is stable → registry order survives as the tiebreak.
    });
  }

  /** A single subsystem by id; throws `SubsystemNotFoundError` for an unknown id. */
  async get(id: string): Promise<SubsystemWithStatus> {
    const subsystem = this.find(id);
    const aggregates = await this.aggregateAll();
    return withAggregate(subsystem, aggregates);
  }

  /**
   * Acknowledge `id`'s Tier-2 reports (the operator opened its drawer) —
   * resets its `report` window to now and returns the refreshed entry. Tier-3
   * (`waiting`) items are untouched: they resolve only through the approvals
   * flow, a different acknowledgment model (design doc).
   */
  async markSeen(id: string): Promise<SubsystemWithStatus> {
    const subsystem = this.find(id);
    await this.seen.markSeen(subsystem.id);
    return this.get(id);
  }

  /**
   * NS2 F1b — every stored pipeline/chain/agent/integration that still has no
   * `ownerSubsystem`. A report list, not a health signal (the health read-model
   * is a closed infra enum — not the place for an ownership gap): the
   * owner-backfill sweep runs once at boot, so this is `[]` in steady state and
   * only surfaces a NEWLY unowned entity (a hand-edited file, or a write path
   * that somehow slipped past the create-time 422).
   */
  async listUnowned(): Promise<UnownedEntity[]> {
    const [pipelines, chains, agents, integrations] = await Promise.all([
      this.pipelines.list(),
      this.chains.list(),
      this.agents.list(),
      this.integrations.list(),
    ]);
    return [
      ...pipelines
        .filter((p) => !p.ownerSubsystem)
        .map((p) => ({ kind: "pipeline" as const, id: p.id })),
      ...chains.filter((c) => !c.ownerSubsystem).map((c) => ({ kind: "chain" as const, id: c.id })),
      ...agents.filter((a) => !a.ownerSubsystem).map((a) => ({ kind: "agent" as const, id: a.id })),
      ...integrations
        .filter((i) => !i.ownerSubsystem)
        .map((i) => ({ kind: "integration" as const, id: i.id })),
    ];
  }

  private find(id: string) {
    const subsystem = SUBSYSTEMS.find((s) => s.id === id);
    if (!subsystem) throw new SubsystemNotFoundError(id);
    return subsystem;
  }

  /**
   * The full aggregation pass, computed once and read for both `list()` and
   * `get()` — at eight subsystems and a handful of runs/approvals this is
   * cheap enough that a single-id fast path would only add complexity, not
   * measurable speed.
   */
  private async aggregateAll(): Promise<Map<SubsystemId, Aggregate>> {
    const [pipelines, chains, runs, pendingApprovals] = await Promise.all([
      this.pipelines.list(),
      this.chains.list(),
      this.taskRuns.listTaskRuns(),
      this.approvals.list("pending"),
    ]);

    const pipelineOwner = new Map<string, SubsystemId>();
    for (const p of pipelines) if (p.ownerSubsystem) pipelineOwner.set(p.id, p.ownerSubsystem);
    const chainOwner = new Map<string, SubsystemId>();
    for (const c of chains) if (c.ownerSubsystem) chainOwner.set(c.id, c.ownerSubsystem);

    const lastSeenById = new Map<SubsystemId, string>(
      await Promise.all(SUBSYSTEMS.map(async (s) => [s.id, await this.seen.seenAt(s.id)] as const)),
    );

    const running = new Set<SubsystemId>();
    const tier2Count = new Map<SubsystemId, number>();
    const ownedPipelineRuns: OwnedPipelineRun[] = [];

    for (const run of runs) {
      const owner =
        run.kind === "pipeline"
          ? pipelineOwner.get(run.owner)
          : run.kind === "chain"
            ? chainOwner.get(run.owner)
            : undefined;
      if (!owner) continue;
      if (run.kind === "pipeline") ownedPipelineRuns.push({ runId: run.runId, owner });

      if (run.status === "running") running.add(owner);

      if (run.status === "done" || run.status === "error") {
        const completedAt = completionSignal(run);
        const lastSeen = lastSeenById.get(owner);
        if (lastSeen !== undefined && completedAt > lastSeen) {
          tier2Count.set(owner, (tier2Count.get(owner) ?? 0) + 1);
        }
      }
    }

    const tier3Count = new Map<SubsystemId, number>();
    for (const approval of pendingApprovals) {
      const owner = attributeApproval(approval, ownedPipelineRuns);
      if (!owner) continue;
      tier3Count.set(owner, (tier3Count.get(owner) ?? 0) + 1);
    }

    const result = new Map<SubsystemId, Aggregate>();
    for (const s of SUBSYSTEMS) {
      const t3 = tier3Count.get(s.id) ?? 0;
      const t2 = tier2Count.get(s.id) ?? 0;
      const candidates: SubsystemState[] = [
        ...(t3 > 0 ? (["waiting"] as const) : []),
        ...(running.has(s.id) ? (["running"] as const) : []),
        ...(t2 > 0 ? (["report"] as const) : []),
        "idle",
      ];
      const state = candidates.reduce((best, candidate) =>
        STATE_PRECEDENCE[candidate] < STATE_PRECEDENCE[best] ? candidate : best,
      );
      result.set(s.id, { state, tier2Count: t2, tier3Count: t3 });
    }
    return result;
  }
}

/** Best-available completion signal for a terminal run — see the class doc for why. */
function completionSignal(run: TaskRun): string {
  return run.taskOutcomeFinishedAt ?? run.startedAt;
}

/**
 * The owned pipeline run a pending approval belongs to, or `undefined` when it
 * doesn't attribute to any owned pipeline. Mirrors `approvalForRun`
 * (`apps/web/features/runs/run.ts`): a `pipeline-output` approval's `runId` IS
 * the pipeline run id (exact match); a `pipeline-stage` approval's `runId` is
 * the stage run id, which is the pipeline run id plus a `.<phaseId>_…` suffix
 * (prefix match).
 */
function attributeApproval(
  approval: Pick<Approval, "runId">,
  ownedPipelineRuns: readonly OwnedPipelineRun[],
): SubsystemId | undefined {
  const match = ownedPipelineRuns.find(
    (r) => approval.runId === r.runId || approval.runId.startsWith(`${r.runId}.`),
  );
  return match?.owner;
}

function withAggregate(
  subsystem: (typeof SUBSYSTEMS)[number],
  aggregates: Map<SubsystemId, Aggregate>,
): SubsystemWithStatus {
  const aggregate = aggregates.get(subsystem.id) ?? { state: "idle", tier2Count: 0, tier3Count: 0 };
  return { ...subsystem, ...aggregate };
}
