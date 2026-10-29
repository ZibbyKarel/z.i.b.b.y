import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SkillRepoGitError } from "./external-skills.errors";
import { SkillRepoGit } from "./skill-repo-git";

describe("SkillRepoGit (against a local repo)", () => {
  let tmp: string;
  let origin: string;
  const git = new SkillRepoGit();

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "skill-repo-git-"));
    origin = join(tmp, "origin");
    const run = (...args: string[]) => execFileSync("git", args, { cwd: origin });
    execFileSync("git", ["init", "-q", origin]);
    await writeFile(join(origin, "SKILL.md"), "hi");
    run("add", ".");
    run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  });
  afterAll(() => rm(tmp, { recursive: true, force: true }));

  it("clones, reads HEAD and tree shas", async () => {
    const dest = join(tmp, "clone");
    const sha = await git.clone(origin, dest);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await git.lsRemoteHead(origin)).toBe(sha);
    expect(await git.treeSha(dest, "")).toMatch(/^[0-9a-f]{40}$/);
    expect(await git.treeSha(dest, "nope")).toBeNull();
  });

  it("wraps a failing clone in SkillRepoGitError", async () => {
    await expect(git.clone(join(tmp, "missing"), join(tmp, "x"))).rejects.toThrow(
      SkillRepoGitError,
    );
  });
});
