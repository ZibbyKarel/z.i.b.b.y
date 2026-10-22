import type { Agent, Department } from "@zibby/contracts";
import { type IconName, iconNames } from "@zibby/design-system";

export interface AgentSymbol {
  glyph: IconName;
  /** Department colour (hex); absent when the agent has no known department. */
  color?: string;
}

const isIconName = (name: string | undefined): name is IconName =>
  name !== undefined && (iconNames as readonly string[]).includes(name);

/**
 * The agent's symbol: its own `glyph`, else its department's `icon`, else `bot`
 * (names that are not DS icons fall through); tinted with the department colour.
 */
export function agentSymbol(
  agent: Pick<Agent, "glyph" | "department"> | undefined,
  departments: readonly Department[],
): AgentSymbol {
  const dept = agent?.department ? departments.find((d) => d.id === agent.department) : undefined;
  const glyph = [agent?.glyph, dept?.icon].find(isIconName) ?? "bot";
  return { glyph, color: dept?.color };
}
