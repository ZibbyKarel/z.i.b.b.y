import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPathLock } from "../shared/file-storage";
import { ReadOnlySkillError, SkillConflictError } from "../skills/skills.errors";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { NoSkillsFoundError } from "./external-skills.errors";
import { ExternalSkillsService } from "./external-skills.service";
import { EXTERNAL_SKILLS_LOCK, ExternalSkillsStore } from "./external-skills.store";
import type { SkillRepoGit } from "./skill-repo-git";

const url = "https://github.com/cloudflare/security-audit-skill";

async function put(root: string, rel: string, text: string): Promise<void> {
  await mkdir(join(root, rel, ".."), { recursive: true });
  await writeFile(join(root, rel), text);
}

/** A git double whose clone copies a local fixture dir (plus a fake `.git`). */
export function fixtureGit(fixture: string, refs: (string | undefined)[] = []): SkillRepoGit {
  return {
    clone: async (_remote: string, dest: string, ref?: string) => {
      refs.push(ref);
      await cp(fixture, dest, { recursive: true, verbatimSymlinks: true });
      await put(dest, ".git/HEAD", "ref: refs/heads/main\n");
      return "abc";
    },
    lsRemoteHead: async () => "abc",
    treeSha: async () => "tree1",
  } as unknown as SkillRepoGit;
}

describe("ExternalSkillsService", () => {
  let tmp: string;
  let fixture: string;
  let extDir: string;
  let skills: SkillsStorageService;
  let svc: ExternalSkillsService;
  let store: ExternalSkillsStore;
  let refs: (string | undefined)[];

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ext-skills-"));
    fixture = join(tmp, "repo");
    extDir = join(tmp, "skills-external");
    await put(
      fixture,
      "skills/security-audit/SKILL.md",
      "---\nname: security-audit\ndescription: Audit code\n---\nHunt bugs.\n",
    );
    await put(fixture, "skills/security-audit/HUNTING.md", "# Hunting\n");
    await put(join(tmp, "outside"), "secret.txt", "top secret");
    await symlink(join(tmp, "outside", "secret.txt"), join(fixture, "skills/security-audit/leak"));
    await symlink(join(tmp, "outside"), join(fixture, "skills/security-audit/leakdir"));

    store = new ExternalSkillsStore(join(tmp, "external-skills.json"));
    refs = [];
    skills = new SkillsStorageService(join(tmp, "skills"), store, extDir);
    await skills.onModuleInit();
    svc = new ExternalSkillsService(store, fixtureGit(fixture, refs), skills, extDir);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scans candidates with conflict flags", async () => {
    const scan = await svc.scan(url);
    expect(scan).toEqual({
      owner: "cloudflare",
      repo: "security-audit-skill",
      sha: "abc",
      candidates: [
        {
          path: "skills/security-audit",
          id: "security-audit",
          name: "security-audit",
          desc: "Audit code",
          conflict: false,
        },
      ],
    });
  });

  it("installs the chosen folder with provenance", async () => {
    const [s] = await svc.install(url, ["skills/security-audit"]);
    expect(s).toMatchObject({
      id: "security-audit",
      desc: "Audit code",
      instructions: "Hunt bugs.",
      source: { owner: "cloudflare", sha: "abc", path: "skills/security-audit", treeSha: "tree1" },
    });
    expect(existsSync(join(extDir, "security-audit", "HUNTING.md"))).toBe(true);
    expect(existsSync(join(extDir, "security-audit", ".git"))).toBe(false);
    expect((await svc.scan(url)).candidates[0]?.conflict).toBe(true);
  });

  it("clones the ref of a tree URL and records it", async () => {
    const [s] = await svc.install(`${url}/tree/dev/skills`, ["skills/security-audit"]);
    expect(refs).toEqual(["dev"]);
    expect(s?.source).toMatchObject({ ref: "dev", path: "skills/security-audit" });
    expect((await store.get("security-audit"))?.ref).toBe("dev");
    await svc.scan(url);
    expect(refs).toEqual(["dev", undefined]);
  });

  it("removes the copied folder when recording provenance fails", async () => {
    vi.spyOn(store, "upsert").mockRejectedValueOnce(new Error("disk full"));
    await expect(svc.install(url, ["skills/security-audit"])).rejects.toThrow("disk full");
    expect(existsSync(join(extDir, "security-audit"))).toBe(false);
  });

  it("an own-skill create waits for a running install (shared lock)", async () => {
    let release!: () => void;
    const held = withPathLock(EXTERNAL_SKILLS_LOCK, () => new Promise<void>((r) => (release = r)));
    let created = false;
    const create = skills.create({ id: "mine", instructions: "x" }).then(() => (created = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(created).toBe(false);
    release();
    await held;
    await create;
    expect(created).toBe(true);
  });

  it("rejects an id clash with an own skill and writes nothing", async () => {
    await skills.create({ id: "security-audit", instructions: "x" });
    await expect(svc.install(url, ["skills/security-audit"])).rejects.toThrow(SkillConflictError);
    expect(existsSync(join(extDir, "security-audit"))).toBe(false);
  });

  it("rejects installing the same skill twice", async () => {
    await svc.install(url, ["skills/security-audit"]);
    await expect(svc.install(url, ["skills/security-audit"])).rejects.toThrow(SkillConflictError);
  });

  it("scan of a repo without SKILL.md throws NoSkillsFoundError", async () => {
    await rm(join(fixture, "skills"), { recursive: true });
    await put(fixture, "README.md", "nothing here");
    await expect(svc.scan(url)).rejects.toThrow(NoSkillsFoundError);
    await expect(svc.install(url, ["skills/security-audit"])).rejects.toThrow(NoSkillsFoundError);
  });

  it("rejects a requested path that is not a candidate", async () => {
    await expect(svc.install(url, ["skills/nope"])).rejects.toThrow(NoSkillsFoundError);
    expect(existsSync(join(extDir, "security-audit"))).toBe(false);
  });

  it("skips a symlink pointing outside the repo", async () => {
    await svc.install(url, ["skills/security-audit"]);
    expect(existsSync(join(extDir, "security-audit", "leak"))).toBe(false);
    expect(existsSync(join(extDir, "security-audit", "leakdir"))).toBe(false);
    expect(await readFile(join(tmp, "outside", "secret.txt"), "utf8")).toBe("top secret");
  });

  it("external skills are listed and read-only", async () => {
    await svc.install(url, ["skills/security-audit"]);
    expect((await skills.list()).map((s) => s.id)).toContain("security-audit");
    expect((await skills.get("security-audit")).source?.repo).toBe("security-audit-skill");
    await expect(skills.update("security-audit", { desc: "x" })).rejects.toThrow(
      ReadOnlySkillError,
    );
    await expect(skills.delete("security-audit")).rejects.toThrow(ReadOnlySkillError);
    await expect(skills.create({ id: "security-audit", instructions: "x" })).rejects.toThrow(
      SkillConflictError,
    );
  });

  it("a broken external folder is skipped from list(), never throws", async () => {
    await svc.install(url, ["skills/security-audit"]);
    await rm(join(extDir, "security-audit"), { recursive: true });
    await skills.create({ id: "mine", instructions: "x" });
    expect((await skills.list()).map((s) => s.id)).toEqual(["mine"]);
  });
});
