import { Injectable } from "@nestjs/common";
import type { Agent, Hook, McpServer, Skill } from "@zibby/contracts";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { HooksStorageService } from "../hooks/hooks.storage.service";
import { McpCredentialsStore } from "../mcp/mcp-credentials.store";
import { ENTITY_MCP_SERVER_ID, McpServersStorageService } from "../mcp/mcp.storage.service";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { mapTools, toSubagentTools } from "./claude-tools";

/**
 * Inputs for one `claude -p` run, projected from the selected agent (or skill).
 * `instructions` is the entity's Markdown body — it becomes the session's real
 * system prompt (appended, so Claude Code's base prompt and the Agent tool stay
 * intact). `task` is the user's prompt, passed bare as the `-p` argument.
 */
export interface ClaudeRunOptions {
  instructions: string;
  task: string;
  tools?: readonly string[];
  model?: Agent["model"];
  thinking?: Agent["thinking"];
  /**
   * Absolute directories the session may operate on beyond its sandbox cwd
   * (`--add-dir`). The agent runs *from* its per-run sandbox and is *granted*
   * access to these — e.g. the Cleaner's directory-to-clean. So coordination
   * artifacts stay in the sandbox and the target only receives the real effect.
   */
  grantDirs?: readonly string[];
  /**
   * Emit the full transcript as `--output-format stream-json` (one JSON event per
   * line) instead of default text mode, which prints only the final message. The
   * runner flattens each event back into readable log text (see
   * {@link formatClaudeStreamLine}), so the log shows the agent's whole run — text,
   * every tool call, tool results — not just its closing summary.
   */
  streamTranscript?: boolean;
  /**
   * Memory grounding block (Phase 4): North Star + relevant MOCs + the project
   * note, composed by the GroundingService from the vault. Inserted between the
   * operating contract and the agent body in `--append-system-prompt`. Always a
   * plain string (`""` when the vault yields nothing) — this service stays
   * vault-agnostic; the caller composes it.
   */
  grounding?: string;
  /**
   * Resume-context block (Phase 9.3): "you are continuing, not restarting — these
   * items are done and committed". Set only on a resumed/retried stage; inserted into
   * `--append-system-prompt` after grounding, before the agent body. Omitted when "".
   */
  resumeContext?: string;
  /**
   * Phase 49: a captured `claude` session id to continue via `--resume <sessionId>`
   * (verified headless-safe — the chat engine resumes the same way). Set only when an
   * errored/interrupted run is being re-run and its session id was captured, so the
   * new session continues the old conversation instead of reloading its context. All
   * the other flags (system prompt, catalog, gate settings) are still supplied as
   * usual; this just threads the resume. Omitted → a fresh session.
   */
  resumeSessionId?: string;
  /**
   * Agent ids that should populate the delegation catalog (`--agents`). The catalog
   * inlines every entry's full instruction body into a SINGLE argv string, so passing
   * the whole agent LIBRARY (every stored agent) overflows the OS argv limit once the
   * library grows past a few hundred KB — the run dies with `spawn E2BIG` before
   * `claude` ever starts. The caller curates the relevant set (a pipeline passes its
   * own stage agents); ZIBBY's operational core ({@link CORE_DELEGATE_IDS}) is always
   * folded in, and the result is capped at {@link MAX_CATALOG_AGENTS}. Omit it for a
   * small/standalone run — a library at or under the cap is passed through unchanged.
   */
  delegates?: readonly string[];
  /**
   * Writable directory (the run's sandbox cwd) to spill the assembled system prompt
   * into, so it rides `--append-system-prompt-file` instead of an inline
   * `--append-system-prompt` argv string. Instructions + grounding + resume-context
   * can be large, and every byte on argv counts toward the same OS limit that
   * `--agents` can blow (`spawn E2BIG`); a file keeps argv small as they grow. The
   * file persists in the sandbox, so an approval→resume that replays the same args
   * still resolves it. Omit it (tests, callers without a sandbox) → inline prompt.
   *
   * Reused (same dir) for the `--mcp-config` payload — see
   * {@link ClaudeRunCommandService.buildMcpConfigArgs} — since MCP config carries
   * real secrets and must not sit on argv either; both files live in this one
   * per-run sandbox rather than threading a second dir option.
   */
  systemPromptDir?: string;
  /**
   * Phase 108: the FINAL, already-intersected tool-grant set for this run (the
   * operator's confirmed `CreateTaskInput.toolGrants` ∩ the agent's own
   * `optionalTools` ceiling — the caller enforces that intersection; this service
   * only resolves each grant's id shape and unions it into `--allowedTools`, see
   * `buildCatalog` below). Omitted/`[]` → no change from today's behavior.
   */
  toolGrants?: readonly string[];
}

/** Absolute path of the PreToolUse approval hook, resolved next to this module. */
const APPROVAL_HOOK = path.resolve(__dirname, "claude-approval-hook.mjs");

/**
 * How long the gate holds a destructive command for a human decision (seconds).
 * Claude Code enforces a hard timeout on every hook and treats a hook killed at
 * that timeout as a NON-decision — under `--permission-mode dontAsk` the pending
 * command then executes as if approved (verified empirically; this auto-ran a
 * gated `rm` whose approval sat undecided past the old 600 s timeout). The hook
 * therefore receives this deadline as argv and DENIES fail-closed when it
 * elapses, while the registered hook `timeout` sits {@link HOOK_KILL_MARGIN_S}
 * above it so the CLI can never kill a still-deciding hook first.
 *
 * A literally infinite wait is NOT achievable: every hook always has a kill
 * timeout (omitting it means the 600 s default, not "forever"), and a killed
 * hook auto-runs the command — so "no timeout" recreates the incident. The next
 * best thing is the longest deadline that is still safe: Node-style timers cap
 * at 2^31−1 ms (~24.8 days), and a registered timeout past that cap risks
 * overflowing to an IMMEDIATE kill — i.e. instant auto-approve. One day keeps
 * `GATE_DEADLINE_S + HOOK_KILL_MARGIN_S` comfortably under the cap (asserted in
 * the service test); in practice the run dies with the machine/process first,
 * which our terminal-status hook resolves as rejected.
 */
export const GATE_DEADLINE_S = 24 * 60 * 60;

/** Headroom between the hook's own fail-closed deny and Claude Code's hook kill. */
const HOOK_KILL_MARGIN_S = 5 * 60;

/**
 * Operating contract prepended to every run's system prompt. Runs are headless
 * `claude -p` sessions: single-turn, with stdin ignored. There is no human at a
 * terminal, so a question printed to chat ("Approve? yes/no") receives no reply —
 * the turn just ends and the process exits `done` having done nothing. This is the
 * exact failure mode where an agent prints a deletion plan, asks for confirmation,
 * and terminates before its approval gate ever engages.
 *
 * Consent is NOT obtained in chat: the platform intercepts destructive commands
 * (the rm family, `find … -delete`, `git clean`) via a PreToolUse hook BEFORE they
 * run, surfaces an approval card to the human, and blocks the command until they
 * approve or reject — out of band from this session. So the correct behaviour is to
 * EXECUTE the action (run the `rm`); the gate handles human consent. Asking first
 * defeats it. Prepended (not appended) so it frames the agent's own body, and
 * separated by a rule the body can't easily override.
 */
export const OPERATING_CONTRACT = [
  "## Execution environment (read first)",
  "",
  "You run non-interactively (`claude -p`): a single turn, no interactive human, stdin closed.",
  "Anything you print as a question gets NO reply — your turn simply ends and the run stops.",
  "",
  '- NEVER ask for confirmation or print a "yes/no" prompt and wait. It is a dead end.',
  "- If your own instructions tell you to get the user's approval/confirmation BEFORE a",
  "  destructive action, you obtain that approval by RUNNING the command — the platform",
  "  intercepts it, shows the human an approval card, and pauses until they approve or reject.",
  '  Running the command IS the approval step. There is no separate "ask the user" step, and',
  "  printing the request as text instead does NOT reach the human — it just ends your run.",
  '- So "present a plan and wait for approval" means: state the plan in one line, then RUN it.',
  "  Do not stop after the plan — carry it out; the gate does the asking for you, out of band.",
  "- This covers delete, overwrite, move, and any other external effect.",
  "",
  "---",
  "",
].join("\n");

/**
 * Appended to the user turn (the `-p` task), so it is the LAST and highest-authority
 * instruction the model sees — it must override an agent body that says "ask the user
 * first". A prepended system-prompt contract loses on recency to the agent's own body
 * (which ends with its confirmation step); a directive in the user's own voice does not.
 */
export const EXECUTION_DIRECTIVE =
  "\n\n(Run the actions directly — do NOT stop to ask me to confirm. Any destructive step is" +
  " intercepted and I approve it on a card before it runs, so executing the command is how you" +
  " ask. Asking in text reaches no one and just ends the run.)";

/**
 * Frame an agent/skill body with the operating contract, then the optional memory
 * grounding block, then the body. Order matters: the contract frames the run, the
 * grounding gives durable context, and the body (highest recency in the system
 * prompt) is the agent's own instructions. Empty grounding is omitted cleanly.
 */
function withOperatingContract(
  instructions: string,
  grounding?: string,
  resumeContext?: string,
): string {
  const block = grounding && grounding.trim() ? `${grounding.trim()}\n\n---\n\n` : "";
  // Phase 9.3: the resume-context rides the same channel, after grounding so the
  // "continue, don't restart" framing is durable context, before the agent body.
  const resume = resumeContext && resumeContext.trim() ? `${resumeContext.trim()}\n\n---\n\n` : "";
  return `${OPERATING_CONTRACT}${block}${resume}${instructions}`;
}

/** Append the execution directive so the user turn ends with "act, don't ask". */
function withExecutionDirective(task: string): string {
  return `${task}${EXECUTION_DIRECTIVE}`;
}

/** A single hook command entry in Claude Code's `--settings` JSON. */
interface HookCommandEntry {
  type: "command";
  command: string;
  timeout?: number;
}

/** A matcher group: the hooks that run for tools/events matching `matcher`. */
interface HookMatcherGroup {
  matcher?: string;
  hooks: HookCommandEntry[];
}

/**
 * The locked approval hook group — always the FIRST `PreToolUse` group so a
 * destructive Bash command (or an agent handoff — Fáze 2a) hits the fail-closed
 * gate before any custom hook can allow it. `command` is shell-quoted so a node or
 * hook path with spaces still resolves; argv[2] is the hook's fail-closed deadline
 * (the `timeout` stays a margin above it so the hook always denies before the CLI
 * can kill it — a killed hook is a non-decision → the command would auto-run under
 * dontAsk).
 *
 * `matcher: "Bash|Task"` — `Task` is the Agent tool's delegation call (Fáze 2:
 * orchestration delegates entirely inside this one `claude -p` process, so the
 * `Task` call is the only realtime signal the backend gets of a handoff). The hook
 * classifies it to an `agent.delegate` intent through the same intent-request
 * protocol as Bash; there is no locked floor rule for it (default `allow`, Tier 1 —
 * logged, not blocking), but an operator's own `ask`/`deny` gate-rules.json rule on
 * `action: agent.delegate` takes effect immediately, same as any other action.
 */
function approvalGroup(): HookMatcherGroup {
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(APPROVAL_HOOK)} ${GATE_DEADLINE_S}`;
  return {
    matcher: "Bash|Task",
    hooks: [{ type: "command", command, timeout: GATE_DEADLINE_S + HOOK_KILL_MARGIN_S }],
  };
}

/**
 * Would a custom hook collide with the locked approval gate's responsibility? A
 * `PreToolUse` hook whose matcher catches `Bash` or `Task` (explicitly, or by being
 * empty / `*` = "match every tool") could `allow` a destructive Bash command or an
 * agent handoff before the approval hook gates it. Such hooks are DROPPED at merge
 * time, so a stored hook can never weaken the gate (Law 1). The check is
 * deliberately conservative — any matcher token that is empty, `*`, or contains
 * `Bash`/`Task` counts as a collision, even at the cost of refusing an over-broad
 * benign hook.
 */
function collidesWithApprovalGate(hook: Hook): boolean {
  if (hook.event !== "PreToolUse") return false;
  const matcher = hook.matcher?.trim();
  if (!matcher || matcher === "*") return true;
  return matcher
    .split("|")
    .map((token) => token.trim())
    .some((token) => token === "" || token === "*" || token.includes("Bash") || token.includes("Task"));
}

/**
 * Build the `--settings` JSON for a run: the locked approval hook plus every
 * enabled custom hook, grouped by event. The approval group is always present and
 * FIRST in `PreToolUse`, and any custom hook that could weaken the Bash gate is
 * filtered out (see {@link collidesWithApprovalGate}) — these two guarantees make
 * the approval gate structural (Law 1), regardless of what is stored.
 */
function buildSettings(customHooks: readonly Hook[]): string {
  const byEvent: Record<string, HookMatcherGroup[]> = { PreToolUse: [approvalGroup()] };
  for (const hook of customHooks) {
    if (collidesWithApprovalGate(hook)) continue;
    const matcher = hook.matcher?.trim();
    const group: HookMatcherGroup = {
      ...(matcher ? { matcher } : {}),
      hooks: [
        {
          type: "command",
          command: hook.command,
          ...(hook.timeout ? { timeout: hook.timeout } : {}),
        },
      ],
    };
    (byEvent[hook.event] ??= []).push(group);
  }
  return JSON.stringify({ hooks: byEvent });
}

/** A single subagent in the `--agents` catalog JSON. */
interface CatalogEntry {
  description: string;
  prompt: string;
  tools?: string;
  model?: string;
}

/**
 * Hard ceiling on delegation-catalog agents. The catalog inlines every entry's full
 * instruction body into one `--agents` argv string; an unbounded library (ZIBBY ships
 * 160+ seeded specialists) serializes to >1 MB and overflows the OS argv+env limit
 * (`spawn E2BIG`) before `claude` starts. The cap also bounds tokens — a single
 * session never needs dozens of delegatable subagents.
 */
export const MAX_CATALOG_AGENTS = 16;

/**
 * Filename the assembled system prompt is spilled to inside the run's sandbox when a
 * `systemPromptDir` is given (see {@link ClaudeRunOptions.systemPromptDir}).
 */
export const SYSTEM_PROMPT_FILE = ".zibby-system-prompt.md";

/**
 * Filename the assembled `--mcp-config` payload is spilled to inside the run's
 * sandbox when a `systemPromptDir` is given (see {@link ClaudeRunCommandService.buildMcpConfigArgs}).
 */
export const MCP_CONFIG_FILE = ".zibby-mcp-config.json";

/**
 * ZIBBY's operational delivery/orchestration agents — always folded into a curated
 * catalog so the delivery loop can delegate even when the caller passes a narrow set
 * (or none). These are ZIBBY-native roles, distinct from the seeded specialist
 * library; a missing id is simply skipped (no hard dependency on seed data).
 */
export const CORE_DELEGATE_IDS: readonly string[] = [
  "architekt",
  "koder",
  "code-review",
  "code-reviewer",
  "tester",
  "dokumentator",
  "orchestrator",
  "cleaner",
];

/**
 * Curate the delegation catalog down to a bounded, relevant set. A small library
 * (≤ {@link MAX_CATALOG_AGENTS}) with no explicit curation is returned UNCHANGED — so
 * standalone agent runs and tests keep today's full-catalog behaviour. Otherwise the
 * caller's `delegates` (relevance) come first, then ZIBBY's {@link CORE_DELEGATE_IDS},
 * deduped and capped — never the whole library on argv.
 */
function selectCatalogAgents(all: Agent[], delegates?: readonly string[]): Agent[] {
  if ((!delegates || delegates.length === 0) && all.length <= MAX_CATALOG_AGENTS) return all;
  const byId = new Map(all.map((agent) => [agent.id, agent]));
  const picked = new Map<string, Agent>();
  const add = (id: string): void => {
    const agent = byId.get(id);
    if (agent && !picked.has(id) && picked.size < MAX_CATALOG_AGENTS) picked.set(id, agent);
  };
  for (const id of delegates ?? []) add(id);
  for (const id of CORE_DELEGATE_IDS) add(id);
  return [...picked.values()];
}

/**
 * Phase 108 — resolve one confirmed tool grant (an `Agent.optionalTools` id) to
 * the `--allowedTools` entry it corresponds to under `dontAsk`. THREE shapes are
 * tolerated, in this order:
 *
 *  1. The grant equals an ENABLED MCP server's `id` (e.g. `"zibby-entities"`) →
 *     widens to the whole server, `mcp__<id>__*` — the same wildcard `buildCatalog`
 *     already grants for every enabled row.
 *  2. The grant already looks like a fully-qualified Claude tool id (starts with
 *     `"mcp__"`) → passed through verbatim (the caller already qualified it).
 *  3. Otherwise the grant is assumed to name a TOOL on the system entity-directory
 *     MCP server (Phase 106, id {@link ENTITY_MCP_SERVER_ID}) — the only per-tool
 *     grant surface that exists today (`recall_memory`, `list_entities`, per the
 *     `AgentSchema.optionalTools` docblock example) — and is qualified to
 *     `mcp__<ENTITY_MCP_SERVER_ID>__<grant>`. Only applied when that server is
 *     actually among the enabled rows; otherwise the grant is dropped (fail-open —
 *     nothing to grant against, never a thrown error).
 *
 * ⚠ Documented assumption (flagged for review): shapes 1 and 2 are unambiguous;
 * shape 3 hard-codes "a bare grant id names a `zibby-entities` tool", which is
 * the only concrete case in the codebase today. A future second per-tool MCP
 * server would need this resolution taught which server a bare tool name belongs
 * to (not modeled anywhere yet) — out of scope for this phase.
 */
function resolveGrantId(grant: string, mcpServers: readonly McpServer[]): string | null {
  if (mcpServers.some((server) => server.id === grant)) return `mcp__${grant}__*`;
  if (grant.startsWith("mcp__")) return grant;
  if (mcpServers.some((server) => server.id === ENTITY_MCP_SERVER_ID)) {
    return `mcp__${ENTITY_MCP_SERVER_ID}__${grant}`;
  }
  return null;
}

/**
 * Kickoff prompt used when a run is launched with a blank task. `claude --print`
 * rejects an empty prompt ("Input must be provided …"), and a run started from the
 * UI may carry no prompt at all (the agent's body in `--append-system-prompt`
 * already says what to do, so the user prompt is optional). A minimal kickoff lets
 * the session start; the system prompt drives it from there.
 */
const KICKOFF_FALLBACK = "Begin.";

/** Thinking budget → `--effort` level (1:1 today; kept as a seam for divergence). */
const THINKING_TO_EFFORT: Record<NonNullable<Agent["thinking"]>, string> = {
  low: "low",
  medium: "medium",
  high: "high",
};

/**
 * Builds the `claude -p` command for a run. The selected entity's body goes in via
 * `--append-system-prompt` (or `--append-system-prompt-file` when a sandbox dir is
 * given — large prompts must stay off argv), a CURATED agent+skill catalog via
 * `--agents` JSON (each delegatable through the Agent tool with its own
 * prompt/tools/model — bounded by {@link MAX_CATALOG_AGENTS} so the whole library
 * never overflows the OS argv limit, spawn E2BIG), and permissions via
 * `--permission-mode dontAsk` + `--allowedTools` mapped from the entity's `tools`.
 * This runs under the Max subscription with no extra API/classifier cost.
 *
 * Args are built up-front and persisted in the run spec, so the approval→resume
 * path replays them unchanged — gated runs spawn with the same catalog.
 */
@Injectable()
export class ClaudeRunCommandService {
  constructor(
    private readonly agents: AgentsStorageService,
    private readonly skills: SkillsStorageService,
    private readonly hooks: HooksStorageService,
    private readonly mcp: McpServersStorageService,
    private readonly mcpCredentials: McpCredentialsStore,
  ) {}

  async buildClaudeCommand(opts: ClaudeRunOptions): Promise<{
    command: string;
    args: string[];
    /**
     * The agent ids in this run's curated `--agents` catalog (Fáze 2b) — every
     * subagent this session could delegate to via the `Task` tool. Persisted on the
     * run record at spawn so a later orchestrator-run intent evaluation can pull each
     * one's `gates`/`requires_approval` back in (strictest-union), since delegation
     * inside a single `claude -p` process otherwise loses the delegate's own identity.
     */
    catalogAgentIds: string[];
  }> {
    // Enabled MCP servers are injected into every run: their tools widen the
    // session allow-list (see buildCatalog) and their connection config rides
    // `--mcp-config`. A listing failure degrades to no MCP (never blocks the run).
    const mcpServers = (await this.mcp.list().catch((): McpServer[] => [])).filter(
      (server) => server.enabled,
    );
    const { catalog, allowedTools, catalogAgentIds } = await this.buildCatalog(
      opts.tools,
      mcpServers,
      opts.delegates,
      opts.toolGrants,
    );
    // Custom hooks merge into `--settings` alongside the locked approval hook; a
    // listing failure simply yields the approval-only settings (fail-open to the
    // safe floor, never blocking the run).
    const customHooks = (await this.hooks.list().catch((): Hook[] => [])).filter(
      (hook) => hook.enabled,
    );
    const mcpConfig = await this.buildMcpConfig(mcpServers);
    // The assembled system prompt (contract + grounding + resume + body) can be large.
    // When a sandbox dir is given, spill it to a file and pass it by path — keeping it
    // off argv, where it counts toward the same OS limit `--agents` can blow (E2BIG).
    const systemPrompt = withOperatingContract(
      opts.instructions,
      opts.grounding,
      opts.resumeContext,
    );
    const systemPromptArgs = await this.buildSystemPromptArgs(systemPrompt, opts.systemPromptDir);
    const args = [
      "-p",
      withExecutionDirective(opts.task.trim() ? opts.task : KICKOFF_FALLBACK),
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      ...allowedTools,
      ...systemPromptArgs,
      "--agents",
      JSON.stringify(catalog),
      // Mid-run approval gate (+ any enabled custom hooks): a PreToolUse hook
      // intercepts destructive Bash and blocks on a decision RunnerCore writes (see
      // claude-approval-hook.mjs). The approval hook always stays first/authoritative.
      "--settings",
      buildSettings(customHooks),
    ];
    // Connected MCP servers (UI-managed; the repo-root .mcp.json is NOT wired to
    // runs). The config carries real secrets (env/headers/Bearer token, see
    // buildMcpConfig) — spilled to a 0600 file under the sandbox dir and passed by
    // path when one is available, so it stays off argv (ps-visible otherwise);
    // inline JSON only as a fallback when no sandbox dir is given. Omitted entirely
    // when no server is enabled.
    if (mcpConfig) {
      args.push(...(await this.buildMcpConfigArgs(mcpConfig, opts.systemPromptDir)));
    }
    // Full-transcript logging: stream every step as JSON (the runner flattens it back
    // to readable log lines). `stream-json` requires `--verbose` in print mode.
    if (opts.streamTranscript) args.push("--output-format", "stream-json", "--verbose");
    // Grant access to dirs outside the sandbox (e.g. the Cleaner's target).
    for (const dir of opts.grantDirs ?? []) args.push("--add-dir", dir);
    // Phase 49: continue a captured session (re-run of an errored/interrupted run)
    // instead of a cold start — the conversation history carries the prior context.
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    if (opts.model) args.push("--model", opts.model);
    if (opts.thinking) {
      const effort = THINKING_TO_EFFORT[opts.thinking];
      if (effort) args.push("--effort", effort);
    }
    // `CLAUDE_BIN` is a test seam (point it at a stub binary); production runs the
    // real `claude` CLI. The command/args are always the real claude shape.
    return { command: process.env.CLAUDE_BIN ?? "claude", args, catalogAgentIds };
  }

  /**
   * The argv pair carrying the system prompt: `--append-system-prompt-file <path>`
   * when a sandbox dir is given (the prompt is written there first, so it stays off
   * argv and survives an approval→resume that replays the same args), else an inline
   * `--append-system-prompt <text>`. The dir is created if absent — at build time the
   * run's sandbox may not exist yet (the core mkdirs it on spawn).
   */
  private async buildSystemPromptArgs(
    systemPrompt: string,
    systemPromptDir?: string,
  ): Promise<string[]> {
    if (!systemPromptDir) return ["--append-system-prompt", systemPrompt];
    await fs.mkdir(systemPromptDir, { recursive: true });
    const file = path.join(systemPromptDir, SYSTEM_PROMPT_FILE);
    await fs.writeFile(file, systemPrompt, "utf8");
    return ["--append-system-prompt-file", file];
  }

  /**
   * The argv pair carrying the MCP config: `--mcp-config <path>` when a sandbox dir
   * is given (mirrors {@link buildSystemPromptArgs} exactly), else an inline
   * `--mcp-config <json>` fallback — unchanged from the prior behaviour, so any
   * caller/test that never supplies a sandbox dir keeps working as before.
   *
   * Unlike the system-prompt file, this payload carries a live credential (server
   * env vars, auth headers, a Bearer token — see {@link buildMcpConfig}), so the
   * file is written `{ mode: 0o600 }` — owner-only — a deliberate hardening beyond
   * the system-prompt precedent, which isn't secret-bearing. The dir is created if
   * absent — at build time the run's sandbox may not exist yet (the core mkdirs it
   * on spawn). Reuses the same sandbox dir the system prompt uses (`opts.systemPromptDir`)
   * rather than a second dir option — both files live in the same per-run sandbox.
   *
   * Resume-safety: the file lives in the run's persistent sandbox cwd, so an
   * approval→resume that respawns with the same persisted `args` array resolves the
   * same path — no extra persistence work, same guarantee as the system-prompt file.
   */
  private async buildMcpConfigArgs(
    mcpConfig: { mcpServers: Record<string, Record<string, unknown>> },
    mcpConfigDir?: string,
  ): Promise<string[]> {
    if (!mcpConfigDir) return ["--mcp-config", JSON.stringify(mcpConfig)];
    await fs.mkdir(mcpConfigDir, { recursive: true });
    const file = path.join(mcpConfigDir, MCP_CONFIG_FILE);
    await fs.writeFile(file, JSON.stringify(mcpConfig), { mode: 0o600 });
    return ["--mcp-config", file];
  }

  /**
   * Every agent and skill as the delegatable subagent catalog, plus the session
   * `--allowedTools` allow-list. Agents win on an id collision (richer entry:
   * tools + model). Tolerant — a failed listing yields an empty catalog.
   *
   * `allowedTools` is the **union** of the primary's tools and every catalog
   * subagent's tools (+ `Agent`): under `dontAsk` the allow-list is session-wide,
   * so a delegated worker needs its tools on it or its calls are denied. The
   * union is the orchestration ceiling (bounded by what agents actually declare).
   */
  private async buildCatalog(
    primaryTools: readonly string[] | undefined,
    mcpServers: readonly McpServer[] = [],
    delegates?: readonly string[],
    /** Phase 108: the FINAL (already-intersected) tool-grant set for this run. */
    toolGrants: readonly string[] = [],
  ): Promise<{
    catalog: Record<string, CatalogEntry>;
    allowedTools: string[];
    /** The curated agent ids folded into `catalog` (skills excluded — see Fáze 2b). */
    catalogAgentIds: string[];
  }> {
    // Phase 4c: the delegation catalog is dispatchable by construction — a
    // `status: "proposed"` candidate awaiting its `agent-proposal` approval must
    // never be delegatable.
    const [allAgents, skills] = await Promise.all([
      this.agents.listActive().catch((): Agent[] => []),
      this.skills.list().catch((): Skill[] => []),
    ]);
    // Curate down to a bounded, relevant set — the whole library inlined into
    // `--agents` overflows the OS argv limit (spawn E2BIG). `allowedTools` narrows to
    // this subset's tools, which is correct: a dropped agent can't be delegated to.
    const agents = selectCatalogAgents(allAgents, delegates);

    // `Agent` lets the run delegate; `Skill` lets it invoke skills and the
    // materialized custom commands (`/<id>`) downloaded bundles depend on — both
    // would be denied under `dontAsk` otherwise.
    const allowed = new Set<string>(["Agent", "Skill", ...mapTools(primaryTools)]);
    // Each enabled MCP server contributes its whole tool namespace to the
    // session allow-list. Under `dontAsk` an `mcp__<id>__<tool>` call is denied
    // unless `mcp__<id>__*` is allowed (the bare `mcp__<id>` does not match).
    for (const server of mcpServers) allowed.add(`mcp__${server.id}__*`);
    // Phase 108: union the run's confirmed tool grants (already intersected against
    // the agent's own `optionalTools` ceiling by the caller — see AgentRunnerService.
    // launch). See resolveGrantId's docblock for the id-shape assumption.
    for (const grant of toolGrants) {
      const resolved = resolveGrantId(grant, mcpServers);
      if (resolved) allowed.add(resolved);
    }
    const catalog: Record<string, CatalogEntry> = {};

    for (const agent of agents) {
      const tools = toSubagentTools(agent.tools);
      for (const t of mapTools(agent.tools)) allowed.add(t);
      catalog[agent.id] = {
        description: agent.description ?? agent.name ?? agent.id,
        prompt: agent.instructions,
        ...(tools ? { tools } : {}),
        ...(agent.model ? { model: agent.model } : {}),
      };
    }
    for (const skill of skills) {
      if (catalog[skill.id]) continue;
      // Skills carry no structured tools — give them the conservative default.
      const tools = toSubagentTools(undefined);
      for (const t of mapTools(undefined)) allowed.add(t);
      catalog[skill.id] = {
        description: skill.desc ?? skill.name ?? skill.id,
        prompt: skill.instructions,
        ...(tools ? { tools } : {}),
      };
    }
    return { catalog, allowedTools: [...allowed], catalogAgentIds: agents.map((a) => a.id) };
  }

  /**
   * Assemble the `--mcp-config` payload from the enabled servers, merging each
   * server's secret (from the gitignored credentials store) into its config: a
   * stdio server gets its secret `env`; an http/sse server gets its secret
   * `headers` (plus an `authToken` folded into an `Authorization: Bearer` header).
   * Returns `null` when no servers are enabled so the caller omits the flag.
   * Secrets are read here and never logged.
   */
  private async buildMcpConfig(
    servers: readonly McpServer[],
  ): Promise<{ mcpServers: Record<string, Record<string, unknown>> } | null> {
    if (servers.length === 0) return null;
    const mcpServers: Record<string, Record<string, unknown>> = {};
    for (const server of servers) {
      const creds = await this.mcpCredentials.read(server.id).catch(() => null);
      if (server.type === "stdio") {
        mcpServers[server.id] = {
          type: "stdio",
          ...(server.command ? { command: server.command } : {}),
          ...(server.args ? { args: server.args } : {}),
          ...(creds?.env ? { env: creds.env } : {}),
        };
      } else {
        const headers = {
          ...(server.headers ?? {}),
          ...(creds?.headers ?? {}),
          ...(creds?.authToken ? { Authorization: `Bearer ${creds.authToken}` } : {}),
        };
        mcpServers[server.id] = {
          type: server.type,
          ...(server.url ? { url: server.url } : {}),
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
        };
      }
    }
    return { mcpServers };
  }
}
