import { Injectable } from "@nestjs/common";
import type {
  DepartmentId,
  Project,
  ScheduledTask,
  SubtaskSummary,
  TaskDetail,
  TaskParent,
  TaskParentState,
  TaskParentsPage,
  TaskParentsQuery,
} from "@zibby/contracts";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";

/**
 * ZB-04a §5 — one task's own derived bucket, BEFORE it is rolled up with its
 * siblings into a parent state. `cancelled` counts as terminal-non-error
 * ("done") rather than reopening a new bucket: it closed cleanly, just not by
 * finishing — see the doc comment on {@link deriveParentState} for the same
 * call on the aggregate.
 */
function deriveTaskState(task: ScheduledTask): TaskParentState {
  if (task.status === "failed" || task.status === "dead-letter" || task.outcome?.status === "error") {
    return "error";
  }
  if (task.status === "held" || task.status === "awaiting-output") return "blocked";
  if (task.status === "dispatched" && !task.outcome) return "working";
  if (task.outcome?.status === "done" || task.status === "cancelled") return "done";
  // scheduled / queued / pending, and every other pre-dispatch hold.
  return "thinking";
}

/** One subtask (or the parent itself, used as its own sole entry) → its summary row. */
function toSubtaskSummary(task: ScheduledTask): SubtaskSummary {
  return {
    taskId: task.id,
    ...(task.chain ? { step: task.chain.step } : {}),
    ...(task.department ? { department: task.department } : {}),
    state: deriveTaskState(task),
    ...(task.runRef ? { runRef: task.runRef } : {}),
  };
}

/**
 * PART-B.md ZB-04a §5's derivation table, generalised over an explicit
 * `entries` list rather than literally "subtasks": when `parent` has no
 * children yet (every real task today — ZB-05a is what starts producing
 * subtasks), the parent's OWN state is the sole entry, so an ordinary
 * non-chain task still derives a sensible top-level state instead of being
 * vacuously `thinking` forever.
 *
 * "chain ended" has no on-disk signal yet — `chainEndedAt` is a ZB-05a field
 * (PART-B.md ZB-05a §6). A non-chain parent (`target?.kind !== "chain"`, true
 * for every task this phase can actually create — `createTask` rejects a
 * `{ kind: "chain" }` target, see `ChainNotImplementedError`) trivially
 * counts as "ended": there is no chain to end. A parent that DOES carry a
 * chain target (reachable only via a hand-built test fixture until ZB-05a)
 * can reach every bucket except `done` — "all done, chain not (yet) marked
 * ended" falls through to `thinking`, read as "the last hop finished, the
 * next hasn't been dispatched".
 */
function deriveParentState(parent: ScheduledTask, subtasks: readonly ScheduledTask[]): TaskParentState {
  const entries = subtasks.length > 0 ? subtasks : [parent];
  const states = entries.map(deriveTaskState);
  if (states.includes("error")) return "error";
  if (states.includes("blocked")) return "blocked";
  if (states.includes("working")) return "working";
  const chainEnded = parent.target?.kind !== "chain";
  if (chainEnded && states.every((s) => s === "done")) return "done";
  return "thinking";
}

function groupByParent(tasks: readonly ScheduledTask[]): Map<string, ScheduledTask[]> {
  const byParent = new Map<string, ScheduledTask[]>();
  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const list = byParent.get(task.parentTaskId) ?? [];
    list.push(task);
    byParent.set(task.parentTaskId, list);
  }
  return byParent;
}

/** Opaque keyset cursor — mirrors `ArchivePageQuerySchema`'s `<startedAt>|<runId>` shape. */
function sortKey(parent: TaskParent): string {
  return `${parent.createdAt}|${parent.id}`;
}

/**
 * ZB-04a §5 — the parent/subtask read model: `GET /api/tasks/parents`,
 * `GET /api/tasks/:id` (via {@link getTask}) and `GET /api/departments/:id/subtasks`
 * (via {@link getDepartmentSubtasks}) all read straight off
 * {@link ScheduledTasksStorageService}'s full listing — no separate index,
 * matching the file-scale this store already assumes elsewhere (the archive
 * feed does the same full scan).
 */
@Injectable()
export class TaskParentsService {
  constructor(
    private readonly storage: ScheduledTasksStorageService,
    private readonly projects: ProjectsStorageService,
  ) {}

  /** Cursor-paginated top-level tasks, newest-first, with the company/project/department/state/source filters. */
  async listParents(query: TaskParentsQuery): Promise<TaskParentsPage> {
    const all = await this.storage.list().catch((): ScheduledTask[] => []);
    const byParent = groupByParent(all);
    const companyProjectIds = query.company ? await this.projectIdsForCompany(query.company) : null;

    const built = all
      .filter((t) => !t.parentTaskId)
      .map((parent) => this.toTaskParent(parent, byParent.get(parent.id) ?? []))
      .filter((p) => !query.project || p.projectId === query.project)
      .filter(
        (p) => !companyProjectIds || (p.projectId != null && companyProjectIds.has(p.projectId)),
      )
      .filter((p) => !query.department || p.department === query.department)
      .filter((p) => !query.state || p.state === query.state)
      .filter((p) => !query.source || p.source === query.source)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

    const limit = Math.min(Math.max(query.limit ?? 40, 1), 100);
    const cursor = query.before;
    const remaining = cursor ? built.filter((p) => sortKey(p) < cursor) : built;
    const collected = remaining.slice(0, limit + 1);
    const hasMore = collected.length > limit;
    const items = collected.slice(0, limit);
    const oldest = items[items.length - 1];
    const nextCursor = hasMore && oldest ? sortKey(oldest) : null;
    return { items, nextCursor };
  }

  /** A single task by id, with its subtasks summary — 404s via the storage service's own error. */
  async getTask(id: string): Promise<TaskDetail> {
    const task = await this.storage.get(id);
    const all = await this.storage.list().catch((): ScheduledTask[] => []);
    const children = all.filter((t) => t.parentTaskId === id);
    return { ...task, subtasks: children.map(toSubtaskSummary) };
  }

  /** ZB-03's department "Subtasks" tab: every subtask stamped to this department. */
  async getDepartmentSubtasks(departmentId: DepartmentId): Promise<SubtaskSummary[]> {
    const all = await this.storage.list().catch((): ScheduledTask[] => []);
    return all.filter((t) => t.parentTaskId && t.department === departmentId).map(toSubtaskSummary);
  }

  private toTaskParent(parent: ScheduledTask, children: ScheduledTask[]): TaskParent {
    return {
      id: parent.id,
      title: parent.title || parent.text,
      text: parent.text,
      createdAt: parent.createdAt,
      ...(parent.projectId ? { projectId: parent.projectId } : {}),
      ...(parent.department ? { department: parent.department } : {}),
      ...(parent.source ? { source: parent.source } : {}),
      state: deriveParentState(parent, children),
      subtasks: children.map(toSubtaskSummary),
    };
  }

  private async projectIdsForCompany(companyId: string): Promise<Set<string>> {
    const projects = await this.projects.list().catch((): Project[] => []);
    return new Set(projects.filter((p) => p.companyId === companyId).map((p) => p.id));
  }
}
