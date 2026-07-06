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

  it("accepts a payload without codebaseShape (back-compat with pre-Fáze-10 payloads)", () => {
    const parsed = SelfKnowledgeSchema.safeParse({
      markdown: "# Self-Knowledge\n",
      generatedAt: new Date().toISOString(),
      drift: false,
      sections,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.sections.codebaseShape).toBeUndefined();
  });

  it("accepts codebaseShape present with digest counts, and present:false with zero counts", () => {
    const present = SelfKnowledgeSchema.safeParse({
      markdown: "# Self-Knowledge\n",
      generatedAt: new Date().toISOString(),
      drift: false,
      sections: { ...sections, codebaseShape: { present: true, godNodes: 10, communities: 3 } },
    });
    expect(present.success).toBe(true);

    const absent = SelfKnowledgeSchema.safeParse({
      markdown: "# Self-Knowledge\n",
      generatedAt: new Date().toISOString(),
      drift: false,
      sections: { ...sections, codebaseShape: { present: false, godNodes: 0, communities: 0 } },
    });
    expect(absent.success).toBe(true);
  });

  it("rejects a negative codebaseShape count", () => {
    const parsed = SelfKnowledgeSchema.safeParse({
      markdown: "x",
      generatedAt: new Date().toISOString(),
      drift: false,
      sections: { ...sections, codebaseShape: { present: true, godNodes: -1, communities: 0 } },
    });
    expect(parsed.success).toBe(false);
  });
});
