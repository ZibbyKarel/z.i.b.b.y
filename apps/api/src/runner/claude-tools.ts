/**
 * Maps the project's internal tool vocabulary (an agent's frontmatter `tools`)
 * onto Claude Code's own tool / permission-rule strings.
 *
 * The runner spawns `claude -p` under `--permission-mode dontAsk`, where
 * `--allowedTools` is a PERMISSION list, not a toolset filter: a tool matching it
 * runs without prompting, but **omission is not denial** — a tool left off the
 * list is still present in the session and still executes. Verified empirically on
 * this branch; see the explanation at
 * `channels/reply-draft/reply-draft.service.ts:181-188` for the transcripts and the
 * `--disallowedTools` conclusion drawn from them.
 *
 * So the agent's declared `tools` are the set it is granted un-prompted, NOT a
 * boundary on what it can reach — denying a capability takes naming it in
 * `--disallowedTools` (or a PreToolUse hook). The same mapping feeds each
 * subagent's `tools` field in the `--agents` catalog JSON.
 */

/** Internal token → one or more Claude tool / rule strings. Keyed lower-case. */
const TOOL_MAP: Record<string, readonly string[]> = {
  read: ["Read"],
  write: ["Write", "Edit"],
  bash: ["Bash"],
  git: ["Bash(git:*)"],
  web: ["WebFetch", "WebSearch"],
};

/** Tools assumed for an entity (e.g. a skill) that declares none structurally. */
export const DEFAULT_TOOLS: readonly string[] = ["read", "write"];

/**
 * Map a single token. A known internal name expands via {@link TOOL_MAP};
 * anything else is assumed to already be a Claude tool name or rule
 * (`Read`, `Grep`, `WebFetch`, `Bash(npm:*)`, …) and passes through verbatim.
 */
function mapToken(token: string): readonly string[] {
  const key = token.trim();
  if (key === "") return [];
  const mapped = TOOL_MAP[key.toLowerCase()];
  return mapped ?? [key];
}

/**
 * Expand internal tool tokens to their de-duplicated Claude tool/rule strings,
 * applying {@link DEFAULT_TOOLS} when none are declared. No `Agent` injection.
 */
export function mapTools(tools: readonly string[] | undefined): string[] {
  const source = tools && tools.length > 0 ? tools : DEFAULT_TOOLS;
  const out = new Set<string>();
  for (const token of source) {
    for (const mapped of mapToken(token)) out.add(mapped);
  }
  return [...out];
}

/**
 * The session's `--allowedTools` list. Under `--permission-mode dontAsk`, allow
 * rules are **session-level**: a delegated subagent's tool calls are gated by
 * this list, *not* by the subagent's own `tools` (verified empirically — a
 * subagent's `Write` is denied if the session lacks it). So callers must pass
 * the **union** of the primary's tools and every catalog subagent's tools, or
 * delegation breaks whenever a worker is broader than its orchestrator.
 *
 * Always includes `Agent` so the run can delegate at all (it would otherwise be
 * denied under `dontAsk`).
 */
export function toAllowedTools(tools: readonly string[] | undefined): string[] {
  return [...new Set([...mapTools(tools), "Agent"])];
}

/**
 * A subagent's `tools` value for the `--agents` catalog JSON: a comma-separated
 * string in Claude's vocabulary. Still emitted (it scopes the subagent's *own*
 * intent and shows in the catalog) even though `dontAsk` enforces at the session
 * level. `Agent` is intentionally omitted — catalog subagents are leaves.
 * Returns `undefined` when empty so the caller can omit the key.
 */
export function toSubagentTools(tools: readonly string[] | undefined): string | undefined {
  const mapped = mapTools(tools);
  return mapped.length > 0 ? mapped.join(", ") : undefined;
}
