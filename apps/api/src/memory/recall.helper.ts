import type { SearchHit } from "@zibby/contracts";
import { envelopeInbound } from "../shared/text/untrusted-envelope";
import type { VaultService } from "./vault.service";

/** Cap on how many memory hits a recall surfaces — signal, not the whole vault. */
export const MAX_RECALL_HITS = 5;

/** Max matching conversation entries returned per Slack digest note. */
export const MAX_SLACK_ENTRIES = 3;

const SLACK_DIGEST_ID = /^slack-(\d{4}-\d{2}-\d{2})$/;

const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Query terms (>= 3 chars), case- and diacritics-folded. */
function queryTerms(query: string, folded = true): string[] {
  return (folded ? fold(query) : query.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

/**
 * Pull the conversation entries of a Slack digest note (`slack-YYYY-MM-DD`) that
 * mention a query term — verbatim, so the per-conversation channel/time/link survive.
 * Full form: each `### …` block under `## Konverzace`; compacted form: each top-level
 * `- **…` bullet. No entry matches -> the `## Přehled` text / `**Shrnutí` line.
 * Returns `null` when the id is not a Slack digest. Prefixed with the date.
 */
export function extractSlackEntries(id: string, body: string, query: string): string | null {
  const date = SLACK_DIGEST_ID.exec(id)?.[1];
  if (!date) return null;
  const terms = queryTerms(query);
  const lines = body.split("\n");
  const blocks: string[] = [];
  const compacted = lines.some((l) => l.startsWith("**Shrnutí"));
  if (compacted) {
    blocks.push(...lines.filter((l) => l.startsWith("- **")));
  } else {
    const start = lines.findIndex((l) => /^##\s+Konverzace/.test(l));
    let cur: string[] | null = null;
    for (const l of start < 0 ? [] : lines.slice(start + 1)) {
      if (/^##\s/.test(l)) break;
      if (l.startsWith("### ")) {
        if (cur) blocks.push(cur.join("\n").trim());
        cur = [];
      }
      cur?.push(l);
    }
    if (cur) blocks.push(cur.join("\n").trim());
  }
  const matched = blocks
    .filter((b) => terms.some((t) => fold(b).includes(t)))
    .slice(0, MAX_SLACK_ENTRIES);
  if (matched.length > 0) return `${date}\n${matched.join("\n")}`;
  let fallback: string;
  if (compacted) {
    fallback = lines.find((l) => l.startsWith("**Shrnutí")) ?? "";
  } else {
    const at = lines.findIndex((l) => /^##\s+Přehled/.test(l));
    const rest = at < 0 ? [] : lines.slice(at + 1);
    const end = rest.findIndex((l) => /^##\s/.test(l));
    fallback = (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
  }
  return `${date}\n${fallback}`.trim();
}

/** Which hits a recall may surface — absent means the operator's own, unscoped recall. */
export interface RecallScope {
  /**
   * Run-facing recall (the `zibby-entities` MCP any run is granted): only global
   * work notes — no project-owned note (M7, project isolation) and no personal
   * note (F8, domain isolation). The run's own project notes are already grounded.
   */
  globalWorkOnly?: boolean;
}

/**
 * Search the Obsidian vault and render the top few hits compactly (title +
 * snippet), in Czech — the shared implementation behind the `recall_memory`
 * MCP tool, reused by both the chat-scoped controller (`chat-mcp.controller.ts`)
 * and the entity-directory controller (`entity-mcp.controller.ts`) so the
 * vault-search + formatting logic lives in exactly one place. Each hit's snippet
 * is vault-note content — which can include raw/imported notes (external files)
 * or distilled model output — so it is enveloped (Law 4) before it enters the
 * returned string; `title`/`tier` are vault-controlled metadata and stay bare.
 * Chat recall stays unscoped: the operator is the principal (F8 decision).
 */
export async function recallMemory(
  vault: VaultService,
  query: string,
  scope: RecallScope = {},
): Promise<string> {
  // ponytail: run-facing recall drops ALL project notes; resolve X-Zibby-Run-Id → project
  // (KbScopeService.projectForRun) if runs need their own project's notes via recall.
  const hits: SearchHit[] = (await searchWithTermFallback(vault, query)).filter(
    (h) => !scope.globalWorkOnly || (!h.project && h.domain !== "personal"),
  );
  if (hits.length === 0) {
    return `V paměti jsem nic k „${query}" nenašel.`;
  }
  const lines = await Promise.all(
    hits.slice(0, MAX_RECALL_HITS).map(async (h) => {
      const slack = SLACK_DIGEST_ID.test(h.id)
        ? extractSlackEntries(h.id, (await vault.note(h.id)).body ?? "", query)
        : null;
      return `- ${h.title} (${h.tier}): ${envelopeInbound(slack ?? h.snippet)}`;
    }),
  );
  return [`Našel jsem v paměti k „${query}":`, ...lines].join("\n");
}

/**
 * `vault.search` is a whole-query substring match, so a natural-language question
 * ("s kým jsem řešil migraci DNS…") never matches. When the full query finds nothing,
 * search each term (>= 3 chars) and rank notes by rarity-weighted term coverage.
 */
async function searchWithTermFallback(vault: VaultService, query: string): Promise<SearchHit[]> {
  const direct = await vault.search(query);
  if (direct.length > 0) return direct;
  // raw (unfolded) terms: vault.search is a plain substring match on the original text
  const terms = [...new Set(queryTerms(query, false))];
  if (terms.length < 2) return direct;
  const byId = new Map<string, { hit: SearchHit; score: number }>();
  for (const term of terms) {
    const found = await vault.search(term);
    for (const hit of found) {
      const prev = byId.get(hit.id);
      const w = 1 / found.length;
      byId.set(hit.id, { hit: prev?.hit ?? hit, score: (prev?.score ?? 0) + w });
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score).map((e) => e.hit);
}
