import type { TaskRun } from "@zibby/contracts";
import { resolveSceneTokens } from "./tokens";
import type { SceneAgent, SceneDockItem } from "./sceneTypes";

/**
 * Project the live runs feed onto the dock's items (Tier 5). ONLY runs that are
 * live or still waiting appear — never the whole roster — matching the operator's
 * ask: "a dock for the agents and pipelines that will be running, or are running."
 * Terminal runs (done/error/interrupted/cancelled) drop off. An agent chip is
 * coloured from its constellation entry so the avatar that flies to it matches;
 * a pipeline chip uses the accent.
 */

/** Non-terminal run statuses — live or queued/waiting. */
const LIVE_STATUSES = new Set([
  "running",
  "queued",
  "held",
  "scheduled",
  "pending",
  "awaiting-approval",
  "parked",
]);

/** A sensible ceiling so a busy feed never overflows the dock bar. */
const MAX_DOCK = 8;

function runTitle(run: TaskRun): string {
  if (run.kind === "pipeline") return run.title || run.taskTitle || run.owner;
  return run.title || run.taskTitle || run.prompt || run.owner;
}

export function buildDock(runs: readonly TaskRun[], agents: readonly SceneAgent[]): SceneDockItem[] {
  const accent = resolveSceneTokens().accent;
  const colorById = new Map(agents.map((a) => [a.id, a.color] as const));

  return runs
    .filter((r) => (r.kind === "agent" || r.kind === "pipeline") && LIVE_STATUSES.has(r.status))
    .slice(0, MAX_DOCK)
    .map((r) => ({
      key: r.runId,
      targetId: r.owner,
      name: runTitle(r),
      kind: r.kind === "pipeline" ? "pipeline" : "agent",
      status: r.status,
      color: r.kind === "agent" ? (colorById.get(r.owner) ?? accent) : accent,
    }));
}
