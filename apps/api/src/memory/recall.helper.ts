import type { SearchHit } from "@zibby/contracts";
import type { VaultService } from "./vault.service";

/** Cap on how many memory hits a recall surfaces — signal, not the whole vault. */
export const MAX_RECALL_HITS = 5;

/**
 * Search the Obsidian vault and render the top few hits compactly (title +
 * snippet), in Czech — the shared implementation behind the `recall_memory`
 * MCP tool, reused by both the chat-scoped controller (`chat-mcp.controller.ts`)
 * and the entity-directory controller (`entity-mcp.controller.ts`) so the
 * vault-search + formatting logic lives in exactly one place.
 */
export async function recallMemory(vault: VaultService, query: string): Promise<string> {
  const hits: SearchHit[] = await vault.search(query);
  if (hits.length === 0) {
    return `V paměti jsem nic k „${query}" nenašel.`;
  }
  const lines = hits
    .slice(0, MAX_RECALL_HITS)
    .map((h) => `- ${h.title} (${h.tier}): ${h.snippet}`);
  return [`Našel jsem v paměti k „${query}":`, ...lines].join("\n");
}
