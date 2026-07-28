import { describe, expect, it } from "vitest";
import { DEFAULT_LEVEL_MAPPING, LevelMappingSchema, resolveLevel } from "./level-mapping.schema";

describe("DEFAULT_LEVEL_MAPPING", () => {
  it("parses against LevelMappingSchema", () => {
    expect(LevelMappingSchema.safeParse(DEFAULT_LEVEL_MAPPING).success).toBe(true);
  });

  it("seeds the Jira and GitHub rows the master plan specifies", () => {
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "Epic")).toBe("epic");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "Story")).toBe("task");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "Task")).toBe("task");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "Bug")).toBe("task");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "Sub-task")).toBe("task");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "Initiative")).toBe("ignore");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "github", "Milestone")).toBe("epic");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "github", "Issue")).toBe("task");
  });
});

describe("resolveLevel", () => {
  it("returns undefined for an unseen (kind, externalLevel) pair", () => {
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "Spike")).toBeUndefined();
  });

  it("is case-insensitive on both the stored entry and the lookup", () => {
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "epic")).toBe("epic");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "EPIC")).toBe("epic");
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "jira", "  Epic  ")).toBe("epic");
  });

  it("does not cross-match between kinds — a Jira level never resolves under github", () => {
    expect(resolveLevel(DEFAULT_LEVEL_MAPPING, "github", "Epic")).toBeUndefined();
  });

  it("finds a custom entry added by the operator/sync", () => {
    const mapping = {
      entries: [
        ...DEFAULT_LEVEL_MAPPING.entries,
        { kind: "jira" as const, externalLevel: "Spike", target: "ignore" as const },
      ],
    };
    expect(resolveLevel(mapping, "jira", "spike")).toBe("ignore");
  });
});
