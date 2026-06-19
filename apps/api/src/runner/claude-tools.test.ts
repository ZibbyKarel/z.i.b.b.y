import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLS, toAllowedTools, toSubagentTools } from "./claude-tools";

describe("toAllowedTools", () => {
  it("maps the internal vocabulary to Claude tool/rule strings", () => {
    expect(toAllowedTools(["read", "write", "bash", "git", "web"])).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Bash(git:*)",
      "WebFetch",
      "WebSearch",
      "Agent",
    ]);
  });

  it("always includes Agent so the run can delegate to the catalog", () => {
    expect(toAllowedTools(["read"])).toContain("Agent");
    expect(toAllowedTools([])).toContain("Agent");
    expect(toAllowedTools(undefined)).toContain("Agent");
  });

  it("falls back to the default tools when none are declared", () => {
    // DEFAULT_TOOLS = read+write → Read, Write, Edit (+ Agent).
    expect(toAllowedTools(undefined)).toEqual(["Read", "Write", "Edit", "Agent"]);
    expect(toAllowedTools([])).toEqual(toAllowedTools(DEFAULT_TOOLS));
  });

  it("passes through names already in Claude's vocabulary", () => {
    expect(toAllowedTools(["Read", "Grep", "Glob", "WebFetch", "WebSearch"])).toEqual([
      "Read",
      "Grep",
      "Glob",
      "WebFetch",
      "WebSearch",
      "Agent",
    ]);
  });

  it("de-duplicates overlapping expansions", () => {
    // `read` → Read and an explicit `Read` collapse to one entry.
    expect(toAllowedTools(["read", "Read"])).toEqual(["Read", "Agent"]);
  });
});

describe("toSubagentTools", () => {
  it("returns a comma-separated string in Claude's vocabulary, without Agent", () => {
    expect(toSubagentTools(["read", "git"])).toBe("Read, Bash(git:*)");
  });

  it("applies the default tools when none are declared (skills)", () => {
    expect(toSubagentTools(undefined)).toBe("Read, Write, Edit");
  });
});
