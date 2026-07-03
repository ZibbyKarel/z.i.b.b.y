import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Agent } from "@zibby/contracts";
import type { AgentsStorageService } from "./agents.storage.service";
import type { HooksStorageService } from "../hooks/hooks.storage.service";
import type { McpCredentialsStore } from "../mcp/mcp-credentials.store";
import type { McpServersStorageService } from "../mcp/mcp.storage.service";
import type { SkillsStorageService } from "../skills/skills.storage.service";
import { ClaudeRunCommandService } from "../runner/claude-run-command.service";
import { AgentRunnerService } from "./agent-runner.service";

/**
 * `buildCommand` is private and only ever touches `this.claude`. We construct the
 * runner without its 14-dep DI graph: a bare prototype with `claude` set to a real
 * {@link ClaudeRunCommandService} backed by empty `.list()` stores (its mcp/hooks/
 * skills lookups all fail-open to `[]`, and `mcpCredentials` is never read with zero
 * mcp servers). This exercises the true task/`--add-dir` assembly.
 */
function makeRunner(): AgentRunnerService {
  const emptyStore = { list: async () => [] };
  const claude = new ClaudeRunCommandService(
    emptyStore as unknown as AgentsStorageService,
    emptyStore as unknown as SkillsStorageService,
    emptyStore as unknown as HooksStorageService,
    emptyStore as unknown as McpServersStorageService,
    {} as unknown as McpCredentialsStore,
  );
  const runner = Object.create(AgentRunnerService.prototype) as AgentRunnerService;
  (runner as unknown as { claude: ClaudeRunCommandService }).claude = claude;
  return runner;
}

const agentFixture = {
  instructions: "sys",
  tools: [],
  model: "claude-x",
  thinking: undefined,
} as unknown as Agent;

type BuildCommand = (
  agent: Agent,
  prompt: string,
  grantDirs: string[],
  grounding?: string,
  sandboxCwd?: string,
  attachments?: { dir: string; names: string[] },
) => Promise<{ command: string; args: string[] }>;

describe("AgentRunnerService.buildCommand attachments", () => {
  it("grants the attachments dir and lists filenames without making it the operate target", async () => {
    const runner = makeRunner();
    const sandbox = mkdtempSync(join(tmpdir(), "zibby-agent-runner-"));
    const built = await (runner as unknown as { buildCommand: BuildCommand }).buildCommand(
      agentFixture,
      "do the thing",
      ["/work/proj"],
      "",
      sandbox,
      { dir: "/data/tasks/attachments/set_1", names: ["spec.pdf", "data.csv"] },
    );
    const joined = built.args.join(" ");
    expect(joined).toContain("--add-dir");
    expect(joined).toContain("/data/tasks/attachments/set_1");

    const taskArg = built.args[built.args.indexOf("-p") + 1] ?? built.args.join("\n");
    expect(taskArg).toContain("Operate on this directory: /work/proj");
    expect(taskArg).toContain(
      "attached reference files in /data/tasks/attachments/set_1: spec.pdf, data.csv",
    );
  });

  it("drops a relative attachments dir (no grant, no manifest line)", async () => {
    const runner = makeRunner();
    const sandbox = mkdtempSync(join(tmpdir(), "zibby-agent-runner-"));
    const built = await (runner as unknown as { buildCommand: BuildCommand }).buildCommand(
      agentFixture,
      "do the thing",
      ["/work/proj"],
      "",
      sandbox,
      { dir: "relative/attachments", names: ["spec.pdf"] },
    );
    const joined = built.args.join(" ");
    expect(joined).not.toContain("relative/attachments");
    const taskArg = built.args[built.args.indexOf("-p") + 1] ?? built.args.join("\n");
    expect(taskArg).not.toContain("attached reference files");
    expect(taskArg).toContain("Operate on this directory: /work/proj");
  });
});
