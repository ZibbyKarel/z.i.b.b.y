/**
 * Pure parser for graphify's `graphify-out/GRAPH_REPORT.md` (Fáze 10 — see
 * `docs/plans/phase-10-graphify-self-knowledge.md`). No I/O: the caller
 * (`SelfKnowledgeService`) reads the file; this module only turns its Markdown
 * text into the small digest the self-knowledge composer renders.
 *
 * Tolerant by design — graphify's report format is owned by an external tool
 * (a Claude skill, not this repo), so any section this parser doesn't
 * recognize, or any line it can't match, is silently skipped rather than
 * thrown. Worst case: an empty digest, never a crash.
 */

/** One entry from the report's "God Nodes" list. `degree` is the edge count. */
export interface GraphReportGodNode {
  name: string;
  degree?: number;
}

/** One entry from the report's "Communities" list. `size` is its node count. */
export interface GraphReportCommunity {
  label: string;
  size?: number;
}

/** What {@link parseGraphReport} extracts from a `GRAPH_REPORT.md` body. */
export interface ParsedGraphReport {
  godNodes: GraphReportGodNode[];
  communities: GraphReportCommunity[];
}

/** Matches `1. \`Stack()\` - 144 edges` (also tolerates a missing trailing "s"). */
const GOD_NODE_LINE = /^\s*\d+\.\s*`([^`]+)`\s*-\s*(\d+)\s*edges?\b/;

/** Matches `### Community 0 - "LoggerService"`. */
const COMMUNITY_HEADING = /^\s*###\s*Community\s+\d+\s*-\s*"([^"]*)"/;

/** Matches the `Nodes (70): ...` line that follows a community heading. */
const COMMUNITY_SIZE = /Nodes\s*\((\d+)\)/;

/** How many lines after a community heading to look for its `Nodes (N)` count. */
const COMMUNITY_SIZE_LOOKAHEAD = 5;

/**
 * Slice out the body of a top-level `## <heading>` section whose heading line
 * starts with `headingPrefix`: everything from the line after the heading up
 * to (not including) the next `## ` heading, or the end of the document.
 * Returns `""` if no such heading exists — the parser treats that as "section
 * not present", not an error.
 */
function extractSection(markdown: string, headingPrefix: string): string {
  const lines = markdown.split("\n");
  const startIndex = lines.findIndex((line) => line.trimStart().startsWith(headingPrefix));
  if (startIndex === -1) return "";
  const rest = lines.slice(startIndex + 1);
  const endIndex = rest.findIndex((line) => /^##\s+\S/.test(line));
  const body = endIndex === -1 ? rest : rest.slice(0, endIndex);
  return body.join("\n");
}

function parseGodNodes(section: string): GraphReportGodNode[] {
  const nodes: GraphReportGodNode[] = [];
  for (const line of section.split("\n")) {
    const match = GOD_NODE_LINE.exec(line);
    if (!match) continue;
    const name = match[1]?.trim();
    if (!name) continue;
    const degree = match[2] ? Number.parseInt(match[2], 10) : Number.NaN;
    nodes.push(Number.isNaN(degree) ? { name } : { name, degree });
  }
  return nodes;
}

function parseCommunities(section: string): GraphReportCommunity[] {
  const communities: GraphReportCommunity[] = [];
  const lines = section.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = COMMUNITY_HEADING.exec(lines[i] ?? "");
    if (!headingMatch) continue;
    const label = headingMatch[1]?.trim();
    if (!label) continue;

    let size: number | undefined;
    const lookaheadEnd = Math.min(lines.length, i + 1 + COMMUNITY_SIZE_LOOKAHEAD);
    for (let j = i + 1; j < lookaheadEnd; j++) {
      const candidate = lines[j] ?? "";
      if (COMMUNITY_HEADING.test(candidate)) break; // next community started first
      const sizeMatch = COMMUNITY_SIZE.exec(candidate);
      if (sizeMatch?.[1]) {
        const parsed = Number.parseInt(sizeMatch[1], 10);
        if (!Number.isNaN(parsed)) size = parsed;
        break;
      }
    }
    communities.push(size === undefined ? { label } : { label, size });
  }
  return communities;
}

/**
 * Parse a `GRAPH_REPORT.md` body into the digest the self-knowledge composer
 * needs. Never throws: malformed or missing sections yield empty arrays.
 */
export function parseGraphReport(markdown: string): ParsedGraphReport {
  try {
    if (typeof markdown !== "string" || markdown.trim().length === 0) {
      return { godNodes: [], communities: [] };
    }
    const godNodesSection = extractSection(markdown, "## God Nodes");
    const communitiesSection = extractSection(markdown, "## Communities");
    return {
      godNodes: parseGodNodes(godNodesSection),
      communities: parseCommunities(communitiesSection),
    };
  } catch {
    return { godNodes: [], communities: [] };
  }
}
