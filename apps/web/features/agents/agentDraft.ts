import type { AgentDef } from "../../domain";
import { AGENT_CATEGORIES } from "../../state/config";

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

/** Generate a default `*.agent.md` body from a draft. */
export function mkAgentBody(a: AgentDef): string {
  const id = slugifyAgent(a.name) || "novy-agent";
  return [
    "---",
    `name: ${id}`,
    `category: ${a.category ?? ""}`,
    `model: ${a.model}`,
    `thinking: ${a.thinking}`,
    `tools: [${a.tools.join(", ")}]`,
    "---",
    "",
    `# ${a.name || id}`,
    "",
    a.role ? `${a.role}.` : "Describe the agent's role.",
    "",
    "## System prompt",
    `You are ${a.name || id}. ${a.role || "Work autonomously and return a concise summary."}`,
    "",
  ].join("\n");
}

/** A blank draft for the "new agent" flow. */
export function newAgentDraft(): AgentDef {
  const category = AGENT_CATEGORIES[0] ?? "";
  const draft: AgentDef = {
    id: "",
    name: "",
    glyph: "bot",
    role: "",
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
  return { ...draft, body: mkAgentBody(draft) };
}
