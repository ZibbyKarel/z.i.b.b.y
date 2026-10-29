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
import { InvalidWorkflowError } from "../workflows/workflows.errors";
import { WorkflowsStorageService } from "../workflows/workflows.storage.service";
import { NoSkillsFoundError, SkillInUseError, SkillRepoGitError } from "./external-skills.errors";
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
    svc = new ExternalSkillsService(
      store,
      fixtureGit(fixture, refs),
      skills,
      extDir,
      {
        record: vi.fn(),
      } as never,
      {} as never,
    );
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

  it("never copies agent instruction files, .claude/ or node_modules/ (any depth)", async () => {
    const dir = "skills/security-audit";
    for (const f of [
      "CLAUDE.md",
      "CLAUDE.local.md",
      "AGENTS.md",
      ".claude/settings.json",
      "node_modules/x/index.js",
      "docs/CLAUDE.md",
      "docs/.claude/agents/a.md",
      "docs/node_modules/y.js",
    ])
      await put(fixture, `${dir}/${f}`, "x");
    await svc.install(url, [dir]);
    const at = (f: string) => existsSync(join(extDir, "security-audit", f));
    for (const f of [
      "CLAUDE.md",
      "CLAUDE.local.md",
      "AGENTS.md",
      ".claude",
      "node_modules",
      "docs/CLAUDE.md",
      "docs/.claude",
      "docs/node_modules",
    ])
      expect(at(f), f).toBe(false);
    expect(at("HUNTING.md")).toBe(true);
    expect(at("SKILL.md")).toBe(true);
  });

  it("matches the strip list case-insensitively (macOS FS loads claude.md as CLAUDE.md)", async () => {
    const dir = "skills/security-audit";
    for (const f of [
      "a/claude.md",
      "b/.Claude/settings.json",
      "c/Agents.md",
      "d/Node_Modules/x.js",
    ])
      await put(fixture, `${dir}/${f}`, "x");
    await svc.install(url, [dir]);
    const at = (f: string) => existsSync(join(extDir, "security-audit", f));
    for (const f of ["a/claude.md", "b/.Claude", "c/Agents.md", "d/Node_Modules"])
      expect(at(f), f).toBe(false);
  });

  it("flags repeated ids within one scan, so the default selection installs", async () => {
    await put(
      fixture,
      "plugins/x/skills/security-audit/SKILL.md",
      "---\nname: security-audit\n---\nMirror.\n",
    );
    const { candidates } = await svc.scan(url);
    expect(candidates.map((c) => [c.path, c.conflict])).toEqual([
      ["plugins/x/skills/security-audit", false],
      ["skills/security-audit", true],
    ]);
    const free = candidates.filter((c) => !c.conflict).map((c) => c.path);
    await expect(svc.install(url, free)).resolves.toHaveLength(1);
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
  let up: {
    head: string;
    trees: Record<string, string | null>;
    clones: string[];
    down: string[];
    /** A path whose `treeSha` throws (a git failure mid-group). */
    treeFails?: string;
  };

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
      treeSha: async (_dir: string, p: string) => {
        if (p === up.treeFails) throw new SkillRepoGitError("git rev-parse: boom");
        return p in up.trees ? (up.trees[p] ?? null) : "tree1";
      },
    } as unknown as SkillRepoGit;
    store = new ExternalSkillsStore(join(tmp, "external-skills.json"));
    const skills = new SkillsStorageService(join(tmp, "skills"), store, extDir);
    await skills.onModuleInit();
    activity = { record: vi.fn(async () => {}) };
    svc = new ExternalSkillsService(store, git, skills, extDir, activity as never, {} as never);
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

  it("new tree with an unparseable SKILL.md: copy kept, lastError set, not updated", async () => {
    up.head = "def7654321";
    up.trees[path] = "tree2";
    await put(fixture, `${path}/SKILL.md`, "---js\n{ name: 'x' }\n---\nEvil.\n");
    await put(fixture, `${path}/HUNTING.md`, "v2");
    expect(await svc.syncAll()).toEqual({ checked: 1, updated: [], failed: ["security-audit"] });
    expect(await hunting()).toBe("v1");
    const r = await store.get("security-audit");
    expect(r).toMatchObject({ sha: "abc1234567", treeSha: "tree1", latestSha: "def7654321" });
    expect(r?.lastError).toMatch(/SKILL\.md/);
    expect(activity.record).not.toHaveBeenCalled();
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

  it("a git failure mid-group keeps the outcomes already saved", async () => {
    await svc.install(url, ["skills/other"]);
    up.head = "def7654321";
    up.treeFails = "skills/other"; // security-audit (same tree) is handled first
    expect(await svc.syncAll()).toEqual({ checked: 2, updated: [], failed: ["other"] });
    const first = await store.get("security-audit");
    expect(first).toMatchObject({ sha: "def7654321", latestSha: "def7654321" });
    expect(first?.lastError).toBeUndefined();
    expect((await store.get("other"))?.lastError).toContain("boom");
  });

  it("a record with an unparseable url is failed with lastError", async () => {
    const rec = await store.get("security-audit");
    await store.upsert({ ...rec!, id: "bad", url: "https://gitlab.com/a/b" });
    const result = await svc.syncAll();
    expect(result.failed).toEqual(["bad"]);
    expect((await store.get("bad"))?.lastError).toBeTruthy();
  });

  it("a failing lastError write does not abort syncAll", async () => {
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
    up.down = [remote];
    vi.spyOn(store, "upsert").mockRejectedValueOnce(new Error("disk full"));
    expect(await svc.syncAll()).toEqual({
      checked: 2,
      updated: ["other"],
      failed: ["security-audit"],
    });
  });

  it("an unknown id throws SkillNotFoundError", async () => {
    await expect(svc.sync("nope")).rejects.toThrow(SkillNotFoundError);
  });
});

describe("ExternalSkillsService — uninstall", () => {
  let tmp: string;
  let extDir: string;
  let store: ExternalSkillsStore;
  let workflows: WorkflowsStorageService;
  let svc: ExternalSkillsService;

  const phase = (id: string, consumes: string, produces: string, skill?: string) => ({
    id,
    type: "agent" as const,
    agent: "coder",
    model: "sonnet" as const,
    thinking: "low" as const,
    consumes,
    produces,
    ...(skill ? { skill } : {}),
  });
  const wf = (id: string, phases: ReturnType<typeof phase>[], outputs: never[] = []) =>
    workflows.create({
      id,
      name: id.toUpperCase(),
      instructions: "x",
      phases,
      outputs,
      complexity: "standard",
    });

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "ext-skills-uninstall-"));
    const fixture = join(tmp, "repo");
    extDir = join(tmp, "skills-external");
    await put(fixture, "skills/security-audit/SKILL.md", "---\nname: security-audit\n---\nHunt.\n");
    store = new ExternalSkillsStore(join(tmp, "external-skills.json"));
    const skills = new SkillsStorageService(join(tmp, "skills"), store, extDir);
    await skills.onModuleInit();
    workflows = new WorkflowsStorageService(join(tmp, "workflows"));
    await workflows.onModuleInit();
    svc = new ExternalSkillsService(
      store,
      fixtureGit(fixture),
      skills,
      extDir,
      {
        record: vi.fn(),
      } as never,
      workflows,
    );
    await svc.install(url, ["skills/security-audit"]);
    await wf("audit-only", [phase("audit", "in.md", "a.md", "security-audit")]);
    await wf("build", [
      phase("plan", "in.md", "plan.md"),
      phase("audit", "plan.md", "audit.md", "security-audit"),
      phase("code", "audit.md", "code.md"),
    ]);
    await wf("clean", [phase("plan", "in.md", "plan.md")]);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("lists the workflows whose phases use the skill", async () => {
    expect(await svc.usages("security-audit")).toEqual([
      { workflowId: "audit-only", name: "AUDIT-ONLY", phaseIds: ["audit"] },
      { workflowId: "build", name: "BUILD", phaseIds: ["audit"] },
    ]);
  });

  it("an own or unknown skill id → SkillNotFoundError", async () => {
    await expect(svc.usages("nope")).rejects.toThrow(SkillNotFoundError);
    await expect(svc.uninstall("nope", {})).rejects.toThrow(SkillNotFoundError);
    await put(join(tmp, "skills"), "own.md", "---\nname: own\n---\nMine.\n");
    await expect(svc.uninstall("own", {})).rejects.toThrow(SkillNotFoundError);
    expect(existsSync(join(tmp, "skills", "own.md"))).toBe(true);
  });

  it("a usage without a decision → SkillInUseError, nothing changed", async () => {
    await expect(svc.uninstall("security-audit", { build: "step" })).rejects.toThrow(
      SkillInUseError,
    );
    expect(await store.get("security-audit")).toBeDefined();
    expect(existsSync(join(extDir, "security-audit"))).toBe(true);
    expect((await workflows.get("build")).phases).toHaveLength(3);
  });

  it("deletes a 'workflow', drops a 'step', then removes folder + record", async () => {
    expect(
      await svc.uninstall("security-audit", { "audit-only": "workflow", build: "step" }),
    ).toEqual({ id: "security-audit" });
    await expect(workflows.get("audit-only")).rejects.toThrow();
    const build = await workflows.get("build");
    expect(build.phases.map((p) => p.id)).toEqual(["plan", "code"]);
    expect(build.phases[1]?.consumes).toBe("plan.md");
    expect((await workflows.get("clean")).phases).toHaveLength(1);
    expect(await store.get("security-audit")).toBeUndefined();
    expect(existsSync(join(extDir, "security-audit"))).toBe(false);
  });

  it("a step removal that leaves a workflow invalid → 422-style error, nothing changed", async () => {
    await expect(
      svc.uninstall("security-audit", { "audit-only": "step", build: "step" }),
    ).rejects.toThrow(InvalidWorkflowError);
    await expect(
      svc.uninstall("security-audit", { "audit-only": "step", build: "step" }),
    ).rejects.toThrow(/audit-only/);
    expect((await workflows.get("build")).phases).toHaveLength(3);
    expect(await workflows.get("audit-only")).toBeDefined();
    expect(await store.get("security-audit")).toBeDefined();
    expect(existsSync(join(extDir, "security-audit"))).toBe(true);
  });

  it("an output sink left dangling by step removal → error naming the workflow", async () => {
    await workflows.update("build", { outputs: [{ type: "pr", from: "code.md" }] });
    await wf("tail", [
      phase("plan", "in.md", "plan.md"),
      phase("audit", "plan.md", "x.md", "security-audit"),
    ]);
    await workflows.update("tail", { outputs: [{ type: "pr", from: "x.md" }] });
    await expect(
      svc.uninstall("security-audit", { "audit-only": "workflow", build: "step", tail: "step" }),
    ).rejects.toThrow(/tail/);
    expect(await workflows.get("audit-only")).toBeDefined();
  });
});
