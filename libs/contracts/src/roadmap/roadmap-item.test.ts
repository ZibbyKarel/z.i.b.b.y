import { describe, expect, it } from "vitest";
import {
  ROADMAP_ITEM_ID_REGEX,
  RoadmapItemSchema,
  roadmapItemIdForSource,
} from "./roadmap-item.schema";

describe("roadmapItemIdForSource", () => {
  it("is deterministic — the same inputs always produce the same id", () => {
    expect(roadmapItemIdForSource("jira-prod", "PROJ-14")).toBe(
      roadmapItemIdForSource("jira-prod", "PROJ-14"),
    );
  });

  it("is lowercase and filename-safe (matches ROADMAP_ITEM_ID_REGEX)", () => {
    const id = roadmapItemIdForSource("Jira Prod", "PROJ-14");
    expect(id).toBe(id.toLowerCase());
    expect(ROADMAP_ITEM_ID_REGEX.test(id)).toBe(true);
  });

  it("strips diacritics and collapses punctuation/whitespace to single dashes", () => {
    expect(roadmapItemIdForSource("Zvláštní Integrace", "Úkol #1")).toBe(
      "zvlastni-integrace-ukol-1",
    );
  });

  it("never returns an empty string, even for all-punctuation input", () => {
    expect(roadmapItemIdForSource("---", "***")).toBe("item");
  });

  it("distinguishes different (integrationId, externalId) pairs in the common case", () => {
    const a = roadmapItemIdForSource("jira", "PROJ-1");
    const b = roadmapItemIdForSource("jira", "PROJ-2");
    const c = roadmapItemIdForSource("github", "PROJ-1");
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("RoadmapItemSchema", () => {
  const base = {
    id: "manual-item-1",
    projectId: "proj",
    level: "epic" as const,
    name: "Rollout za flagem",
    source: { kind: "manual" as const },
    lifecycle: "todo" as const,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };

  it("parses the minimal shape, defaulting description/attachments/dependsOn/runs", () => {
    const parsed = RoadmapItemSchema.parse(base);
    expect(parsed.description).toBe("");
    expect(parsed.attachments).toEqual([]);
    expect(parsed.dependsOn).toEqual([]);
    expect(parsed.dependsOnFromSource).toEqual([]);
    expect(parsed.runs).toEqual([]);
  });

  it("has no `blocked` field — it is always derived, never stored", () => {
    const parsed = RoadmapItemSchema.parse(base);
    expect(parsed).not.toHaveProperty("blocked");
  });

  it("rejects an id with a path separator", () => {
    expect(RoadmapItemSchema.safeParse({ ...base, id: "../escape" }).success).toBe(false);
  });

  it("rejects an unknown lifecycle value", () => {
    expect(RoadmapItemSchema.safeParse({ ...base, lifecycle: "cancelled" }).success).toBe(false);
  });

  it("accepts a full run history entry", () => {
    const parsed = RoadmapItemSchema.parse({
      ...base,
      runs: [
        {
          taskId: "task_1",
          runRef: "run_1",
          prNumber: 42,
          prUrl: "https://github.com/acme/repo/pull/42",
          startedAt: "2026-07-28T00:00:00.000Z",
          finishedAt: "2026-07-28T01:00:00.000Z",
          outcome: "done",
        },
      ],
    });
    expect(parsed.runs).toHaveLength(1);
  });
});
