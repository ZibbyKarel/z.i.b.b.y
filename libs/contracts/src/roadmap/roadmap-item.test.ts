import { describe, expect, it } from "vitest";
import {
  ROADMAP_ITEM_ID_REGEX,
  RoadmapConfigPatchSchema,
  RoadmapConfigSchema,
  RoadmapDefaultsSchema,
  RoadmapItemSchema,
  resolveRoadmapConfig,
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

describe("RoadmapConfigSchema (tri-state)", () => {
  it("parses legacy booleans unchanged and defaults absent to null (inherit)", () => {
    expect(RoadmapConfigSchema.parse({ autoSync: true, autoPlay: false })).toEqual({
      autoSync: true,
      autoPlay: false,
      autoReview: null,
      autoAddressComments: null,
    });
    expect(RoadmapConfigSchema.parse({})).toEqual({
      autoSync: null,
      autoPlay: null,
      autoReview: null,
      autoAddressComments: null,
    });
  });
});

describe("RoadmapConfigPatchSchema", () => {
  it("keeps omitted keys absent and accepts null for the PR toggles", () => {
    expect(RoadmapConfigPatchSchema.parse({ autoReview: true })).toEqual({ autoReview: true });
    expect(RoadmapConfigPatchSchema.parse({ autoAddressComments: null })).toEqual({
      autoAddressComments: null,
    });
  });
});

describe("RoadmapDefaultsSchema", () => {
  it("accepts the PR toggles as optional booleans", () => {
    expect(RoadmapDefaultsSchema.parse({ autoReview: true, autoAddressComments: false })).toEqual({
      autoReview: true,
      autoAddressComments: false,
    });
    expect(RoadmapDefaultsSchema.parse({})).toEqual({});
  });
});

describe("resolveRoadmapConfig", () => {
  it("project > company > global, with provenance", () => {
    expect(
      resolveRoadmapConfig({ autoSync: false, autoPlay: null }, { autoSync: true, autoPlay: true }),
    ).toEqual({
      autoSync: false,
      autoPlay: true,
      autoReview: false,
      autoAddressComments: false,
      source: {
        autoSync: "project",
        autoPlay: "company",
        autoReview: "global",
        autoAddressComments: "global",
      },
    });
    expect(resolveRoadmapConfig({}, undefined).source).toEqual({
      autoSync: "global",
      autoPlay: "global",
      autoReview: "global",
      autoAddressComments: "global",
    });
  });

  it("resolves autoReview / autoAddressComments: project explicit, then company, then false", () => {
    expect(
      resolveRoadmapConfig(
        { autoReview: false, autoAddressComments: null },
        { autoReview: true, autoAddressComments: true },
      ),
    ).toMatchObject({
      autoReview: false,
      autoAddressComments: true,
      source: { autoReview: "project", autoAddressComments: "company" },
    });
    expect(resolveRoadmapConfig({ autoReview: true }, { autoReview: false })).toMatchObject({
      autoReview: true,
      source: { autoReview: "project" },
    });
    expect(resolveRoadmapConfig({ autoReview: null }, { autoReview: true })).toMatchObject({
      autoReview: true,
      autoAddressComments: false,
      source: { autoReview: "company", autoAddressComments: "global" },
    });
  });
});
