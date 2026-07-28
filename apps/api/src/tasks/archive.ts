import { NO_SUBSYSTEM, type Pipeline, type SubsystemId, type TaskRun } from "@zibby/contracts";

/**
 * States that read as settled — finished, or otherwise done progressing on its own.
 * Ported from `apps/web/features/runs/archiveStatus.ts` (the `/archiv` page's own
 * vocabulary, D9) so the server can filter to the exact same set the web already
 * uses to decide what belongs on the archive page. Deliberately NOT `paused-limit` —
 * a mid-run pause that auto-resumes, not an archived state.
 */
export const ARCHIVED_STATES = new Set<TaskRun["status"]>([
  "done",
  "error",
  "interrupted",
  "parked",
]);

/** Whether `status` belongs in the archive rather than the active/live feed. */
export function isArchived(status: TaskRun["status"]): boolean {
  return ARCHIVED_STATES.has(status);
}

/**
 * A run's display title, with the same fallback chain as the web's
 * `apps/web/features/runs/run.ts#runTitle` — needed here only so the archive search
 * matches the exact text the operator sees on each row, not just the raw `title` field.
 */
export function runTitle(
  run: Pick<TaskRun, "kind" | "title" | "taskTitle" | "prompt" | "owner">,
): string {
  if (run.kind === "pipeline") return run.title || run.taskTitle || run.owner;
  return run.title || run.taskTitle || run.prompt || run.owner;
}

/** Whether `run`'s title or project matches the free-text search — mirrors the web's
 * (now-removed) `archiveGroups.ts#matchesArchiveSearch`. Empty/blank query always matches. */
export function matchesArchiveSearch(
  run: Pick<TaskRun, "kind" | "title" | "taskTitle" | "prompt" | "owner" | "project">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return runTitle(run).toLowerCase().includes(q) || run.project.toLowerCase().includes(q);
}

/**
 * The subsystem a single run is attributed to, or `null` when it has none — mirrors
 * `apps/web/features/subsystems/useOwnerSubsystem.ts#runSubsystemId` (D8): only a
 * `pipeline` run ever carries a subsystem (from its owning definition's
 * `ownerSubsystem`); an `agent`/`goal`/`scheduled` run has no subsystem concept at all.
 */
export function runSubsystemId(
  run: Pick<TaskRun, "kind" | "owner">,
  pipelineDefsById: ReadonlyMap<string, Pipeline>,
): SubsystemId | null {
  if (run.kind !== "pipeline") return null;
  return pipelineDefsById.get(run.owner)?.ownerSubsystem ?? null;
}

/** `runSubsystemId(...)`, folding `null` into the explicit {@link NO_SUBSYSTEM} bucket
 * (D8 — never silently dropped) for filtering/counting purposes. */
export function archiveSubsystemId(
  run: Pick<TaskRun, "kind" | "owner">,
  pipelineDefsById: ReadonlyMap<string, Pipeline>,
): SubsystemId | typeof NO_SUBSYSTEM {
  return runSubsystemId(run, pipelineDefsById) ?? NO_SUBSYSTEM;
}
