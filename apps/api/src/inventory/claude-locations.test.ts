import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveClaudeLocations } from "./claude-locations";

describe("resolveClaudeLocations", () => {
  const prev = process.env.CLAUDE_CONFIG_DIR;
  afterEach(() => {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev;
  });

  it("uses CLAUDE_CONFIG_DIR when set", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/x";
    const l = resolveClaudeLocations();
    expect(l.claudeDir).toBe("/tmp/x");
    expect(l.userConfigFile).toBe("/tmp/x/.claude.json");
  });

  it("treats an empty CLAUDE_CONFIG_DIR as unset", () => {
    process.env.CLAUDE_CONFIG_DIR = "";
    const l = resolveClaudeLocations();
    expect(l.claudeDir).toBe(join(homedir(), ".claude"));
    expect(l.userConfigFile).toBe(join(homedir(), ".claude.json"));
  });
});
