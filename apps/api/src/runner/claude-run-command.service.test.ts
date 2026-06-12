import type { Agent, Skill } from "@zibby/contracts"
import { describe, expect, it } from "vitest"
import type { AgentsStorageService } from "../agents/agents.storage.service"
import type { SkillsStorageService } from "../skills/skills.storage.service"
import {
  ClaudeRunCommandService,
  EXECUTION_DIRECTIVE,
  GATE_DEADLINE_S,
  OPERATING_CONTRACT,
} from "./claude-run-command.service"

/** Build the service over fixed in-memory catalogs (only `list` is exercised). */
function makeService(agents: Agent[], skills: Skill[]): ClaudeRunCommandService {
  const agentStore = { list: async () => agents } as unknown as AgentsStorageService
  const skillStore = { list: async () => skills } as unknown as SkillsStorageService
  return new ClaudeRunCommandService(agentStore, skillStore)
}

/** Value following a flag in an argv array (single-valued flags). */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const CODER: Agent = {
  id: "coder",
  name: "Kodér",
  description: "Implementuje",
  model: "sonnet",
  thinking: "medium",
  tools: ["read", "write", "bash", "git"],
  instructions: "Jsi Kodér.",
}

const WRITER_SKILL: Skill = {
  id: "task-spec-writer",
  name: "task-spec-writer",
  desc: "Sepíše spec",
  instructions: "Jsi spec writer.",
}

describe("ClaudeRunCommandService.buildClaudeCommand", () => {
  it("spawns claude in dontAsk mode with the task as the bare -p arg", async () => {
    const svc = makeService([CODER], [])
    const { command, args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "Naprav bug",
      tools: CODER.tools,
      model: CODER.model,
      thinking: CODER.thinking,
    })

    expect(command).toBe("claude")
    // The task carries the user's prompt plus the execution directive (last word, so it
    // overrides an agent body that says "ask the user first").
    expect(flagValue(args, "-p")).toBe(`Naprav bug${EXECUTION_DIRECTIVE}`)
    expect(flagValue(args, "--permission-mode")).toBe("dontAsk")
    // The agent body is framed by the operating contract (prepended), which steers
    // the headless run to EXECUTE destructive actions through the gate instead of
    // asking for confirmation in chat (a dead end in non-interactive `-p` mode).
    expect(flagValue(args, "--append-system-prompt")).toBe(`${OPERATING_CONTRACT}Jsi Kodér.`)
    expect(flagValue(args, "--model")).toBe("sonnet")
    expect(flagValue(args, "--effort")).toBe("medium")
  })

  it("prepends the operating contract so the agent executes rather than asking in chat", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({ instructions: CODER.instructions, task: "x" })
    const prompt = flagValue(args, "--append-system-prompt") ?? ""
    // Contract comes first, then the agent's own body — order matters (it frames the body).
    expect(prompt.startsWith(OPERATING_CONTRACT)).toBe(true)
    expect(prompt.endsWith("Jsi Kodér.")).toBe(true)
    expect(prompt).toMatch(/NEVER ask for confirmation/)
  })

  it("omits the grounding block when none is supplied (contract directly precedes the body)", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({ instructions: CODER.instructions, task: "x" })
    // No grounding → the prompt is exactly contract + body, unchanged from before Phase 4.
    expect(flagValue(args, "--append-system-prompt")).toBe(`${OPERATING_CONTRACT}Jsi Kodér.`)
  })

  it("inserts grounding between the operating contract and the agent body, in order", async () => {
    const svc = makeService([CODER], [])
    const grounding = "## Grounding (vault)\n\n### North Star\nMission text."
    const { args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "x",
      grounding,
    })
    const prompt = flagValue(args, "--append-system-prompt") ?? ""
    // Order: contract frames the run, grounding gives durable context, body is last.
    expect(prompt.startsWith(OPERATING_CONTRACT)).toBe(true)
    expect(prompt.endsWith("Jsi Kodér.")).toBe(true)
    const contractEnd = OPERATING_CONTRACT.length
    const groundingAt = prompt.indexOf(grounding)
    const bodyAt = prompt.indexOf("Jsi Kodér.")
    expect(groundingAt).toBeGreaterThanOrEqual(contractEnd)
    expect(groundingAt).toBeLessThan(bodyAt)
  })

  it("treats whitespace-only grounding as empty (no block inserted)", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "x",
      grounding: "   \n  ",
    })
    expect(flagValue(args, "--append-system-prompt")).toBe(`${OPERATING_CONTRACT}Jsi Kodér.`)
  })

  it("omits stream-json output unless streamTranscript is set (default text mode)", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" })
    expect(args).not.toContain("--output-format")
  })

  it("emits the full transcript as stream-json (+ --verbose) when streamTranscript is set", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      streamTranscript: true,
    })
    // stream-json captures every step for the log; it requires --verbose in print mode.
    expect(flagValue(args, "--output-format")).toBe("stream-json")
    expect(args).toContain("--verbose")
  })

  it("falls back to a non-empty kickoff prompt when the task is blank", async () => {
    // `claude --print` rejects an empty prompt; a run launched with no prompt must
    // still get a usable `-p` value (the system prompt carries the real intent).
    const svc = makeService([CODER], [])
    for (const task of ["", "   "]) {
      const { args } = await svc.buildClaudeCommand({ instructions: CODER.instructions, task })
      expect(flagValue(args, "-p")).toBe(`Begin.${EXECUTION_DIRECTIVE}`)
    }
  })

  it("appends the execution directive to the user turn so 'act, don't ask' is the last word", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({ instructions: CODER.instructions, task: "ukliď" })
    const prompt = flagValue(args, "-p") ?? ""
    expect(prompt.startsWith("ukliď")).toBe(true)
    expect(prompt.endsWith(EXECUTION_DIRECTIVE)).toBe(true)
    expect(prompt).toMatch(/do NOT stop to ask me to confirm/)
  })

  /** The variadic `--allowedTools` values: everything up to the next flag. */
  function allowedToolsOf(args: string[]): string[] {
    const start = args.indexOf("--allowedTools") + 1
    const end = args.findIndex((a, i) => i > start && a.startsWith("--"))
    return args.slice(start, end)
  }

  it("maps the agent's tools onto the --allowedTools list (+ Agent)", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({
      instructions: CODER.instructions,
      task: "x",
      tools: CODER.tools,
    })
    expect(allowedToolsOf(args).sort()).toEqual(
      ["Read", "Write", "Edit", "Bash", "Bash(git:*)", "Agent"].sort(),
    )
  })

  it("unions catalog subagents' tools into --allowedTools so a broad worker isn't denied", async () => {
    // Under dontAsk the allow-list is session-level: a narrow orchestrator that
    // delegates to a broader worker must still carry the worker's tools.
    const narrow: Agent = { id: "architect", tools: ["read", "web"], instructions: "Jsi architekt." }
    const svc = makeService([narrow, CODER], [])
    const { args } = await svc.buildClaudeCommand({
      instructions: narrow.instructions,
      task: "x",
      tools: narrow.tools,
    })
    const allowed = allowedToolsOf(args)
    // From the narrow primary…
    expect(allowed).toEqual(expect.arrayContaining(["Read", "WebFetch", "WebSearch"]))
    // …plus the coder worker's bash/git/write, even though the primary lacks them.
    expect(allowed).toEqual(expect.arrayContaining(["Write", "Edit", "Bash", "Bash(git:*)"]))
    expect(allowed).toContain("Agent")
  })

  it("omits --model and --effort when the entity declares neither (skills)", async () => {
    const svc = makeService([], [WRITER_SKILL])
    const { args } = await svc.buildClaudeCommand({
      instructions: WRITER_SKILL.instructions,
      task: "x",
    })
    expect(args).not.toContain("--model")
    expect(args).not.toContain("--effort")
  })

  it("builds an --agents catalog of every agent and skill", async () => {
    const svc = makeService([CODER], [WRITER_SKILL])
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" })
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}")

    expect(catalog.coder).toEqual({
      description: "Implementuje",
      prompt: "Jsi Kodér.",
      tools: "Read, Write, Edit, Bash, Bash(git:*)",
      model: "sonnet",
    })
    // Skills: desc → description, default tools, no model.
    expect(catalog["task-spec-writer"]).toEqual({
      description: "Sepíše spec",
      prompt: "Jsi spec writer.",
      tools: "Read, Write, Edit",
    })
  })

  it("lets an agent win over a skill that shares its id", async () => {
    const clash: Skill = { id: "coder", desc: "skill clash", instructions: "skill body" }
    const svc = makeService([CODER], [clash])
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" })
    const catalog = JSON.parse(flagValue(args, "--agents") ?? "{}")
    expect(catalog.coder.prompt).toBe("Jsi Kodér.")
  })

  it("degrades to an empty catalog when listing fails", async () => {
    const agentStore = {
      list: async () => {
        throw new Error("disk gone")
      },
    } as unknown as AgentsStorageService
    const skillStore = { list: async () => [] } as unknown as SkillsStorageService
    const svc = new ClaudeRunCommandService(agentStore, skillStore)
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" })
    expect(JSON.parse(flagValue(args, "--agents") ?? "null")).toEqual({})
  })

  it("registers the PreToolUse approval hook on Bash via --settings", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" })
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}")
    const entry = settings.hooks?.PreToolUse?.[0]
    expect(entry.matcher).toBe("Bash")
    expect(entry.hooks[0].type).toBe("command")
    expect(entry.hooks[0].command).toContain("claude-approval-hook.mjs")
  })

  it("orders the gate timeouts fail-closed: hook denies before Claude Code can kill it", async () => {
    // A hook killed at the CLI timeout is a NON-decision — under dontAsk the gated
    // command then runs as if approved. The hook must get its (shorter) deadline as
    // argv and the registered timeout must sit strictly above it.
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({ instructions: "x", task: "t" })
    const settings = JSON.parse(flagValue(args, "--settings") ?? "{}")
    const hook = settings.hooks.PreToolUse[0].hooks[0]
    expect(hook.command.endsWith(` ${GATE_DEADLINE_S}`)).toBe(true)
    expect(hook.timeout).toBeGreaterThan(GATE_DEADLINE_S)
    // …and below the 2^31−1 ms timer cap: a timeout past it can overflow to an
    // IMMEDIATE hook kill, which under dontAsk means instant auto-approve.
    expect(hook.timeout * 1000).toBeLessThan(2 ** 31)
  })

  it("grants each target directory with --add-dir", async () => {
    const svc = makeService([CODER], [])
    const { args } = await svc.buildClaudeCommand({
      instructions: "x",
      task: "t",
      grantDirs: ["/tmp/a", "/tmp/b"],
    })
    const grants = args.filter((a, i) => args[i - 1] === "--add-dir")
    expect(grants).toEqual(["/tmp/a", "/tmp/b"])
  })

  it("honours CLAUDE_BIN as the binary seam (defaults to claude)", async () => {
    const svc = makeService([CODER], [])
    process.env.CLAUDE_BIN = "/usr/bin/fake-claude"
    try {
      const { command } = await svc.buildClaudeCommand({ instructions: "x", task: "t" })
      expect(command).toBe("/usr/bin/fake-claude")
    } finally {
      delete process.env.CLAUDE_BIN
    }
  })
})
