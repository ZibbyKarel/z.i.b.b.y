import type { AgentDef } from "../../domain";

/** Slugify an agent name into a filesystem-safe id (diacritics stripped). */
export const slugifyAgent = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

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
export function newAgentDraft(category?: string): AgentDef {
  return {
    id: "",
    name: "",
    glyph: "bot",
    // Seeded so the description always opens with the canonical phrasing Claude
    // Code expects for agent routing; the user completes the sentence.
    role: "Use this agent when ",
    model: "sonnet",
    thinking: "medium",
    tools: ["read"],
    category,
    state: "idle",
    enabled: true,
    runs: 0,
    file: "",
    body: "",
  };
}
