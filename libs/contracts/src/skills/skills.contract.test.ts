import { describe, expect, it } from "vitest";
import { SkillSchema, skillsContract } from "../index";

describe("skillsContract", () => {
  it("exposes CRUD under /api/skills", () => {
    expect(skillsContract.createSkill.method).toBe("POST");
    expect(skillsContract.createSkill.path).toBe("/api/skills");
    expect(skillsContract.listSkills.path).toBe("/api/skills");
    expect(skillsContract.getSkill.path).toBe("/api/skills/:id");
  });

  it("exposes a search route declared before the `:id` route", () => {
    expect(skillsContract.searchSkills.method).toBe("GET");
    expect(skillsContract.searchSkills.path).toBe("/api/skills/search");
    const keys = Object.keys(skillsContract);
    expect(keys.indexOf("searchSkills")).toBeLessThan(keys.indexOf("getSkill"));
  });
});

describe("skill schema", () => {
  it("requires id + instructions and accepts free-form glyph/desc", () => {
    expect(
      SkillSchema.safeParse({
        id: "summarize",
        glyph: "spark",
        desc: "TL;DR",
        instructions: "do it",
      }).success,
    ).toBe(true);
  });

  it("rejects an id with a path separator or a blank instructions body", () => {
    expect(SkillSchema.safeParse({ id: "a/b", instructions: "x" }).success).toBe(false);
    expect(SkillSchema.safeParse({ id: "ok", instructions: "" }).success).toBe(false);
  });
});
