import { Injectable } from "@nestjs/common";
import {
  DEPARTMENTS,
  type DepartmentId,
  type DepartmentRoster,
  type DepartmentState,
  type DepartmentWithStatus,
  type SubtaskSummary,
  type UnownedEntity,
} from "@zibby/contracts";
import type { Approval } from "@zibby/contracts";
import type { TaskRun } from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { EmployeesStorageService } from "../employees/employees.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { MandateStorageService } from "../mandate/mandate.storage.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { TaskParentsService } from "../tasks/task-parents.service";
import { TaskRunsService } from "../tasks/task-runs.service";
import { DepartmentSeenStore } from "./department-seen.store";
import { DepartmentNotFoundError } from "./departments.errors";

/**
 * Precedence when several conditions apply to the SAME department — waiting-on-you
 * must never be masked by ambient activity. Distinct from {@link LIST_ORDER_RANK}:
 * this only decides which single `state` wins for one department.
 */
const STATE_PRECEDENCE: Record<DepartmentState, number> = {
  waiting: 0,
  error: 1,
  running: 2,
  report: 3,
  idle: 4,
};

/**
 * `list()`'s severity ordering ACROSS departments: `waiting` first, then `report`,
 * then `running`, then `idle` — a Tier-2 report outranks quiet ambient Tier-1 work
 * for "what needs a look" purposes, even though `running` outranks `report` in
 * {@link STATE_PRECEDENCE} for a single department's headline state.
 */
const LIST_ORDER_RANK: Record<DepartmentState, number> = {
  waiting: 0,
  error: 1,
  report: 2,
  running: 3,
  idle: 4,
};

interface Aggregate {
  state: DepartmentState;
  tier2Count: number;
  tier3Count: number;
  errorCount: number;
  errorRunIds: string[];
}

/** A pipeline run owned by a department, kept around for the approval-attribution pass. */
interface OwnedPipelineRun {
  runId: string;
  owner: DepartmentId;
}

/**
 * Phase 82 — real aggregation, replacing the phase-80 stub. A thin layer over
 * EXISTING domain services (pipelines storage for `department`
 * attribution, the unified task-runs feed for run state, the approvals service
 * for pending Tier-3 items) — it duplicates no run/approval semantics, only
 * reads and correlates.
 *
 * Per department, in precedence order `waiting > running > report > idle`:
 * - `running`: an owned pipeline OR an owned agent (Phase 126g — `Agent.department`,
 *   the same field the roster already reads) has a currently-`running` run.
 * - `waiting` (+ `tier3Count`): pending approvals attributable to an owned
 *   pipeline's run. Attribution mirrors the web's `approvalForRun` matching
 *   (`apps/web/features/runs/run.ts`) — a `pipeline-output` approval's `runId`
 *   IS the pipeline run id; a `pipeline-stage` approval's `runId` is the STAGE
 *   run id, prefixed with the pipeline run id (`${pipelineRunId}.${phaseId}_…`).
 *   Every other approval kind (`agent`, `channel`, `task`, `proposed-task`,
 *   `task-output`, `jira-issue`, `machine`, `agent-proposal`) has no pipeline to
 *   attribute through and is silently excluded — no data loss, the global
 *   approvals surface still shows it; this is a lens.
 * - `report` (+ `tier2Count`): owned pipeline OR agent runs that went terminal
 *   (`done` or `error`) after the department's `lastSeenAt` (`DepartmentSeenStore`).
 *   `PipelineRun` carries no completion timestamp of its own,
 *   so this uses the best available signal: the backing task's
 *   `taskOutcomeFinishedAt` when the run was dispatched from one, else the
 *   run's own `startedAt` (close enough for a coarse "since last visit" read —
 *   phase 82 scope; a run's own finish time can be added later without
 *   affecting this shape).
 *
 * Goal-kind (and not-yet-dispatched `scheduled`-kind) runs are deliberately left
 * unattributed (D16, `docs/plans/phase-126g-department-orb-agent-runs.md`) — no
 * `department` concept exists anywhere on the goal schemas.
 *
 * Counts are independent of the headline `state` — a department can carry a
 * `tier2Count` while its state reads `waiting` because a Tier-3 item outranks it.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly pipelines: PipelinesStorageService,
    private readonly taskRuns: TaskRunsService,
    private readonly approvals: ApprovalsService,
    private readonly seen: DepartmentSeenStore,
    private readonly agents: AgentsStorageService,
    private readonly integrations: IntegrationsStorageService,
    private readonly mandate: MandateStorageService,
    /** D-015: `roster()`'s agent membership derives from active employees, not `Agent.department`. */
    private readonly employees: EmployeesStorageService,
    /** ZB-04a §5: {@link subtasks} serves off the ONE parent/subtask read model. */
    private readonly taskParents: TaskParentsService,
  ) {}

  /**
   * All eight departments with real status, sorted for LISTS/BRIEFINGS: `waiting`
   * first (by `tier3Count` desc), then `report` (by `tier2Count` desc), then
   * `running`, then `idle`; registry order is the stable tiebreak ("report
   * severity, not recency, drives ordering" — design doc). The web department
   * STRIP does not consume this ordering — it keeps every node at a FIXED
   * position (nodes never move); this sort exists for feeds that read the list
   * top-to-bottom, not for the strip's layout.
   */
  async list(): Promise<DepartmentWithStatus[]> {
    const aggregates = await this.aggregateAll();
    const rows = DEPARTMENTS.map((department) => withAggregate(department, aggregates));
    return [...rows].sort((a, b) => {
      const rankDiff = LIST_ORDER_RANK[a.state] - LIST_ORDER_RANK[b.state];
      if (rankDiff !== 0) return rankDiff;
      if (a.state === "waiting") return b.tier3Count - a.tier3Count;
      if (a.state === "error") return b.errorCount - a.errorCount;
      if (a.state === "report") return b.tier2Count - a.tier2Count;
      return 0; // Array#sort is stable → registry order survives as the tiebreak.
    });
  }

  /** A single department by id; throws `DepartmentNotFoundError` for an unknown id. */
  async get(id: string): Promise<DepartmentWithStatus> {
    const department = this.find(id);
    const aggregates = await this.aggregateAll();
    return withAggregate(department, aggregates);
  }

  /**
   * Acknowledge `id`'s Tier-2 reports (the operator opened its drawer) —
   * resets its `report` window to now and returns the refreshed entry. Tier-3
   * (`waiting`) items are untouched: they resolve only through the approvals
   * flow, a different acknowledgment model (design doc).
   */
  async markSeen(id: string): Promise<DepartmentWithStatus> {
    const department = this.find(id);
    await this.seen.markSeen(department.id);
    return this.get(id);
  }

  /**
   * NS2 F1b — every stored pipeline/agent that still has no `department`. A
   * report list, not a health signal (the health read-model is a closed infra
   * enum — not the place for an ownership gap): the owner-backfill sweep runs
   * once at boot, so this is `[]` in steady state and only surfaces a NEWLY
   * unowned entity (a hand-edited file). Integrations are excluded — their
   * membership is derived, not stored, so there is no ownership gap to report.
   */
  async listUnowned(): Promise<UnownedEntity[]> {
    const [pipelines, agents] = await Promise.all([this.pipelines.list(), this.agents.list()]);
    return [
      ...pipelines
        .filter((p) => !p.department)
        .map((p) => ({ kind: "pipeline" as const, id: p.id })),
      ...agents.filter((a) => !a.department).map((a) => ({ kind: "agent" as const, id: a.id })),
    ];
  }

  /**
   * The roster for `id`: owned agents (stored `department`) plus a DERIVED
   * integration set. Integrations carry no owner tag — ops (the heartbeat
   * watcher) sees every integration, comms (the outward voice) sees the
   * reply-enabled ones (`mandate.reply`, per-channel override over the default),
   * every other department sees none. `monitors` is the subset of that set that
   * are GitHub integrations with a `ci` stream — there is no standalone monitor
   * entity. Throws `DepartmentNotFoundError` for an unknown id, same as
   * {@link get}. Pipelines are deliberately excluded — the roster tab's canvas
   * already sources those client-side.
   *
   * D-015: an agent (a position) belongs to the department IFF it currently has
   * at least one ACTIVE employee there — `Agent.department` is no longer read
   * here (an agent can be unowned, or hired into a different department, purely
   * through its employees).
   */
  async roster(id: string): Promise<DepartmentRoster> {
    const department = this.find(id);
    const [agents, integrations, mandate, employees] = await Promise.all([
      this.agents.list(),
      this.integrations.list(),
      this.mandate.read(),
      this.employees.list(),
    ]);
    const ownedPositionIds = new Set(
      employees
        .filter((e) => e.status === "active" && e.department === department.id)
        .map((e) => e.agentId),
    );
    const ownedAgents = agents.filter((a) => ownedPositionIds.has(a.id));
    const rosterIntegrations =
      department.id === "ops"
        ? integrations
        : department.id === "com"
          ? integrations.filter((i) => mandate.channels[i.id]?.reply ?? mandate.defaults.reply)
          : [];
    const monitors = rosterIntegrations.filter(
      (i) => i.config.kind === "github" && i.config.streams.includes("ci"),
    );
    return {
      agents: ownedAgents.map((a) => ({ id: a.id, name: a.name })),
      integrations: rosterIntegrations.map((i) => ({ id: i.id, name: i.name, kind: i.kind })),
      monitors: monitors.map((i) => ({ id: i.id, name: i.name, kind: i.kind })),
    };
  }

  /**
   * ZB-04a §5 — this department's subtasks (ZB-03's Subtasks tab): every
   * `GET /api/tasks/parents` subtask row stamped `department === id`, empty
   * until ZB-05a actually dispatches a chain step. Throws
   * `DepartmentNotFoundError` for an unknown id, same as {@link get}.
   */
  async subtasks(id: string): Promise<SubtaskSummary[]> {
    const department = this.find(id);
    return this.taskParents.getDepartmentSubtasks(department.id);
  }

  private find(id: string) {
    const department = DEPARTMENTS.find((s) => s.id === id);
    if (!department) throw new DepartmentNotFoundError(id);
    return department;
  }

  /**
   * The full aggregation pass, computed once and read for both `list()` and
   * `get()` — at eight departments and a handful of runs/approvals this is
   * cheap enough that a single-id fast path would only add complexity, not
   * measurable speed.
   */
  private async aggregateAll(): Promise<Map<DepartmentId, Aggregate>> {
    const [pipelines, runs, pendingApprovals, agents] = await Promise.all([
      this.pipelines.list(),
      this.taskRuns.listTaskRuns(),
      this.approvals.list("pending"),
      this.agents.list(),
    ]);

    const pipelineOwner = new Map<string, DepartmentId>();
    for (const p of pipelines) if (p.department) pipelineOwner.set(p.id, p.department);

    const agentOwner = new Map<string, DepartmentId>();
    for (const a of agents) if (a.department) agentOwner.set(a.id, a.department);

    const lastSeenById = new Map<DepartmentId, string>(
      await Promise.all(
        DEPARTMENTS.map(async (s) => [s.id, await this.seen.seenAt(s.id)] as const),
      ),
    );

    const running = new Set<DepartmentId>();
    const tier2Count = new Map<DepartmentId, number>();
    const errorRuns = new Map<DepartmentId, string[]>();
    const ownedPipelineRuns: OwnedPipelineRun[] = [];

    for (const run of runs) {
      const owner =
        run.kind === "pipeline"
          ? pipelineOwner.get(run.owner)
          : run.kind === "agent"
            ? agentOwner.get(run.owner)
            : undefined;
      if (!owner) continue;
      if (run.kind === "pipeline") ownedPipelineRuns.push({ runId: run.runId, owner });

      if (run.status === "running") running.add(owner);

      if (run.status === "done" || run.status === "error") {
        const completedAt = completionSignal(run);
        const lastSeen = lastSeenById.get(owner);
        if (lastSeen !== undefined && completedAt > lastSeen) {
          if (run.status === "error") {
            errorRuns.set(owner, [...(errorRuns.get(owner) ?? []), run.runId]);
          } else {
            tier2Count.set(owner, (tier2Count.get(owner) ?? 0) + 1);
          }
        }
      }
    }

    const tier3Count = new Map<DepartmentId, number>();
    for (const approval of pendingApprovals) {
      const owner = attributeApproval(approval, ownedPipelineRuns);
      if (!owner) continue;
      tier3Count.set(owner, (tier3Count.get(owner) ?? 0) + 1);
    }

    const result = new Map<DepartmentId, Aggregate>();
    for (const s of DEPARTMENTS) {
      const t3 = tier3Count.get(s.id) ?? 0;
      const t2 = tier2Count.get(s.id) ?? 0;
      const errorRunIds = errorRuns.get(s.id) ?? [];
      const errs = errorRunIds.length;
      const candidates: DepartmentState[] = [
        ...(t3 > 0 ? (["waiting"] as const) : []),
        ...(errs > 0 ? (["error"] as const) : []),
        ...(running.has(s.id) ? (["running"] as const) : []),
        ...(t2 > 0 ? (["report"] as const) : []),
        "idle",
      ];
      const state = candidates.reduce((best, candidate) =>
        STATE_PRECEDENCE[candidate] < STATE_PRECEDENCE[best] ? candidate : best,
      );
      result.set(s.id, { state, tier2Count: t2, tier3Count: t3, errorCount: errs, errorRunIds });
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
): DepartmentId | undefined {
  const match = ownedPipelineRuns.find(
    (r) => approval.runId === r.runId || approval.runId.startsWith(`${r.runId}.`),
  );
  return match?.owner;
}

function withAggregate(
  department: (typeof DEPARTMENTS)[number],
  aggregates: Map<DepartmentId, Aggregate>,
): DepartmentWithStatus {
  const aggregate = aggregates.get(department.id) ?? {
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    errorCount: 0,
    errorRunIds: [],
  };
  return { ...department, ...aggregate };
}
