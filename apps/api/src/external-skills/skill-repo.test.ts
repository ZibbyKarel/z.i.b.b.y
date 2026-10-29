import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
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
    expect(parseGitHubSkillUrl("https://github.com/a/b/tree/dev/skills/x")).toMatchObject({
      ref: "dev",
      subpath: "skills/x",
    });
    expect(parseGitHubSkillUrl("https://github.com/a/b/tree/v1")).toMatchObject({ ref: "v1" });
    expect(parseGitHubSkillUrl("https://github.com/a/b")).not.toHaveProperty("ref");
  });
  it("rejects odd owner/repo characters", () => {
    expect(() => parseGitHubSkillUrl("https://github.com/a%20b/c")).toThrow(
      InvalidSkillRepoUrlError,
    );
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
  it("returns [] for a missing or symlinked subpath", async () => {
    const fx = await mkdtemp(join(tmpdir(), "skills-"));
    const outside = await mkdtemp(join(tmpdir(), "outside-"));
    await put(outside, "SKILL.md", "---\nname: evil\n---\n");
    await symlink(outside, join(fx, "x"));
    expect(await scanSkillDir(fx, "x")).toEqual([]);
    expect(await scanSkillDir(fx, "nope/here")).toEqual([]);
  });
  it("slugifies dir fallback and uses repoName for the root", async () => {
    const fx = await mkdtemp(join(tmpdir(), "skills-"));
    await put(fx, "My Skill/SKILL.md", "no frontmatter");
    await put(fx, "SKILL.md", "no frontmatter");
    const got = await scanSkillDir(fx, undefined, "Cool Repo");
    expect(got.map((c) => [c.path, c.id])).toEqual([
      ["", "cool-repo"],
      ["My Skill", "my-skill"],
    ]);
  });
  it("skips ---js frontmatter without executing it", async () => {
    const fx = await mkdtemp(join(tmpdir(), "skills-"));
    await put(fx, "evil/SKILL.md", "---js\n(globalThis.__pwned = true, {name: 'evil'})\n---\nbody");
    await put(fx, "ok/SKILL.md", "---\nname: ok\n---\n");
    expect((await scanSkillDir(fx)).map((c) => c.id)).toEqual(["ok"]);
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });
  it("honours subpath", async () => {
    const fx = await mkdtemp(join(tmpdir(), "skills-"));
    await put(fx, "a/SKILL.md", "---\nname: a\n---\n");
    await put(fx, "b/SKILL.md", "---\nname: b\n---\n");
    expect((await scanSkillDir(fx, "b")).map((c) => c.path)).toEqual(["b"]);
  });
});

describe("parseSkillMd", () => {
  it("throws on ---js frontmatter and does not run it", () => {
    expect(() => parseSkillMd("---js\n(globalThis.__pwned2 = true, {})\n---\nbody", "d")).toThrow();
    expect((globalThis as Record<string, unknown>).__pwned2).toBeUndefined();
  });
  it("slugifies a non-id name and falls back to the dir name", () => {
    expect(parseSkillMd("---\nname: Security Audit\n---\nbody", "dir").id).toBe("security-audit");
    expect(parseSkillMd("---\nname: ✨\n---\nbody", "my-dir").id).toBe("my-dir");
  });
});
