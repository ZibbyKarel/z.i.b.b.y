import { describe, expect, it } from "vitest";
import { KnowledgeBaseSourceSchema, TeamSchema, UpdateTeamSchema } from "./team.schema";

describe("TeamSchema", () => {
  it("accepts a minimal team", () => {
    expect(TeamSchema.parse({ id: "devrel", name: "DevRel" })).toEqual({
      id: "devrel",
      name: "DevRel",
    });
  });

  it("rejects a path-traversing id", () => {
    expect(TeamSchema.safeParse({ id: "../etc", name: "x" }).success).toBe(false);
  });

  it("accepts a vault knowledge base", () => {
    const team = TeamSchema.parse({
      id: "devrel",
      name: "DevRel",
      companyId: "shoptet",
      knowledgeBase: {
        kind: "vault",
        path: "/Users/zibar/Workspace/devrel-knowledgebase",
        gitRemote: "git@github.com:shoptet/devrel-knowledgebase.git",
        readOnly: true,
      },
    });
    expect(team.knowledgeBase?.kind).toBe("vault");
  });

  it("refuses to make a knowledge base writable", () => {
    const result = KnowledgeBaseSourceSchema.safeParse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys on a vault source", () => {
    const result = KnowledgeBaseSourceSchema.safeParse({
      kind: "vault",
      path: "/tmp/kb",
      readOnly: true,
      writeToken: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("ignores id on the update schema", () => {
    expect(UpdateTeamSchema.parse({ id: "other" })).toEqual({});
  });
});
