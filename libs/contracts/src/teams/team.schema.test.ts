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

  it("M7: rejects a relative vault path — the docblock and docs promise an absolute host path", () => {
    const result = KnowledgeBaseSourceSchema.safeParse({
      kind: "vault",
      path: "relative/kb",
      readOnly: true,
    });
    expect(result.success).toBe(false);
  });

  it("M7: accepts a Windows drive-absolute and a UNC path too — operator-configured, not tied to one OS", () => {
    expect(
      KnowledgeBaseSourceSchema.safeParse({ kind: "vault", path: "C:\\kb", readOnly: true })
        .success,
    ).toBe(true);
    expect(
      KnowledgeBaseSourceSchema.safeParse({ kind: "vault", path: "\\\\server\\kb", readOnly: true })
        .success,
    ).toBe(true);
  });

  it("ignores id on the update schema", () => {
    expect(UpdateTeamSchema.parse({ id: "other" })).toEqual({});
  });
});

describe("UpdateTeamSchema clear semantics (companyId, knowledgeBase)", () => {
  it("accepts a companyId string (link)", () => {
    const parsed = UpdateTeamSchema.parse({ companyId: "acme" });
    expect(parsed.companyId).toBe("acme");
  });

  it("accepts a null companyId (explicit unlink, distinct from absent/undefined)", () => {
    const parsed = UpdateTeamSchema.parse({ companyId: null });
    expect(parsed.companyId).toBeNull();
  });

  it("accepts a patch with no companyId key at all (leave the link alone)", () => {
    const parsed = UpdateTeamSchema.parse({ desc: "moved" });
    expect(parsed.companyId).toBeUndefined();
  });

  it("accepts a vault knowledgeBase (set)", () => {
    const parsed = UpdateTeamSchema.parse({
      knowledgeBase: { kind: "vault", path: "/tmp/kb", readOnly: true },
    });
    expect(parsed.knowledgeBase).toEqual({ kind: "vault", path: "/tmp/kb", readOnly: true });
  });

  it("accepts a null knowledgeBase (explicit clear, distinct from absent/undefined)", () => {
    const parsed = UpdateTeamSchema.parse({ knowledgeBase: null });
    expect(parsed.knowledgeBase).toBeNull();
  });

  it("accepts a patch with no knowledgeBase key at all (leave it alone)", () => {
    const parsed = UpdateTeamSchema.parse({ desc: "moved" });
    expect(parsed.knowledgeBase).toBeUndefined();
  });
});
