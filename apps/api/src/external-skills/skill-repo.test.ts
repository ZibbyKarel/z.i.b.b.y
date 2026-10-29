import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InvalidSkillRepoUrlError,
  parseGitHubSkillUrl,
  parseSkillMd,
  scanSkillDir,
} from "./skill-repo";

async function put(root: string, rel: string, text: string): Promise<void> {
  await mkdir(join(root, rel, ".."), { recursive: true });
  await writeFile(join(root, rel), text);
}

describe("parseGitHubSkillUrl", () => {
  it("parses root, .git and tree urls", () => {
    expect(parseGitHubSkillUrl("https://github.com/cloudflare/security-audit-skill")).toEqual({
      owner: "cloudflare",
      repo: "security-audit-skill",
      remote: "https://github.com/cloudflare/security-audit-skill.git",
    });
    expect(parseGitHubSkillUrl("https://github.com/a/b.git/").repo).toBe("b");
    expect(parseGitHubSkillUrl("https://github.com/a/b/tree/main/skills/x").subpath).toBe(
      "skills/x",
    );
    expect(parseGitHubSkillUrl("https://github.com/a/b/tree/main")).not.toHaveProperty("subpath");
  });
  it("rejects non-github and traversal", () => {
    for (const u of [
      "https://gitlab.com/a/b",
      "git@github.com:a/b",
      "https://github.com/a/b/tree/main/../../etc",
      "file:///tmp/x",
    ])
      expect(() => parseGitHubSkillUrl(u)).toThrow(InvalidSkillRepoUrlError);
  });
});

describe("scanSkillDir", () => {
  it("finds nested SKILL.md files and skips .git/node_modules", async () => {
    const fx = await mkdtemp(join(tmpdir(), "skills-"));
    await put(
      fx,
      "skills/security-audit/SKILL.md",
      "---\nname: security-audit\ndescription: Audit\n---\nbody",
    );
    await put(fx, "node_modules/x/SKILL.md", "---\nname: x\n---\n");
    await put(fx, ".git/SKILL.md", "---\nname: g\n---\n");
    expect((await scanSkillDir(fx)).map((c) => [c.path, c.id, c.desc])).toEqual([
      ["skills/security-audit", "security-audit", "Audit"],
    ]);
  });
  it("root SKILL.md yields path ''", async () => {
    const fx = await mkdtemp(join(tmpdir(), "skills-"));
    await put(fx, "SKILL.md", "---\nname: root\n---\nhi");
    expect((await scanSkillDir(fx))[0]?.path).toBe("");
  });
  it("honours subpath", async () => {
    const fx = await mkdtemp(join(tmpdir(), "skills-"));
    await put(fx, "a/SKILL.md", "---\nname: a\n---\n");
    await put(fx, "b/SKILL.md", "---\nname: b\n---\n");
    expect((await scanSkillDir(fx, "b")).map((c) => c.path)).toEqual(["b"]);
  });
});

describe("parseSkillMd", () => {
  it("slugifies a non-id name and falls back to the dir name", () => {
    expect(parseSkillMd("---\nname: Security Audit\n---\nbody", "dir").id).toBe("security-audit");
    expect(parseSkillMd("---\nname: ✨\n---\nbody", "my-dir").id).toBe("my-dir");
  });
});
