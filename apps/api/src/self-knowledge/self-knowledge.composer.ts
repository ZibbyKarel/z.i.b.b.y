import type {
  Agent,
  GateRule,
  GlobalGateRule,
  MatchCondition,
  Pipeline,
  SelfKnowledgeSections,
  Subsystem,
} from "@zibby/contracts";
import { escapeAutoBoundaryMarkers } from "../shared/text/escape-md-markers";
import type { ParsedGraphReport } from "./graph-report.parser";

/**
 * Pure composition for the self-knowledge note (Fáze 1 — see
 * `docs/plans/phase-06.md`; the sixth block below is Fáze 10, see
 * `docs/plans/phase-10-graphify-self-knowledge.md`). No DI, no I/O: everything
 * the note needs is passed in by the caller (`SelfKnowledgeService`), so this
 * file is unit-testable without a NestJS test module or a real vault/storage.
 *
 * The note is a normal Markdown document with seven machine-owned "AUTO" blocks
 * delimited by HTML comments (`<!-- AUTO:<KEY>:START -->` / `…:END`). Everything
 * OUTSIDE those blocks is operator-owned and untouched by {@link mergeAutoBlocks}.
 * `META` carries the generation timestamp and is deliberately excluded from
 * {@link computeDrift} — it differs on every run by design and is not a
 * meaningful signal of "did the underlying catalog change".
 */

/** Ids of the seven AUTO blocks, also each block's rendering order in the note. */
const BLOCK_KEYS = [
  "META",
  "AGENTS",
  "PIPELINES",
  "SUBSYSTEMS",
  "GATES",
  "CHANNELS",
  "CODEBASE-SHAPE",
] as const;
type BlockKey = (typeof BLOCK_KEYS)[number];

/** Inputs the composer needs — one plain snapshot of the current catalog state. */
export interface SelfKnowledgeComposerInput {
  agents: Agent[];
  pipelines: Pipeline[];
  /** Static subsystem identities (`@zibby/contracts` `SUBSYSTEMS`) — name + mandate
   *  only, NEVER live state/tier2Count/tier3Count (decision 3, phase-105 master plan). */
  subsystems: Subsystem[];
  /** The global gate-rule catalog (the "Pravidla schvalování" page). */
  gateRules: GlobalGateRule[];
  /** The locked system policy floor (`POLICY.md`). */
  policyFloor: GateRule[];
  /** Kinds of channel adapter ZIBBY knows how to speak (e.g. "slack", "email"). */
  channelKinds: string[];
  /**
   * A digest of graphify's `graphify-out/GRAPH_REPORT.md` (Fáze 10) — `null` or
   * absent means the report was missing/unreadable when `SelfKnowledgeService`
   * read it, which renders a one-line "run `/graphify`" hint instead of a digest.
   */
  codebaseShape?: ParsedGraphReport | null;
  /** Override for the `META` timestamp — tests only; defaults to `new Date().toISOString()`. */
  generatedAt?: string;
}

/** How many god nodes / communities the digest shows before pointing to the full report. */
const CODEBASE_SHAPE_DIGEST_SIZE = 10;

/** What {@link composeSelfKnowledge} returns: the full note body + its metadata. */
export interface ComposedSelfKnowledge {
  markdown: string;
  generatedAt: string;
  sections: SelfKnowledgeSections;
}

function startMarker(key: BlockKey): string {
  return `<!-- AUTO:${key}:START -->`;
}

function endMarker(key: BlockKey): string {
  return `<!-- AUTO:${key}:END -->`;
}

/** Matches a whole AUTO block for `key`; group 1 is its inner content. */
function blockRegex(key: BlockKey): RegExp {
  return new RegExp(`${startMarker(key)}\\n?([\\s\\S]*?)\\n?${endMarker(key)}`);
}

function renderBlock(key: BlockKey, body: string): string {
  return `${startMarker(key)}\n${body}\n${endMarker(key)}`;
}

/** Extract the inner content of block `key` from `doc`, or `null` if absent. */
function extractBlockContent(doc: string, key: BlockKey): string | null {
  const match = doc.match(blockRegex(key));
  return match ? (match[1] ?? "") : null;
}

/**
 * Locale-independent ascending compare (UTF-16 code units). Deterministic across
 * platforms — unlike `String.prototype.localeCompare` with no explicit locale,
 * whose runtime-default collation reordered ids like `chronicler` (macOS treats
 * the Czech "ch" digraph as one letter sorting after "h") differently on CI's
 * Linux locale, so the committed note never matched CI's fresh compose → phantom
 * self-knowledge drift. `renderChannels` already used the default `.sort()`
 * (code-unit) for the same reason; this shares that ordering for id-keyed lists.
 */
function ascendingById<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** One human-readable line describing a rule's AND-ed match conditions. */
function describeCondition(condition: MatchCondition): string {
  switch (condition.type) {
    case "tool":
      return `tool=${condition.tool}`;
    case "action":
      return `action=${condition.action}${condition.branch ? `@${condition.branch}` : ""}`;
    case "threshold":
      return `${condition.metric} ${condition.op} ${condition.value}`;
    case "scope":
      return `scope=${condition.scope}`;
    case "context":
      return `context=${condition.context}`;
  }
}

function describeMatch(match: MatchCondition[]): string {
  return match.map(describeCondition).join(" & ");
}

function renderMeta(generatedAt: string): string {
  return `_Generated: ${generatedAt}_`;
}

function renderAgents(agents: Agent[]): string {
  const sorted = [...agents].sort(ascendingById);
  const lines = [`## Agents (${sorted.length})`];
  if (sorted.length === 0) {
    lines.push("_No agents registered yet._");
  } else {
    for (const agent of sorted) {
      const name = agent.name ? escapeAutoBoundaryMarkers(agent.name) : agent.name;
      const label = name && name !== agent.id ? `${name} (\`${agent.id}\`)` : `\`${agent.id}\``;
      const desc = agent.description ? ` — ${escapeAutoBoundaryMarkers(agent.description)}` : "";
      lines.push(`- ${label}${desc}`);
    }
  }
  return lines.join("\n");
}

function renderPipelines(pipelines: Pipeline[]): string {
  const sorted = [...pipelines].sort(ascendingById);
  const lines = [`## Pipelines (${sorted.length})`];
  if (sorted.length === 0) {
    lines.push("_No pipelines registered yet._");
  } else {
    for (const pipeline of sorted) {
      const name = pipeline.name ? escapeAutoBoundaryMarkers(pipeline.name) : pipeline.name;
      const label =
        name && name !== pipeline.id ? `${name} (\`${pipeline.id}\`)` : `\`${pipeline.id}\``;
      const desc = pipeline.desc ? ` — ${escapeAutoBoundaryMarkers(pipeline.desc)}` : "";
      const phaseCount = pipeline.phases.length;
      lines.push(`- ${label}${desc} (${phaseCount} phase${phaseCount === 1 ? "" : "s"})`);
    }
  }
  return lines.join("\n");
}

/**
 * Static identity only — name + mandate, NEVER live `state`/`tier2Count`/
 * `tier3Count` (decision 3, phase-105 master plan: baking live status into an
 * AUTO block would make `computeDrift` read "changed" almost continuously,
 * defeating the drift signal — live status stays a live-query surface).
 */
function renderSubsystems(subsystems: Subsystem[]): string {
  const sorted = [...subsystems].sort(ascendingById);
  const lines = [`## Subsystems (${sorted.length})`];
  if (sorted.length === 0) {
    lines.push("_No subsystems registered yet._");
  } else {
    for (const subsystem of sorted) {
      const name = subsystem.name ? escapeAutoBoundaryMarkers(subsystem.name) : subsystem.name;
      const label =
        name && name !== subsystem.id ? `${name} (\`${subsystem.id}\`)` : `\`${subsystem.id}\``;
      lines.push(`- ${label} — ${escapeAutoBoundaryMarkers(subsystem.mandate)}`);
    }
  }
  return lines.join("\n");
}

function renderGates(floor: GateRule[], catalog: GlobalGateRule[]): string {
  const lines = [`## Gate rules (${floor.length + catalog.length})`, ""];

  lines.push(`### System floor (locked, ${floor.length})`);
  if (floor.length === 0) {
    lines.push("_None._");
  } else {
    for (const rule of [...floor].sort(ascendingById)) {
      lines.push(`- \`${rule.id}\`: ${describeMatch(rule.match)} → **${rule.decision}**`);
    }
  }

  lines.push("", `### Catalog (${catalog.length})`);
  if (catalog.length === 0) {
    lines.push("_None._");
  } else {
    for (const rule of [...catalog].sort(ascendingById)) {
      const label = rule.name
        ? `${escapeAutoBoundaryMarkers(rule.name)} (\`${rule.id}\`)`
        : `\`${rule.id}\``;
      lines.push(`- ${label}: ${describeMatch(rule.match)} → **${rule.decision}**`);
    }
  }

  return lines.join("\n");
}

function renderChannels(channelKinds: string[]): string {
  const sorted = [...new Set(channelKinds)].sort();
  const lines = [`## Channels (${sorted.length})`];
  if (sorted.length === 0) {
    lines.push("_No channel adapters registered._");
  } else {
    for (const kind of sorted) lines.push(`- ${escapeAutoBoundaryMarkers(kind)}`);
  }
  return lines.join("\n");
}

/**
 * Digest of graphify's `graphify-out/GRAPH_REPORT.md` — a concise excerpt, not
 * the full report. `null`/`undefined` (report missing or unreadable) renders a
 * one-line hint instead, matching the empty-state style of the other blocks.
 */
function renderCodebaseShape(shape: ParsedGraphReport | null | undefined): string {
  const lines = ["## Codebase shape"];
  if (!shape) {
    lines.push("_graphify-out is missing — run `/graphify` to generate it._");
    return lines.join("\n");
  }

  const topGodNodes = [...shape.godNodes]
    .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
    .slice(0, CODEBASE_SHAPE_DIGEST_SIZE);
  const topCommunities = [...shape.communities]
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, CODEBASE_SHAPE_DIGEST_SIZE);

  lines.push("", `### God nodes (${shape.godNodes.length})`);
  if (topGodNodes.length === 0) {
    lines.push("_None found._");
  } else {
    for (const node of topGodNodes) {
      const degree = node.degree === undefined ? "" : ` — ${node.degree} edges`;
      lines.push(`- \`${node.name}\`${degree}`);
    }
  }

  lines.push("", `### Communities (${shape.communities.length})`);
  if (topCommunities.length === 0) {
    lines.push("_None found._");
  } else {
    for (const community of topCommunities) {
      const size = community.size === undefined ? "" : ` (${community.size} nodes)`;
      lines.push(`- ${community.label}${size}`);
    }
  }

  lines.push("", "_Full source: `graphify-out/GRAPH_REPORT.md`._");
  return lines.join("\n");
}

/**
 * Compose the full self-knowledge note body from a fresh catalog snapshot.
 * Deterministic given the same input + `generatedAt` (entities are sorted by
 * id) — the only non-determinism is the default timestamp, overridable for tests.
 */
export function composeSelfKnowledge(input: SelfKnowledgeComposerInput): ComposedSelfKnowledge {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const codebaseShape = input.codebaseShape ?? null;
  const sections: SelfKnowledgeSections = {
    agents: input.agents.length,
    pipelines: input.pipelines.length,
    gateRules: input.policyFloor.length + input.gateRules.length,
    channels: input.channelKinds.length,
    subsystems: input.subsystems.length,
    codebaseShape: {
      present: codebaseShape !== null,
      godNodes: codebaseShape?.godNodes.length ?? 0,
      communities: codebaseShape?.communities.length ?? 0,
    },
  };

  const blocks: Record<BlockKey, string> = {
    META: renderMeta(generatedAt),
    AGENTS: renderAgents(input.agents),
    PIPELINES: renderPipelines(input.pipelines),
    SUBSYSTEMS: renderSubsystems(input.subsystems),
    GATES: renderGates(input.policyFloor, input.gateRules),
    CHANNELS: renderChannels(input.channelKinds),
    "CODEBASE-SHAPE": renderCodebaseShape(codebaseShape),
  };

  const parts = [
    "# Self-Knowledge",
    "This note is machine-generated by `pnpm self-knowledge:generate`. Content inside " +
      "the `AUTO:*` blocks below is overwritten on every run; anything written outside " +
      "them is preserved.",
    ...BLOCK_KEYS.map((key) => renderBlock(key, blocks[key])),
  ];

  return { markdown: `${parts.join("\n\n")}\n`, generatedAt, sections };
}

/**
 * Replace only the AUTO blocks of `existing` with their counterparts from
 * `generated`, leaving everything else (operator-written content, note order,
 * surrounding prose) untouched. A block present in `generated` but missing from
 * `existing` (e.g. a hand-created note, or a block added by a later phase) is
 * appended at the end, in `BLOCK_KEYS` order.
 */
export function mergeAutoBlocks(existing: string, generated: string): string {
  let result = existing;
  const appended: string[] = [];

  for (const key of BLOCK_KEYS) {
    const regex = blockRegex(key);
    const generatedMatch = generated.match(regex);
    if (!generatedMatch) continue; // `generated` always has every block; defensive only.
    const replacement = generatedMatch[0];
    if (regex.test(result)) {
      result = result.replace(regex, replacement);
    } else {
      appended.push(replacement);
    }
  }

  if (appended.length === 0) return result;
  const trimmed = result.replace(/\s+$/, "");
  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  return `${prefix}${appended.join("\n\n")}\n`;
}

/**
 * Whether `existing`'s AUTO blocks differ from `generated`'s — the underlying
 * catalog (agents/pipelines/gate rules/channels) changed since the note was last
 * written. The `META` block (just the generation timestamp) is deliberately
 * excluded: it always differs, and is not itself meaningful drift. A block
 * missing from `existing` counts as drift (an operator deleted it, or it is a
 * brand-new block a later phase introduced).
 */
export function computeDrift(existing: string, generated: string): boolean {
  for (const key of BLOCK_KEYS) {
    if (key === "META") continue;
    const existingContent = extractBlockContent(existing, key);
    const generatedContent = extractBlockContent(generated, key);
    if (existingContent === null || generatedContent === null) return true;
    if (existingContent.trim() !== generatedContent.trim()) return true;
  }
  return false;
}
