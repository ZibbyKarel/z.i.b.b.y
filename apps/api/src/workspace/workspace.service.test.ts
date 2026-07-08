import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceService, WorkspaceSetupError, sanitizeBranchSlug } from "./workspace.service";

const exec = promisify(execFile);

/** Run git in `cwd` and return trimmed stdout (test helper, not the service). */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout.trim();
}

/** A throwaway git repo with one commit, so HEAD resolves and worktrees can branch. */
async function initRepo(dir: string): Promise<void> {
  await git(dir, "init", "-b", "main");
  await git(dir, "config", "user.email", "test@zibby.local");
  await git(dir, "config", "user.name", "ZIBBY Test");
  await fs.writeFile(path.join(dir, "README.md"), "# fixture\n", "utf8");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-m", "initial");
}

/** A bare repo (acts as `origin`) with `main` as its default (HEAD) branch. */
async function initBareOrigin(dir: string): Promise<void> {
  await git(dir, "init", "--bare", "-b", "main");
}

/** Clone `origin` into `dir`, add a commit, push it — `dir` ends up with a
 * configured `origin` remote and `refs/remotes/origin/HEAD` set (as a real
 * `git clone` does), the same shape a real project checkout has. */
async function cloneAndCommit(origin: string, dir: string, message: string): Promise<string> {
  await exec("git", ["clone", origin, dir]);
  await git(dir, "config", "user.email", "test@zibby.local");
  await git(dir, "config", "user.name", "ZIBBY Test");
  await fs.writeFile(path.join(dir, `${message}.txt`), message, "utf8");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-m", message);
  await git(dir, "push", "origin", "HEAD:main");
  return git(dir, "rev-parse", "HEAD");
}

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

describe("sanitizeBranchSlug", () => {
  it.each([
    ["Delivery", "delivery"],
    ["build-feature", "build-feature"],
    ["Fix the   ___ bug!!", "fix-the-bug"],
    ["  ---trim--- ", "trim"],
    ["", "run"],
    ["!!!", "run"],
    ["UPPER_snake.Mix", "upper-snake-mix"],
  ])("normalizes %j → %j", (input, expected) => {
    expect(sanitizeBranchSlug(input)).toBe(expected);
  });

  it("caps long slugs and never leaves a trailing dash", () => {
    const slug = sanitizeBranchSlug("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("WorkspaceService", () => {
  const svc = new WorkspaceService();
  let repo: string;
  let runDir: string;

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), "ws-repo-"));
    runDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-run-"));
    await initRepo(repo);
  });

  afterEach(async () => {
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(runDir, { recursive: true, force: true });
  });

  it("detects a git repo and a non-git directory", async () => {
    expect(await svc.isGitRepo(repo)).toBe(true);
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), "ws-plain-"));
    try {
      expect(await svc.isGitRepo(plain)).toBe(false);
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });

  it("creates a worktree on a zibby/* branch off HEAD without touching the main checkout", async () => {
    const headBefore = await git(repo, "rev-parse", "HEAD");
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({
      projectPath: repo,
      runId: "delivery_123",
      slug: "Delivery",
      dir,
    });

    expect(ws.branch).toBe("zibby/delivery_123-delivery");
    expect(ws.path).toBe(dir);
    expect(ws.baseRef).toBe(headBefore);
    // The worktree is checked out on the new branch.
    expect(await git(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe(ws.branch);
    // The branch exists in the repo.
    const branches = await git(repo, "branch", "--list", ws.branch);
    expect(branches).toContain(ws.branch);

    // A commit in the worktree advances the branch but never the main checkout.
    await fs.writeFile(path.join(dir, "feature.txt"), "work\n", "utf8");
    await git(dir, "add", "-A");
    await git(dir, "commit", "-m", "feature work");
    expect(await git(repo, "rev-parse", "HEAD")).toBe(headBefore);
    expect(await git(repo, "rev-parse", ws.branch)).not.toBe(headBefore);
  });

  it("diffstat lists the worktree's commits and changed files against the base", async () => {
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({ projectPath: repo, runId: "r1", slug: "s", dir });
    await fs.writeFile(path.join(dir, "feature.txt"), "work\n", "utf8");
    await git(dir, "add", "-A");
    await git(dir, "commit", "-m", "add feature");

    const out = await svc.diffstat({ worktreePath: dir, baseRef: ws.baseRef });
    expect(out).toContain("add feature");
    expect(out).toContain("feature.txt");
  });

  it("checkpoint commits a dirty worktree, returns the sha, and never touches main", async () => {
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({ projectPath: repo, runId: "r-cp", slug: "s", dir });
    const headBefore = await git(repo, "rev-parse", "HEAD");
    await fs.writeFile(path.join(dir, "feature.txt"), "work\n", "utf8");

    const result = await svc.checkpoint({
      worktreePath: dir,
      phaseId: "koder",
      summary: "did the thing",
    });
    expect(result).not.toBeNull();
    // The branch advanced with a zibby-checkpoint commit; the main checkout did not.
    expect(await git(repo, "rev-parse", "HEAD")).toBe(headBefore);
    const log = await git(dir, "log", "--oneline", "-1");
    expect(log).toContain("zibby-checkpoint(koder): did the thing");
    expect(log).toContain(result!.sha);
    // The branch still exists; the worktree tree is now clean.
    expect(await git(repo, "branch", "--list", ws.branch)).toContain(ws.branch);
  });

  it("checkpoint returns null on a clean tree (nothing to commit)", async () => {
    const dir = path.join(runDir, "worktree");
    await svc.createWorktree({ projectPath: repo, runId: "r-clean", slug: "s", dir });
    const result = await svc.checkpoint({ worktreePath: dir, phaseId: "verify", summary: "noop" });
    expect(result).toBeNull();
  });

  it("checkpoint refuses a non-worktree directory (never the operator's main checkout)", async () => {
    // The main repo checkout has a `.git` DIR, but the guard runs git in-place only on
    // a real worktree marker; a plain non-git dir is refused outright.
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), "ws-plain-cp-"));
    try {
      await fs.writeFile(path.join(plain, "dirty.txt"), "x", "utf8");
      expect(await svc.checkpoint({ worktreePath: plain, phaseId: "x", summary: "y" })).toBeNull();
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });

  it("commitLog lists the branch commits since the base ref", async () => {
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({ projectPath: repo, runId: "r-log", slug: "s", dir });
    await fs.writeFile(path.join(dir, "a.txt"), "a\n", "utf8");
    await svc.checkpoint({ worktreePath: dir, phaseId: "koder", summary: "first" });
    const out = await svc.commitLog({ worktreePath: dir, baseRef: ws.baseRef });
    expect(out).toContain("zibby-checkpoint(koder): first");
  });

  it("removes the worktree and prunes its metadata, leaving the branch intact", async () => {
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({ projectPath: repo, runId: "r2", slug: "s", dir });
    await svc.removeWorktree({ projectPath: repo, worktreePath: dir });

    // The worktree dir is gone and git no longer lists it.
    expect(
      await fs
        .access(dir)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
    const list = await git(repo, "worktree", "list");
    expect(list).not.toContain(dir);
    // The branch is NEVER deleted — it may carry the PR.
    expect(await git(repo, "branch", "--list", ws.branch)).toContain(ws.branch);
  });

  it("prunes stale metadata even when the worktree dir was already removed (rm-first)", async () => {
    const dir = path.join(runDir, "worktree");
    await svc.createWorktree({ projectPath: repo, runId: "r3", slug: "s", dir });
    // Simulate the sandbox rm having run first: delete the dir, then prune.
    await fs.rm(dir, { recursive: true, force: true });
    await svc.removeWorktree({ projectPath: repo, worktreePath: dir });
    const list = await git(repo, "worktree", "list", "--porcelain");
    expect(list).not.toContain(dir);
  });

  it("surfaces a readable error when worktree creation fails (target dir already exists)", async () => {
    const dir = path.join(runDir, "worktree");
    // Pre-create the target with content so `git worktree add` refuses it.
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "occupied.txt"), "x", "utf8");
    await expect(
      svc.createWorktree({ projectPath: repo, runId: "r4", slug: "s", dir }),
    ).rejects.toBeInstanceOf(WorkspaceSetupError);
  });

  it("surfaces a readable error on a non-git project path", async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), "ws-plain2-"));
    try {
      await expect(
        svc.createWorktree({
          projectPath: plain,
          runId: "r5",
          slug: "s",
          dir: path.join(runDir, "worktree"),
        }),
      ).rejects.toBeInstanceOf(WorkspaceSetupError);
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });
});

/**
 * Phase 76 — `createWorktree` fetches `origin` and cuts from `origin/<default>`
 * (the origin tip), not local HEAD; degrades gracefully offline; and never
 * touches the operator's checkout (no `checkout`/`reset`). Real git plumbing
 * throughout (a bare "origin" + a second clone that pushes past it) rather than
 * mocked `execFile`, so the assertions are on observable git state — the same
 * style as the rest of this file.
 */
describe("WorkspaceService — fetch-origin base (Phase 76)", () => {
  let origin: string;
  let repo: string;
  let runDir: string;

  beforeEach(async () => {
    origin = await fs.mkdtemp(path.join(os.tmpdir(), "ws-origin-"));
    repo = await fs.mkdtemp(path.join(os.tmpdir(), "ws-clone-"));
    runDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-run2-"));
    await initBareOrigin(origin);
  });

  afterEach(async () => {
    await fs.rm(origin, { recursive: true, force: true });
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(runDir, { recursive: true, force: true });
  });

  it("fetches origin and cuts the worktree from origin/<default>, not the (stale) local HEAD", async () => {
    const localHead = await cloneAndCommit(origin, repo, "initial");
    // A second clone pushes a NEW commit to origin AFTER `repo` cloned — `repo`'s
    // local HEAD and its cached `refs/remotes/origin/main` are now stale.
    const pusher = await fs.mkdtemp(path.join(os.tmpdir(), "ws-pusher-"));
    const originHead = await cloneAndCommit(origin, pusher, "second");
    await fs.rm(pusher, { recursive: true, force: true });
    expect(originHead).not.toBe(localHead);

    const svc = new WorkspaceService(fakeLogger as never);
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({ projectPath: repo, runId: "r-fetch", slug: "s", dir });

    // Cut from the origin tip (post-fetch), NOT the stale local HEAD.
    expect(ws.baseRef).toBe(originHead);
    expect(await git(dir, "rev-parse", "HEAD")).toBe(originHead);

    // The operator's checkout is untouched: same branch, same (stale) HEAD, clean tree.
    expect(await git(repo, "rev-parse", "HEAD")).toBe(localHead);
    expect(await git(repo, "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(await git(repo, "status", "--porcelain")).toBe("");
  });

  it("falls back to local HEAD when git fetch origin fails (offline)", async () => {
    const localHead = await cloneAndCommit(origin, repo, "initial");
    // Point origin at a path that doesn't exist — `git fetch origin` fails the
    // way it would on a genuinely offline machine (network/remote unreachable).
    await git(repo, "remote", "set-url", "origin", path.join(os.tmpdir(), "ws-does-not-exist"));

    const child = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const logger = { child: () => child };
    const svc = new WorkspaceService(logger as never);
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({ projectPath: repo, runId: "r-offline", slug: "s", dir });

    expect(ws.baseRef).toBe(localHead);
    expect(await git(dir, "rev-parse", "HEAD")).toBe(localHead);
    expect(child.warn).toHaveBeenCalledWith(
      expect.stringMatching(/git fetch origin failed/),
      expect.anything(),
    );

    // The operator's checkout is still untouched.
    expect(await git(repo, "rev-parse", "HEAD")).toBe(localHead);
    expect(await git(repo, "status", "--porcelain")).toBe("");
  });

  it("degrades gracefully when the project has no origin remote configured at all", async () => {
    // No `origin` remote at all (a bare local-only repo, e.g. a freshly `git init`ed
    // project never pushed anywhere) — `git fetch origin` fails immediately.
    await initRepo(repo);
    const headBefore = await git(repo, "rev-parse", "HEAD");
    const svc = new WorkspaceService(fakeLogger as never);
    const dir = path.join(runDir, "worktree");
    const ws = await svc.createWorktree({ projectPath: repo, runId: "r-noorigin", slug: "s", dir });
    expect(ws.baseRef).toBe(headBefore);
  });
});

describe("WorkspaceService.clone (Phase 76)", () => {
  let origin: string;
  let dest: string;

  beforeEach(async () => {
    origin = await fs.mkdtemp(path.join(os.tmpdir(), "ws-clone-origin-"));
    await initRepo(origin);
    dest = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "ws-clone-dest-")), "cloned");
  });

  afterEach(async () => {
    await fs.rm(origin, { recursive: true, force: true });
    await fs.rm(path.dirname(dest), { recursive: true, force: true });
  });

  it("clones the remote into dir", async () => {
    const svc = new WorkspaceService(fakeLogger as never);
    await svc.clone(origin, dest);
    expect(await svc.isGitRepo(dest)).toBe(true);
    expect(await git(dest, "log", "--oneline", "-1")).toContain("initial");
  });

  it("throws WorkspaceSetupError when the remote doesn't exist", async () => {
    const svc = new WorkspaceService(fakeLogger as never);
    await expect(
      svc.clone(path.join(os.tmpdir(), "ws-clone-does-not-exist"), dest),
    ).rejects.toBeInstanceOf(WorkspaceSetupError);
  });
});
