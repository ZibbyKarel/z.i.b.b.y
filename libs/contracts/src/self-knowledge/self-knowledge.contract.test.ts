import { describe, expect, it } from "vitest";
import { SelfKnowledgeSchema, selfKnowledgeContract } from "../index";

describe("selfKnowledgeContract", () => {
  it("exposes a GET /api/self-knowledge route returning 200", () => {
    expect(selfKnowledgeContract.getSelfKnowledge.method).toBe("GET");
    expect(selfKnowledgeContract.getSelfKnowledge.path).toBe("/api/self-knowledge");
    expect(selfKnowledgeContract.getSelfKnowledge.responses).toHaveProperty("200");
  });
});

describe("SelfKnowledgeSchema", () => {
  const sections = { agents: 1, pipelines: 2, gateRules: 3, channels: 4 };

  it("accepts a well-formed payload", () => {
    const parsed = SelfKnowledgeSchema.safeParse({
      markdown: "# Self-Knowledge\n",
      generatedAt: new Date().toISOString(),
      drift: false,
      sections,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-ISO generatedAt, a missing sections field, or a negative count", () => {
    const base = { markdown: "x", drift: false };
    expect(
      SelfKnowledgeSchema.safeParse({ ...base, generatedAt: "not-a-date", sections }).success,
    ).toBe(false);
    expect(
      SelfKnowledgeSchema.safeParse({
        ...base,
        generatedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
    expect(
      SelfKnowledgeSchema.safeParse({
        ...base,
        generatedAt: new Date().toISOString(),
        sections: { ...sections, agents: -1 },
      }).success,
    ).toBe(false);
  });
});
