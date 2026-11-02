import type { Agent, AgentModel, OpenAiTextModel, WorkflowPhase } from "@zibby/contracts";

/**
 * The model a stage runs on — mirrors the runner: the phase's OpenAI model (no escalation
 * applies to it) → a retry's escalation rung (attempt ≥ 2, clamped to the last rung) →
 * the phase's model → the phase agent's model.
 */
export function stageModel(
  phase: Pick<WorkflowPhase, "model" | "loop" | "openaiModel"> | undefined,
  agent: Pick<Agent, "model"> | undefined,
  attempt: number,
): AgentModel | OpenAiTextModel | undefined {
  if (phase?.openaiModel) return phase.openaiModel;
  const ladder = phase?.loop?.escalation ?? [];
  const rung = attempt >= 2 ? ladder[Math.min(attempt - 2, ladder.length - 1)] : undefined;
  return rung?.model ?? phase?.model ?? agent?.model;
}
