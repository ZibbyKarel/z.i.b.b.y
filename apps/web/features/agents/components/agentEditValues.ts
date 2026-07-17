import type {
  Agent,
  AgentModel,
  AgentThinking,
  GateRuleInput,
  GlobalGateRule,
  SubsystemId,
} from "@zibby/contracts";

/**
 * Shape of the agent edit form — shared by the detail screen and the create
 * dialog (each owns its form instance) and the extracted field sections that
 * render against it.
 */
export type AgentEditValues = {
  name: string;
  description: string;
  glyph: string;
  model: AgentModel;
  thinking: AgentThinking;
  tools: string[];
  category: string;
  instructions: string;
  /** NS2 F1: the subsystem that owns this agent (write-required by the API). */
  ownerSubsystem: SubsystemId;
  /** The agent's own approval-gate rules (frontmatter `gates`). */
  gates: GateRuleInput[];
  /** Ids of linked global catalog rules (frontmatter `gateRuleIds`). */
  gateRuleIds: string[];
};

/** The agent's persisted fields as form defaults (used on open and on edit-reset). */
export function toFormValues(agent: Agent): AgentEditValues {
  return {
    name: agent.name ?? "",
    description: agent.description ?? "",
    glyph: agent.glyph ?? "",
    model: agent.model ?? "sonnet",
    thinking: agent.thinking ?? "medium",
    tools: agent.tools ?? [],
    category: agent.category ?? "",
    instructions: agent.instructions,
    ownerSubsystem: agent.ownerSubsystem ?? "forge",
    gates: agent.gates ?? [],
    gateRuleIds: agent.gateRuleIds ?? [],
  };
}

/** Convert an own rule into the shape `RuleModal` prefills from (a global rule). */
export function ownRuleToInitial(gate: GateRuleInput): GlobalGateRule {
  return {
    id: "own",
    match: gate.match,
    decision: gate.decision,
    ...(gate.resolve ? { resolve: gate.resolve } : {}),
  };
}

/** Merge submitted form values back onto the agent (empty strings → absent). */
export function applyFormValues(agent: Agent, values: AgentEditValues): Agent {
  return {
    ...agent,
    name: values.name || undefined,
    description: values.description || undefined,
    glyph: values.glyph || undefined,
    model: values.model,
    thinking: values.thinking,
    tools: values.tools,
    category: values.category || undefined,
    instructions: values.instructions,
    ownerSubsystem: values.ownerSubsystem,
    gates: values.gates,
    gateRuleIds: values.gateRuleIds,
  };
}
