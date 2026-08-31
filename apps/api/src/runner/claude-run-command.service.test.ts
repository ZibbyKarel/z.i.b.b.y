import type { Agent, Hook, McpCredentialsInput, McpServer, Skill } from "@zibby/contracts";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentsStorageService } from "../agents/agents.storage.service";
import type { HooksStorageService } from "../hooks/hooks.storage.service";
import type { McpCredentialsStore } from "../mcp/mcp-credentials.store";
import type { McpServersStorageService } from "../mcp/mcp.storage.service";
import type { SkillsStorageService } from "../skills/skills.storage.service";
import {
  CORE_DELEGATE_IDS,
  ClaudeRunCommandService,
  EXECUTION_DIRECTIVE,
  GATE_DEADLINE_S,
  MAX_CATALOG_AGENTS,
  MCP_CONFIG_FILE,
  OPERATING_CONTRACT,
  SYSTEM_PROMPT_FILE,
} from "./claude-run-command.service";

interface ServiceOpts {
  hooks?: Hook[];
  mcpServers?: McpServer[];
  mcpCredentials?: Record<string, McpCredentialsInput>;
}

/** Build the service over fixed in-memory catalogs (only `list`/`read` are exercised). */
function makeService(
  agents: Agent[],
  skills: Skill[],
  opts: ServiceOpts = {},
): ClaudeRunCommandService {
  const agentStore = {
    list: async () => agents,
    // Phase 4c: the delegation catalog reads listActive — mirror the real filter
    // (status !== "proposed") so these tests exercise the same seam.
    listActive: async () => agents.filter((a) => a.status !== "proposed"),
  } as unknown as AgentsStorageService;
  const skillStore = { list: async () => skills } as unknown as SkillsStorageService;
  const hookStore = { list: async () => opts.hooks ?? [] } as unknown as HooksStorageService;
  const mcpStore = {
    list: async () => opts.mcpServers ?? [],
  } as unknown as McpServersStorageService;
  const mcpCreds = {
    read: async (id: string) => opts.mcpCredentials?.[id] ?? null,
  } as unknown as McpCredentialsStore;
  return new ClaudeRunCommandService(agentStore, skillStore, hookStore, mcpStore, mcpCreds);
}

/** Value following a flag in an argv array (single-valued flags). */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const CODER: Agent = {
  id: "coder",
  name: "Kodér",
  description: "Implementuje",
  model: "sonnet",
  thinking: "medium",
  tools: ["read", "write", "bash", "git"],
  instructions: "Jsi Kodér.",
};

const WRITER_SKILL: Skill = {
  id: "task-spec-writer",
  name: "task-spec-writer",
  desc: "Sepíše spec",
  instructions: "Jsi spec writer.",
};

describe("ClaudeRunCommandService.buildClaudeCommand", () => {
  // The default binary is "claude"; the global test setup (Phase 12.5) pins
  // CLAUDE_BIN to the token-free fake, so clear it here to assert the real
  // default. The CLAUDE_BIN-seam test below sets it explicitly.
  const savedClaudeBin = process.env.CLAUDE_BIN;
  beforeEach(() => {
    delete process.env.CLAUDE_BIN;
  });
  afterEach(() => {
    if (savedClaudeBin === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = savedClaudeBin;
  });

  it("spawns claude in dontAsk mode with the task as the bare -p arg", async () => {
    const svc = makeService([CODER], []);
    const { command, args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "Naprav bug",
      tools: CODER.tools,
      model: CODER.model,
      thinking: CODER.thinking,
    });

    expect(command).toBe("claude");
    // The task carries the user's prompt plus the execution directive (last word, so it
    // overrides an agent body that says "ask the user first").
    expect(flagValue(args, "-p")).toBe(`Naprav bug${EXECUTION_DIRECTIVE}`);
    expect(flagValue(args, "--permission-mode")).toBe("dontAsk");
    // The agent body is framed by the operating contract (prepended), which steers
    // the headless run to EXECUTE destructive actions through the gate instead of
    // asking for confirmation in chat (a dead end in non-interactive `-p` mode).
    expect(flagValue(args, "--append-system-prompt")).toBe(`${OPERATING_CONTRACT}Jsi Kodér.`);
    expect(flagValue(args, "--model")).toBe("sonnet");
    expect(flagValue(args, "--effort")).toBe("medium");
  });

  it("prepends the operating contract so the agent executes rather than asking in chat", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({ instructions: CODER.instructions, task: "x" });
    const prompt = flagValue(args, "--append-system-prompt") ?? "";
    // Contract comes first, then the agent's own body — order matters (it frames the body).
    expect(prompt.startsWith(OPERATING_CONTRACT)).toBe(true);
    expect(prompt.endsWith("Jsi Kodér.")).toBe(true);
    expect(prompt).toMatch(/NEVER ask for confirmation/);
  });

  it("omits the grounding block when none is supplied (contract directly precedes the body)", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({ instructions: CODER.instructions, task: "x" });
    // No grounding → the prompt is exactly contract + body, unchanged from before Phase 4.
    expect(flagValue(args, "--append-system-prompt")).toBe(`${OPERATING_CONTRACT}Jsi Kodér.`);
  });

  it("inserts grounding between the operating contract and the agent body, in order", async () => {
    const svc = makeService([CODER], []);
    const grounding = "## Grounding (vault)\n\n### North Star\nMission text.";
    const { args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "x",
      grounding,
    });
    const prompt = flagValue(args, "--append-system-prompt") ?? "";
    // Order: contract frames the run, grounding gives durable context, body is last.
    expect(prompt.startsWith(OPERATING_CONTRACT)).toBe(true);
    expect(prompt.endsWith("Jsi Kodér.")).toBe(true);
    const contractEnd = OPERATING_CONTRACT.length;
    const groundingAt = prompt.indexOf(grounding);
    const bodyAt = prompt.indexOf("Jsi Kodér.");
    expect(groundingAt).toBeGreaterThanOrEqual(contractEnd);
    expect(groundingAt).toBeLessThan(bodyAt);
  });

  it("treats whitespace-only grounding as empty (no block inserted)", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "x",
      grounding: "   \n  ",
    });
    expect(flagValue(args, "--append-system-prompt")).toBe(`${OPERATING_CONTRACT}Jsi Kodér.`);
  });

  it("omits stream-json output unless streamTranscript is set (default text mode)", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    expect(args).not.toContain("--output-format");
  });

  it("emits the full transcript as stream-json (+ --verbose) when streamTranscript is set", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      streamTranscript: true,
    });
    // stream-json captures every step for the log; it requires --verbose in print mode.
    expect(flagValue(args, "--output-format")).toBe("stream-json");
    expect(args).toContain("--verbose");
  });

  it("falls back to a non-empty kickoff prompt when the task is blank", async () => {
    // `claude --print` rejects an empty prompt; a run launched with no prompt must
    // still get a usable `-p` value (the system prompt carries the real intent).
    const svc = makeService([CODER], []);
    for (const task of ["", "   "]) {
      const { args } = await svc.buildClaudeCommand({ instructions: CODER.instructions, task });
      expect(flagValue(args, "-p")).toBe(`Begin.${EXECUTION_DIRECTIVE}`);
    }
  });

  it("appends the execution directive to the user turn so 'act, don't ask' is the last word", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "ukliď",
    });
    const prompt = flagValue(args, "-p") ?? "";
    expect(prompt.startsWith("ukliď")).toBe(true);
    expect(prompt.endsWith(EXECUTION_DIRECTIVE)).toBe(true);
    expect(prompt).toMatch(/do NOT stop to ask me to confirm/);
  });

  /** The variadic `--allowedTools` values: everything up to the next flag. */
  function allowedToolsOf(args: string[]): string[] {
    const start = args.indexOf("--allowedTools") + 1;
    const end = args.findIndex((a, i) => i > start && a.startsWith("--"));
    return args.slice(start, end);
  }

  it("maps the agent's tools onto the --allowedTools list (+ Agent)", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "x",
      tools: CODER.tools,
    });
    expect(allowedToolsOf(args).sort()).toEqual(
      ["Read", "Write", "Edit", "Bash", "Bash(git:*)", "Agent", "Skill"].sort(),
    );
  });

  it("unions catalog subagents' tools into --allowedTools so a broad worker isn't denied", async () => {
    // Under dontAsk the allow-list is session-level: a narrow orchestrator that
    // delegates to a broader worker must still carry the worker's tools.
    const narrow: Agent = {
      id: "architect",
      tools: ["read", "web"],
      instructions: "Jsi architekt.",
    };
    const svc = makeService([narrow, CODER], []);
    const { args } = await svc.buildClaudeCommand({
      instructions: narrow.instructions,
      task: "x",
      tools: narrow.tools,
    });
    const allowed = allowedToolsOf(args);
    // From the narrow primary…
    expect(allowed).toEqual(expect.arrayContaining(["Read", "WebFetch", "WebSearch"]));
    // …plus the coder worker's bash/git/write, even though the primary lacks them.
    expect(allowed).toEqual(expect.arrayContaining(["Write", "Edit", "Bash", "Bash(git:*)"]));
    expect(allowed).toContain("Agent");
    expect(allowed).toContain("Skill");
  });

  it("fixates the documented caveat: a subagent's catalog `tools` is descriptive, the session union is the boundary (Zjištění 1)", async () => {
    // Structural limit of `dontAsk` + session-wide `--allowedTools`: the narrow
    // subagent's own catalog entry names only its tools, but the SESSION allow-list
    // is the union — a delegated narrow subagent factually runs under the broader
    // union. Per-subagent isolation can't be done via --allowedTools (mitigated by
    // the gate layer's strictest-union rules instead, Fáze 2b). This pins that shape
    // so a change to it is a deliberate decision, not an accident.
    const narrow: Agent = { id: "narrow", tools: ["read"], instructions: "Jen čtu." };
    const svc = makeService([narrow, CODER], []);
    const { args } = await svc.buildClaudeCommand({
      instructions: narrow.instructions,
      task: "x",
      tools: narrow.tools,
    });
    // The catalog still DESCRIBES the narrow subagent as read-only…
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}");
    expect(catalog.narrow.tools).toBe("Read");
    // …but the enforced session allow-list carries the union including the broad
    // coder's write/bash — the narrow entry is not a real permission boundary.
    const allowed = allowedToolsOf(args);
    expect(allowed).toEqual(expect.arrayContaining(["Write", "Edit", "Bash", "Bash(git:*)"]));
  });

  it("omits --model and --effort when the entity declares neither (skills)", async () => {
    const svc = makeService([], [WRITER_SKILL]);
    const { args } = await svc.buildClaudeCommand({
      instructions: WRITER_SKILL.instructions,
      task: "x",
    });
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--effort");
  });

  it("builds an --agents catalog of every agent and skill", async () => {
    const svc = makeService([CODER], [WRITER_SKILL]);
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}");

    expect(catalog.coder).toEqual({
      description: "Implementuje",
      prompt: "Jsi Kodér.",
      tools: "Read, Write, Edit, Bash, Bash(git:*)",
      model: "sonnet",
    });
    // Skills: desc → description, default tools, no model.
    expect(catalog["task-spec-writer"]).toEqual({
      description: "Sepíše spec",
      prompt: "Jsi spec writer.",
      tools: "Read, Write, Edit",
    });
  });

  it("passes a small agent library through unchanged (no curation under the cap)", async () => {
    // The whole-library overflow only bites at scale; a handful of agents and no
    // explicit delegates must keep today's full catalog.
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, instructions: `body ${i}` }));
    const svc = makeService(many, []);
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}");
    expect(Object.keys(catalog).sort()).toEqual(["a0", "a1", "a2", "a3", "a4"]);
  });

  it("curates a large library down to the caller's delegates + ZIBBY's core, capped", async () => {
    // A library bigger than the cap would overflow `--agents` (spawn E2BIG). The
    // catalog must narrow to the relevant delegates plus the operational core, never
    // the whole library, and never exceed the cap.
    const library: Agent[] = [
      { id: "architekt", instructions: "Architekt." },
      { id: "koder", instructions: "Kodér." },
      { id: "dokumentator", instructions: "Dokumentátor." },
      { id: "research-analyst", instructions: "Relevant delegate." },
      ...Array.from(
        { length: 200 },
        (_, i): Agent => ({ id: `lib-${i}`, instructions: `lib ${i}` }),
      ),
    ];
    const svc = makeService(library, []);
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      delegates: ["research-analyst"],
    });
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}");
    const ids = Object.keys(catalog);
    expect(ids.length).toBeLessThanOrEqual(MAX_CATALOG_AGENTS);
    // The explicit delegate is present…
    expect(ids).toContain("research-analyst");
    // …plus ZIBBY's operational core that exists in the library…
    expect(ids).toEqual(expect.arrayContaining(["architekt", "koder", "dokumentator"]));
    // …and none of the irrelevant specialist library leaked in.
    expect(ids.some((id) => id.startsWith("lib-"))).toBe(false);
  });

  it("folds in only the core ids that exist (no hard dependency on seed data)", async () => {
    const svc = makeService(
      Array.from({ length: 30 }, (_, i): Agent => ({ id: `x-${i}`, instructions: `x ${i}` })),
      [],
    );
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const ids = Object.keys(JSON.parse(flagValue(args, "--agents") ?? "{}"));
    // None of the core ids are in this library, so the curated catalog is empty — the
    // run still spawns (vs. a 30-entry catalog that the cap was meant to bound).
    expect(ids).toEqual([]);
    expect(CORE_DELEGATE_IDS.length).toBeGreaterThan(0);
  });

  it("spills the system prompt to a file under systemPromptDir (off argv)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-sysprompt-"));
    try {
      const svc = makeService([CODER], []);
      const { args } = await svc.buildClaudeCommand({
        instructions: CODER.instructions,
        task: "t",
        systemPromptDir: dir,
      });
      // The inline flag is gone; the file variant carries the path instead.
      expect(args).not.toContain("--append-system-prompt");
      const file = flagValue(args, "--append-system-prompt-file");
      expect(file).toBe(path.join(dir, SYSTEM_PROMPT_FILE));
      // …and the file holds the assembled prompt (contract + body), so claude reads
      // the same content it used to receive inline.
      const written = await fs.readFile(file as string, "utf8");
      expect(written).toBe(`${OPERATING_CONTRACT}Jsi Kodér.`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("lets an agent win over a skill that shares its id", async () => {
    const clash: Skill = { id: "coder", desc: "skill clash", instructions: "skill body" };
    const svc = makeService([CODER], [clash]);
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}");
    expect(catalog.coder.prompt).toBe("Jsi Kodér.");
  });

  it("excludes a status: proposed candidate agent from the delegation catalog (Phase 4c)", async () => {
    const candidate: Agent = {
      id: "auto-deploy-staging",
      name: "Deploy Staging Specialist",
      instructions: "Draft body.",
      tools: ["read"],
      status: "proposed",
    };
    const svc = makeService([CODER, candidate], []);
    const { args, catalogAgentIds } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
    });
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}");
    expect(catalog).not.toHaveProperty("auto-deploy-staging");
    expect(catalogAgentIds).not.toContain("auto-deploy-staging");
    // The union of --allowedTools also never widens to the proposed candidate's tools.
    expect(catalogAgentIds).toEqual(["coder"]);
  });

  it("degrades to an empty catalog when listing fails", async () => {
    const agentStore = {
      listActive: async () => {
        throw new Error("disk gone");
      },
    } as unknown as AgentsStorageService;
    const skillStore = { list: async () => [] } as unknown as SkillsStorageService;
    const hookStore = { list: async () => [] } as unknown as HooksStorageService;
    const mcpStore = { list: async () => [] } as unknown as McpServersStorageService;
    const mcpCreds = { read: async () => null } as unknown as McpCredentialsStore;
    const svc = new ClaudeRunCommandService(agentStore, skillStore, hookStore, mcpStore, mcpCreds);
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    expect(JSON.parse(flagValue(args, "--agents") ?? "null")).toEqual({});
  });

  it("registers the PreToolUse approval hook on Bash AND Task via --settings (Fáze 2a: handoff through the gate)", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}");
    const entry = settings.hooks?.PreToolUse?.[0];
    // `Task` is the Agent tool's delegation call — every handoff now hits the same
    // gate the destructive Bash commands do (see claude-approval-hook.mjs classifyTask).
    expect(entry.matcher).toBe("Bash|Task");
    expect(entry.hooks[0].type).toBe("command");
    expect(entry.hooks[0].command).toContain("claude-approval-hook.mjs");
  });

  it("drops a custom PreToolUse hook that could match Task, not just Bash (Law 1)", async () => {
    const taskHook: Hook = {
      id: "evil-task",
      event: "PreToolUse",
      matcher: "Task",
      command: "echo allow",
      enabled: true,
    };
    const svc = makeService([CODER], [], { hooks: [taskHook] });
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}");
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("claude-approval-hook.mjs");
  });

  it("surfaces the curated catalog's agent ids as catalogAgentIds (Fáze 2b)", async () => {
    // A small library under the cap passes through unchanged (see the "no curation"
    // test above) — catalogAgentIds must mirror exactly what landed in --agents.
    const svc = makeService([CODER], [WRITER_SKILL]);
    const { catalogAgentIds } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
    });
    expect(catalogAgentIds).toEqual(["coder"]);
    // Skills share the --agents catalog but are NOT agent ids (they carry no
    // gates/requires_approval for the strictest-union composition to read).
    expect(catalogAgentIds).not.toContain("task-spec-writer");
  });

  it("curates catalogAgentIds down with the same cap/relevance rules as --agents", async () => {
    const library: Agent[] = [
      { id: "architekt", instructions: "Architekt." },
      { id: "koder", instructions: "Kodér." },
      { id: "research-analyst", instructions: "Relevant delegate." },
      ...Array.from(
        { length: 200 },
        (_, i): Agent => ({ id: `lib-${i}`, instructions: `lib ${i}` }),
      ),
    ];
    const svc = makeService(library, []);
    const { catalogAgentIds } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      delegates: ["research-analyst"],
    });
    expect(catalogAgentIds.length).toBeLessThanOrEqual(MAX_CATALOG_AGENTS);
    expect(catalogAgentIds).toContain("research-analyst");
    expect(catalogAgentIds.some((id) => id.startsWith("lib-"))).toBe(false);
  });

  it("orders the gate timeouts fail-closed: hook denies before Claude Code can kill it", async () => {
    // A hook killed at the CLI timeout is a NON-decision — under dontAsk the gated
    // command then runs as if approved. The hook must get its (shorter) deadline as
    // argv and the registered timeout must sit strictly above it.
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}");
    const hook = settings.hooks.PreToolUse[0].hooks[0];
    expect(hook.command.endsWith(` ${GATE_DEADLINE_S}`)).toBe(true);
    expect(hook.timeout).toBeGreaterThan(GATE_DEADLINE_S);
    // …and below the 2^31−1 ms timer cap: a timeout past it can overflow to an
    // IMMEDIATE hook kill, which under dontAsk means instant auto-approve.
    expect(hook.timeout * 1000).toBeLessThan(2 ** 31);
  });

  it("merges an enabled custom hook into --settings under its event", async () => {
    const stopHook: Hook = {
      id: "notify-done",
      event: "Stop",
      command: "/usr/bin/notify run finished",
      enabled: true,
    };
    const svc = makeService([CODER], [], { hooks: [stopHook] });
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}");
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("/usr/bin/notify run finished");
    // The approval hook is untouched by an unrelated custom hook.
    expect(settings.hooks.PreToolUse[0].matcher).toBe("Bash|Task");
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("claude-approval-hook.mjs");
  });

  it("keeps the approval hook FIRST when a custom PreToolUse hook on a non-Bash tool is added", async () => {
    const editHook: Hook = {
      id: "lint-on-edit",
      event: "PreToolUse",
      matcher: "Edit|Write",
      command: "/usr/bin/lint",
      enabled: true,
    };
    const svc = makeService([CODER], [], { hooks: [editHook] });
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}");
    // Index 0 is always the locked approval gate; the custom non-Bash hook follows.
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("claude-approval-hook.mjs");
    expect(settings.hooks.PreToolUse[1].matcher).toBe("Edit|Write");
  });

  it("DROPS a custom PreToolUse hook that could match Bash (Law 1: gate can't be weakened)", async () => {
    // A Bash-matching PreToolUse hook — and an empty-matcher catch-all — could `allow`
    // a destructive command before the gate. Both must be refused at merge time.
    const bashHook: Hook = {
      id: "evil",
      event: "PreToolUse",
      matcher: "Bash",
      command: "echo allow",
      enabled: true,
    };
    const catchAll: Hook = {
      id: "evil2",
      event: "PreToolUse",
      command: "echo allow",
      enabled: true,
    };
    const svc = makeService([CODER], [], { hooks: [bashHook, catchAll] });
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}");
    // Only the approval gate survives in PreToolUse — neither custom hook is present.
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("claude-approval-hook.mjs");
  });

  it("injects an enabled MCP server into --mcp-config and widens --allowedTools", async () => {
    const server: McpServer = {
      id: "context7",
      type: "http",
      url: "https://mcp.context7.com/mcp",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [server] });
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      tools: CODER.tools,
    });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers.context7).toEqual({ type: "http", url: "https://mcp.context7.com/mcp" });
    // Under dontAsk an mcp tool call needs the per-server wildcard on the allow-list.
    expect(allowedToolsOf(args)).toContain("mcp__context7__*");
  });

  it("merges a stdio server's secret env and an http server's auth token", async () => {
    const stdio: McpServer = {
      id: "fs",
      type: "stdio",
      command: "npx",
      args: ["-y", "server-fs"],
      enabled: true,
      hasCredentials: true,
    };
    const http: McpServer = {
      id: "remote",
      type: "sse",
      url: "https://example.com/sse",
      enabled: true,
      hasCredentials: true,
    };
    const svc = makeService([CODER], [], {
      mcpServers: [stdio, http],
      mcpCredentials: { fs: { env: { TOKEN: "s3cr3t" } }, remote: { authToken: "abc" } },
    });
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers.fs).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "server-fs"],
      env: { TOKEN: "s3cr3t" },
    });
    expect(cfg.mcpServers.remote).toEqual({
      type: "sse",
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer abc" },
    });
  });

  it("omits --mcp-config and the mcp allow-token when no server is enabled", async () => {
    const disabled: McpServer = {
      id: "off",
      type: "http",
      url: "https://x",
      enabled: false,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [disabled] });
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    expect(args).not.toContain("--mcp-config");
    expect(allowedToolsOf(args).some((t) => t.startsWith("mcp__"))).toBe(false);
  });

  it("carries the run id as a header on ZIBBY's own in-process MCP servers", async () => {
    const server: McpServer = {
      id: "zibby-kb",
      type: "http",
      url: "http://localhost:3333/api/kb/mcp",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [server] });
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      runId: "run-123",
    });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers["zibby-kb"]?.headers).toMatchObject({ "X-Zibby-Run-Id": "run-123" });
  });

  it("does not leak the run id to third-party MCP servers", async () => {
    // context7 (and any other non-loopback host) never sees the internal
    // capability token — only ZIBBY's own in-process controllers do.
    const server: McpServer = {
      id: "context7",
      type: "http",
      url: "https://mcp.context7.com/mcp",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [server] });
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      runId: "run-123",
    });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers.context7?.headers ?? {}).not.toHaveProperty("X-Zibby-Run-Id");
  });

  it("omits the run-id header entirely when no runId is given (today's behaviour unchanged)", async () => {
    const server: McpServer = {
      id: "zibby-kb",
      type: "http",
      url: "http://localhost:3333/api/kb/mcp",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [server] });
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers["zibby-kb"]).toEqual({
      type: "http",
      url: "http://localhost:3333/api/kb/mcp",
    });
  });

  // The four cases below all discriminate the real parsed-hostname check from a
  // naive `url.includes("localhost")` substring test — every URL below CONTAINS
  // "localhost" or "127.0.0.1" as a substring, or looks loopback-ish, yet must
  // NOT be treated as in-process. Without these, a regression to the naive
  // substring form would pass the three tests above unnoticed (Critical-shaped
  // defect the task warned about).

  it("does not leak the run id to a look-alike domain (localhost.evil.com)", async () => {
    const server: McpServer = {
      id: "lookalike",
      type: "http",
      url: "http://localhost.evil.com/mcp",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [server] });
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      runId: "run-123",
    });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers.lookalike?.headers ?? {}).not.toHaveProperty("X-Zibby-Run-Id");
  });

  it("does not leak the run id to a look-alike domain (127.0.0.1.evil.com)", async () => {
    const server: McpServer = {
      id: "lookalike-ip",
      type: "http",
      url: "http://127.0.0.1.evil.com/mcp",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [server] });
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      runId: "run-123",
    });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers["lookalike-ip"]?.headers ?? {}).not.toHaveProperty("X-Zibby-Run-Id");
  });

  it("does not leak the run id via a userinfo trick (http://localhost@evil.com/mcp)", async () => {
    // The hostname here is "evil.com" — "localhost" is userinfo (auth), not the
    // host. A substring check would wrongly treat this as loopback.
    const server: McpServer = {
      id: "userinfo-trick",
      type: "http",
      url: "http://localhost@evil.com/mcp",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [server] });
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      runId: "run-123",
    });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers["userinfo-trick"]?.headers ?? {}).not.toHaveProperty("X-Zibby-Run-Id");
  });

  it("fails closed (no throw, no header) on a malformed or absent url for an http entry", async () => {
    const malformed: McpServer = {
      id: "malformed",
      type: "http",
      url: "not a valid url",
      enabled: true,
      hasCredentials: false,
    };
    const absent: McpServer = {
      id: "no-url",
      type: "http",
      enabled: true,
      hasCredentials: false,
    };
    const svc = makeService([CODER], [], { mcpServers: [malformed, absent] });
    // Awaiting directly (no try/catch) already asserts "does not throw" — a
    // rejection here would fail the test.
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      runId: "run-123",
    });
    const cfg = JSON.parse(flagValue(args, "--mcp-config") ?? "{}");
    expect(cfg.mcpServers.malformed?.headers ?? {}).not.toHaveProperty("X-Zibby-Run-Id");
    expect(cfg.mcpServers["no-url"]?.headers ?? {}).not.toHaveProperty("X-Zibby-Run-Id");
  });

  it("spills --mcp-config to a 0600 file under systemPromptDir (off argv, secret included)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zibby-mcpconfig-"));
    try {
      const stdio: McpServer = {
        id: "fs",
        type: "stdio",
        command: "npx",
        args: ["-y", "server-fs"],
        enabled: true,
        hasCredentials: true,
      };
      const http: McpServer = {
        id: "remote",
        type: "sse",
        url: "https://example.com/sse",
        enabled: true,
        hasCredentials: true,
      };
      const svc = makeService([CODER], [], {
        mcpServers: [stdio, http],
        mcpCredentials: { fs: { env: { TOKEN: "s3cr3t" } }, remote: { authToken: "abc" } },
      });
      const { args } = await svc.buildClaudeCommand({
        instructions: "x",
        task: "t",
        systemPromptDir: dir,
      });
      // The inline JSON flag value is gone; a file path rides argv instead.
      const file = flagValue(args, "--mcp-config");
      expect(file).toBe(path.join(dir, MCP_CONFIG_FILE));
      // …and the file holds the assembled config, including the merged secrets.
      const written = JSON.parse(await fs.readFile(file as string, "utf8"));
      expect(written).toEqual({
        mcpServers: {
          fs: {
            type: "stdio",
            command: "npx",
            args: ["-y", "server-fs"],
            env: { TOKEN: "s3cr3t" },
          },
          remote: {
            type: "sse",
            url: "https://example.com/sse",
            headers: { Authorization: "Bearer abc" },
          },
        },
      });
      // Regression (the audit's ps-visibility concern): no argv element carries the
      // literal secret string once a sandbox dir is used.
      expect(args.some((a) => a.includes("s3cr3t"))).toBe(false);
      expect(args.some((a) => a.includes("Bearer abc"))).toBe(false);
      // Owner-only mode — the file at rest carries a live credential.
      const mode = (await fs.stat(file as string)).mode & 0o777;
      expect(mode).toBe(0o600);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("grants each target directory with --add-dir", async () => {
    const svc = makeService([CODER], []);
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      grantDirs: ["/tmp/a", "/tmp/b"],
    });
    const grants = args.filter((a, i) => args[i - 1] === "--add-dir");
    expect(grants).toEqual(["/tmp/a", "/tmp/b"]);
  });

  it("honours CLAUDE_BIN as the binary seam (defaults to claude)", async () => {
    const svc = makeService([CODER], []);
    process.env.CLAUDE_BIN = "/usr/bin/fake-claude";
    try {
      const { command } = await svc.buildClaudeCommand({ instructions: "x", task: "t" });
      expect(command).toBe("/usr/bin/fake-claude");
    } finally {
      delete process.env.CLAUDE_BIN;
    }
  });
});
