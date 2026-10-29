import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPathLock } from "../shared/file-storage";
import {
  ReadOnlySkillError,
  SkillConflictError,
  SkillNotFoundError,
} from "../skills/skills.errors";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { NoSkillsFoundError, SkillRepoGitError } from "./external-skills.errors";
import { ExternalSkillsService } from "./external-skills.service";
import { EXTERNAL_SKILLS_LOCK, ExternalSkillsStore } from "./external-skills.store";
import { parseGitHubSkillUrl } from "./skill-repo";
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
    svc = new ExternalSkillsService(store, fixtureGit(fixture, refs), skills, extDir, {
      record: vi.fn(),
    } as never);
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

describe("ExternalSkillsService — sync", () => {
  const T0 = new Date("2026-10-20T04:00:00.000Z");
  const T1 = new Date("2026-10-27T04:00:00.000Z");
  const path = "skills/security-audit";
  const remote = parseGitHubSkillUrl(url).remote;
  let tmp: string;
  let fixture: string;
  let extDir: string;
  let store: ExternalSkillsStore;
  let svc: ExternalSkillsService;
  let activity: { record: ReturnType<typeof vi.fn> };
  /** Mutable upstream state the git double reads. */
  let up: { head: string; trees: Record<string, string | null>; clones: string[]; down: string[] };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    tmp = await mkdtemp(join(tmpdir(), "ext-skills-sync-"));
    fixture = join(tmp, "repo");
    extDir = join(tmp, "skills-external");
    await put(fixture, `${path}/SKILL.md`, "---\nname: security-audit\n---\nHunt bugs.\n");
    await put(fixture, `${path}/HUNTING.md`, "v1");
    await put(fixture, "skills/other/SKILL.md", "---\nname: other\n---\nOther.\n");
    up = { head: "abc1234567", trees: {}, clones: [], down: [] };
    const reach = (r: string) => {
      if (up.down.includes(r)) throw new SkillRepoGitError(`git: unreachable ${r}`);
    };
    const git = {
      clone: async (r: string, dest: string) => {
        reach(r);
        up.clones.push(r);
        await cp(fixture, dest, { recursive: true });
        return up.head;
      },
      lsRemoteHead: async (r: string) => {
        reach(r);
        return up.head;
      },
      treeSha: async (_dir: string, p: string) => (p in up.trees ? (up.trees[p] ?? null) : "tree1"),
    } as unknown as SkillRepoGit;
    store = new ExternalSkillsStore(join(tmp, "external-skills.json"));
    const skills = new SkillsStorageService(join(tmp, "skills"), store, extDir);
    await skills.onModuleInit();
    activity = { record: vi.fn(async () => {}) };
    svc = new ExternalSkillsService(store, git, skills, extDir, activity as never);
    await svc.install(url, [path]);
    up.clones = [];
    vi.setSystemTime(T1);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(tmp, { recursive: true, force: true });
  });

  const hunting = () => readFile(join(extDir, "security-audit", "HUNTING.md"), "utf8");

  it("same remote sha: only checkedAt moves", async () => {
    const s = await svc.sync("security-audit");
    expect(s.source).toMatchObject({
      sha: "abc1234567",
      latestSha: "abc1234567",
      checkedAt: T1.toISOString(),
      updatedAt: T0.toISOString(),
    });
    expect(up.clones).toEqual([]);
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("new commit, same tree: sha moves, updatedAt and files unchanged, no activity", async () => {
    up.head = "def7654321";
    await put(fixture, `${path}/HUNTING.md`, "v2");
    const s = await svc.sync("security-audit");
    expect(s.source).toMatchObject({
      sha: "def7654321",
      latestSha: "def7654321",
      treeSha: "tree1",
      updatedAt: T0.toISOString(),
      checkedAt: T1.toISOString(),
    });
    expect(await hunting()).toBe("v1");
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("new tree: folder replaced, updatedAt moves, records skill-updated", async () => {
    up.head = "def7654321";
    up.trees[path] = "tree2";
    await put(fixture, `${path}/HUNTING.md`, "v2");
    const s = await svc.sync("security-audit");
    expect(s.source).toMatchObject({
      sha: "def7654321",
      treeSha: "tree2",
      updatedAt: T1.toISOString(),
    });
    expect(s.source?.lastError).toBeUndefined();
    expect(await hunting()).toBe("v2");
    expect(activity.record).toHaveBeenCalledWith({
      kind: "skill-updated",
      summary:
        "Skill security-audit aktualizován z cloudflare/security-audit-skill (abc1234→def7654)",
      refs: { itemId: "security-audit" },
    });
  });

  it("unreachable remote: copy untouched, lastError set, syncAll continues", async () => {
    const otherUrl = "https://github.com/acme/tools";
    await put(extDir, "other/SKILL.md", "---\nname: other\n---\nOld.\n");
    await store.upsert({
      id: "other",
      owner: "acme",
      repo: "tools",
      url: otherUrl,
      path: "skills/other",
      sha: "old0000000",
      treeSha: "treeOld",
      installedAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
      checkedAt: T0.toISOString(),
    });
    up.head = "def7654321";
    up.trees[path] = "tree2";
    up.down = [remote];
    await put(fixture, `${path}/HUNTING.md`, "v2");

    expect(await svc.syncAll()).toEqual({
      checked: 2,
      updated: ["other"],
      failed: ["security-audit"],
    });
    const rec = await store.get("security-audit");
    expect(rec).toMatchObject({ sha: "abc1234567", checkedAt: T1.toISOString() });
    expect(rec?.lastError).toContain("unreachable");
    expect(await hunting()).toBe("v1");
    await expect(svc.sync("security-audit")).rejects.toThrow(SkillRepoGitError);
  });

  it("folder gone upstream: copy untouched, lastError 'skill folder missing upstream'", async () => {
    up.head = "def7654321";
    up.trees[path] = null;
    const s = await svc.sync("security-audit");
    expect(s.source).toMatchObject({
      sha: "abc1234567",
      latestSha: "def7654321",
      lastError: "skill folder missing upstream",
    });
    expect(await hunting()).toBe("v1");
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("syncAll clones each repo once for several skills from it", async () => {
    await svc.install(url, ["skills/other"]);
    up.clones = [];
    up.head = "def7654321";
    up.trees = { [path]: "tree2", "skills/other": "tree3" };
    const result = await svc.syncAll();
    expect(up.clones).toEqual([remote]);
    expect(result).toEqual({ checked: 2, updated: ["security-audit", "other"], failed: [] });
  });

  it("an unknown id throws SkillNotFoundError", async () => {
    await expect(svc.sync("nope")).rejects.toThrow(SkillNotFoundError);
  });
});
