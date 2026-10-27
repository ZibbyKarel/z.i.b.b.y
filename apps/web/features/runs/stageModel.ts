import type { Agent, AgentModel, WorkflowPhase } from "@zibby/contracts";

/**
 * The model a stage runs on — mirrors the runner: a retry's escalation rung (attempt ≥ 2,
 * clamped to the last rung) → the phase's model → the phase agent's model.
 */
export function stageModel(
  phase: Pick<WorkflowPhase, "model" | "loop"> | undefined,
  agent: Pick<Agent, "model"> | undefined,
  attempt: number,
): AgentModel | undefined {
  const ladder = phase?.loop?.escalation ?? [];
  const rung = attempt >= 2 ? ladder[Math.min(attempt - 2, ladder.length - 1)] : undefined;
  return rung?.model ?? phase?.model ?? agent?.model;
}
