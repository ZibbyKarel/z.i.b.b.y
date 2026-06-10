import type { AgentModel, AgentThinking, GateRuleInput } from "@zibby/contracts";

/**
 * Shape of the agent edit form — shared by the modal (which owns the form
 * instance) and the extracted field sections that render against it.
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
  /** The agent's own approval-gate rules (frontmatter `gates`). */
  gates: GateRuleInput[];
  /** Ids of linked global catalog rules (frontmatter `gateRuleIds`). */
  gateRuleIds: string[];
};
