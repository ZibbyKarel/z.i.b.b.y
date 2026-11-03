import type { Agent } from "@zibby/contracts";

/** Read-only built-ins an `@agent` chat turn may keep (the rest stay hidden — see CHAT_HIDDEN_BUILTIN_TOOLS). */
export const CHAT_AGENT_READ_TOOLS = ["Read", "Glob", "Grep"] as const;

/** The agent's declared tools that are safe to expose in chat. */
export function chatAgentReadTools(agent: Agent): string[] {
  return CHAT_AGENT_READ_TOOLS.filter((t) => agent.tools?.includes(t));
}

/**
 * System prompt of an `@agent` chat turn: the agent's own instructions plus a chat
 * adapter. The agent answers the operator directly in the conversation instead of the
 * run contract (write a file, wait for the approval gate) its instructions assume.
 */
export function buildAgentChatPrompt(agent: Agent): string {
  return [
    agent.instructions,
    "---",
    `Operátor tě v chatu oslovil přes @${agent.id} a zadává ti práci přímo tady. ` +
      "Udělej ji sám a výsledek napiš rovnou do odpovědi. Nezakládej úkol ani běh, nic " +
      "neodesílej ven a nezapisuj soubory — výstup, který by jinak skončil v souboru nebo " +
      "na GitHubu, vlož do odpovědi jako citační blok (>), aby ho šlo zkopírovat. S operátorem " +
      "mluv česky, text určený jinam piš v jazyce a stylu, který ti velí instrukce výše. " +
      "Chybí-li ti k práci něco podstatného, zeptej se jednou krátkou otázkou.",
  ].join("\n\n");
}
