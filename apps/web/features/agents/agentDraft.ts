import type { Agent } from "@zibby/contracts";

/** Backing file path for an agent id. */
export const agentFile = (id: string): string => `~/zibby/agents/${id}.agent.md`;

/**
 * A blank draft for the "new agent" flow. The `body` starts empty: it is pure
 * Markdown authored by the user in the editor, never synthesised. The structured
 * config (`name`, `role`/description, `model`, `thinking`, `glyph`, `tools`,
 * `category`, …) is carried as separate fields and assembled into the file's YAML
 * frontmatter by the API — the frontend never writes a `---` block itself.
 *
 * `category` is seeded from the live taxonomy by the caller (the agents screen) —
 * categories are no longer a static constant, so the draft starts uncategorised
 * unless one is supplied.
 */
export function newAgentDraft(category?: string): Agent {
  return {
    id: "",
    name: "",
    glyph: "bot",
    // Seeded so the description always opens with the canonical phrasing Claude
    // Code expects for agent routing; the user completes the sentence.
    description: "Use this agent when ",
    model: "sonnet",
    thinking: "medium",
    tools: ["read"],
    category,
    instructions: "",
    // NS2 F1: every agent must have an owning subsystem at create time (the API
    // 422s a create without one) — "forge" is the default since most hand-built
    // agents are pipeline crew.
    ownerSubsystem: "forge",
  };
}
