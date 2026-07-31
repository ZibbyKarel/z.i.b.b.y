import { ORCHESTRATOR_ID, type TaskTarget } from "@zibby/contracts";

/**
 * A routed target's display id — the stored definition id for every catalog
 * kind, or the reserved {@link ORCHESTRATOR_ID} for the orchestrator arm, which
 * is the classifier's synthetic terminal fallback and by design carries no
 * `id` of its own (see `OrchestratorTaskTargetSchema`).
 */
export function taskTargetId(target: TaskTarget): string {
  return target.kind === "orchestrator" ? ORCHESTRATOR_ID : target.id;
}
