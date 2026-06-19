import { describe, expect, it } from "vitest";
import { ResearchConfigSchema, ResearchDigestSchema, ResearchItemSchema } from "./research.schema";

describe("research schemas", () => {
  it("defaults an empty config", () => {
    const parsed = ResearchConfigSchema.parse({});
    expect(parsed).toEqual({ interests: [], sources: [], financeWatch: false });
  });

  it("defaults a source to enabled", () => {
    const parsed = ResearchConfigSchema.parse({
      sources: [{ id: "hn", kind: "hn", label: "Hacker News" }],
    });
    expect(parsed.sources[0]?.enabled).toBe(true);
  });

  it("rejects an unknown source kind", () => {
    expect(() =>
      ResearchConfigSchema.parse({ sources: [{ id: "x", kind: "blog", label: "X" }] }),
    ).toThrow();
  });

  it("clamps relevance to [0,1]", () => {
    expect(() =>
      ResearchItemSchema.parse({
        id: "1",
        title: "t",
        summary: "s",
        source: "hn",
        sourceId: "hn",
        relevance: 1.5,
      }),
    ).toThrow();
  });

  it("accepts an empty digest", () => {
    const parsed = ResearchDigestSchema.parse({
      generatedAt: "2026-06-17T00:00:00.000Z",
      items: [],
    });
    expect(parsed.items).toEqual([]);
  });
});
