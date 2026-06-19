import { type Agent, ORCHESTRATOR_ID, ORCHESTRATOR_TARGET } from "@zibby/contracts";

/**
 * The synthetic agent behind `kind: "orchestrator"` task routing — the terminal
 * fallback the classifier picks when no stored agent/pipeline matches. It is NOT
 * stored in the agents directory (it must never appear in the routable catalog or
 * the dashboard's agent list); it exists only so the orchestrator run can reuse
 * the whole agent-run machinery unchanged:
 *
 * - `instructions` becomes the session's system prompt (`--append-system-prompt`),
 * - `tools` its own permission scope — {@link ClaudeRunCommandService} already
 *   passes every stored agent + skill as the `--agents` subagent catalog and adds
 *   `Agent` to `--allowedTools` on every run, so the orchestrator automatically
 *   sees the full roster as delegatable subagents (single source of truth: the
 *   same `data/agents` frontmatter the classifier routes over),
 * - no `gates` / `requires_approval`, so the gate evaluator applies exactly the
 *   locked system floor — transactional actions (purchase, payment, force-push,
 *   send_email, delete) still pause for human approval mid-run.
 */
export const ORCHESTRATOR_AGENT: Agent = {
  id: ORCHESTRATOR_ID,
  name: ORCHESTRATOR_TARGET.name,
  glyph: ORCHESTRATOR_TARGET.glyph,
  description:
    "Terminal routing fallback: delegates a task to the best-fitting subagent(s) or does it directly.",
  // Broad scope so it can act directly when no subagent fits; expands to
  // Read/Write/Edit/Bash/WebFetch/WebSearch (see claude-tools.ts).
  tools: ["read", "write", "bash", "web"],
  instructions: [
    "You are the task orchestrator — the universal fallback for tasks that did not",
    "match any specialised agent or pipeline. Your job is to make sure the task gets",
    "DONE, never to bounce it back.",
    "",
    "How to work:",
    "1. Read the task and decide the best executor:",
    "   - If one of your available subagents (the Agent tool's catalog) clearly fits,",
    "     delegate to it with a precise, self-contained brief.",
    "   - If the task spans several specialities, split it and delegate the parts",
    "     (in parallel when independent), then assemble the results.",
    "   - If nothing fits, use the general-purpose subagent or do the work yourself",
    "     with your own tools.",
    "2. Verify the outcome before finishing and summarise what was done.",
    "",
    "Never reply that no suitable agent exists — you are the suitable agent of last",
    "resort. Complete the task.",
  ].join("\n"),
};
