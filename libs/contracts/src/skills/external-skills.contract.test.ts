import { describe, expect, it } from "vitest";
import { CreateSkillSchema, SkillSchema, appContract, externalSkillsContract } from "../index";

const source = {
  owner: "cloudflare",
  repo: "security-audit-skill",
  url: "https://github.com/cloudflare/security-audit-skill",
  path: "skills/security-audit",
  sha: "abc",
  treeSha: "def",
  installedAt: "2026-10-29T00:00:00.000Z",
  updatedAt: "2026-10-29T00:00:00.000Z",
  checkedAt: "2026-10-29T00:00:00.000Z",
};

describe("externalSkillsContract", () => {
  it("exposes scan + install under /api/skills/external", () => {
    expect(externalSkillsContract.scanExternalSkills.method).toBe("POST");
    expect(externalSkillsContract.scanExternalSkills.path).toBe("/api/skills/external/scan");
    expect(externalSkillsContract.installExternalSkills.method).toBe("POST");
    expect(externalSkillsContract.installExternalSkills.path).toBe("/api/skills/external");
    expect(appContract.externalSkills.installExternalSkills.path).toBe("/api/skills/external");
  });

  it("install requires at least one path", () => {
    const body = externalSkillsContract.installExternalSkills.body;
    expect(body.safeParse({ url: "https://github.com/a/b", paths: [] }).success).toBe(false);
    expect(body.safeParse({ url: "https://github.com/a/b", paths: [""] }).success).toBe(true);
  });

  it("a skill may carry its provenance, but a create body may not", () => {
    expect(SkillSchema.safeParse({ id: "x", instructions: "b", source }).success).toBe(true);
    const withRef = SkillSchema.safeParse({
      id: "x",
      instructions: "b",
      source: { ...source, ref: "dev" },
    });
    expect(withRef.success && withRef.data.source?.ref).toBe("dev");
    const parsed = CreateSkillSchema.safeParse({ id: "x", instructions: "b", source });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "source" in parsed.data).toBe(false);
  });
});
