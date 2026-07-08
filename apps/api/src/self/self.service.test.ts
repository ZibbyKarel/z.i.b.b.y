import { beforeEach, describe, expect, it, vi } from "vitest";

// `SelfService` calls `promisify(execFile)`. Node's real `child_process.execFile`
// carries a `util.promisify.custom` implementation that resolves `{ stdout, stderr }`;
// a bare `vi.fn()` replacement lacks it, so generic `promisify` would instead resolve
// with only the callback's 2nd argument (the raw `stdout` string) — breaking every
// `r.stdout` read in the service. Attaching the same custom symbol to our mock keeps
// its promisified shape identical to the real thing.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("node:child_process", () => {
  const customPromisify = Symbol.for("nodejs.util.promisify.custom");
  Object.defineProperty(execFileMock, customPromisify, {
    value: (file: string, args: string[], options: unknown) =>
      new Promise((resolve, reject) => {
        execFileMock(
          file,
          args,
          options,
          (error: Error | null, stdout: string, stderr: string) => {
            if (error) reject(error);
            else resolve({ stdout, stderr });
          },
        );
      }),
  });
  return { execFile: execFileMock };
});

import { SelfDirtyError, SelfService, SelfUpdateConflictError } from "./self.service";

type Resp = { stdout?: string } | { error: Error };

/**
 * Route mocked `execFile` calls by `"<cmd> <args…>"`. `promisify(execFile)`
 * always calls through with `(file, args, options, callback)` here — every
 * real call site in {@link SelfService} passes an options object.
 */
function mockGit(responses: Record<string, Resp>) {
  execFileMock.mockImplementation((...callArgs: unknown[]) => {
    const cmd = callArgs[0] as string;
    const args = (callArgs[1] as string[]) ?? [];
    const callback = callArgs[callArgs.length - 1] as (
      error: Error | null,
      stdout: string,
      stderr: string,
    ) => void;
    const key = `${cmd} ${args.join(" ")}`.trim();
    const resp = responses[key];
    if (!resp) {
      callback(new Error(`unmocked exec call: ${key}`), "", "");
    } else if ("error" in resp) {
      callback(resp.error, "", "");
    } else {
      callback(null, resp.stdout ?? "", "");
    }
    return {} as never;
  });
}

const REPO_OK = "git rev-parse --git-dir";
const FETCH = "git fetch origin";
const SYMBOLIC = "git symbolic-ref --quiet --short refs/remotes/origin/HEAD";
const CURRENT_BRANCH = "git branch --show-current";
const STATUS_PORCELAIN = "git status --porcelain";
const BEHIND = "git rev-list --count HEAD..origin/main";
const AHEAD = "git rev-list --count origin/main..HEAD";
const GH_VERSION = "gh --version";
const GH_PR_LIST = "gh pr list --state open --json number,title,url";
const PULL = "git pull --ff-only origin main";

const CLEAN_UP_TO_DATE = {
  [REPO_OK]: { stdout: ".git" },
  [FETCH]: { stdout: "" },
  [SYMBOLIC]: { stdout: "origin/main\n" },
  [CURRENT_BRANCH]: { stdout: "main\n" },
  [STATUS_PORCELAIN]: { stdout: "" },
  [BEHIND]: { stdout: "0\n" },
  [AHEAD]: { stdout: "0\n" },
  [GH_VERSION]: { stdout: "gh version 2.40.0\n" },
  [GH_PR_LIST]: { stdout: "[]" },
};

describe("SelfService.status", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("returns the benign not-a-repo fallback when the install root isn't a git checkout", async () => {
    mockGit({ [REPO_OK]: { error: new Error("not a git repository") } });
    const status = await new SelfService().status();
    expect(status).toEqual({
      currentBranch: "",
      defaultBranch: "",
      behind: 0,
      ahead: 0,
      dirty: false,
      upToDate: true,
      openPrCount: 0,
      prs: [],
      ghAvailable: false,
    });
  });

  it("reports behind/ahead counts from git and an ISO fetchedAt when the fetch succeeds", async () => {
    mockGit({ ...CLEAN_UP_TO_DATE, [BEHIND]: { stdout: "3\n" }, [AHEAD]: { stdout: "1\n" } });
    const status = await new SelfService().status();
    expect(status.behind).toBe(3);
    expect(status.ahead).toBe(1);
    expect(status.upToDate).toBe(false);
    expect(status.currentBranch).toBe("main");
    expect(status.defaultBranch).toBe("main");
    expect(status.fetchedAt).toEqual(expect.any(String));
    expect(() => new Date(status.fetchedAt as string).toISOString()).not.toThrow();
  });

  it("marks dirty=true when the working tree has uncommitted changes", async () => {
    mockGit({ ...CLEAN_UP_TO_DATE, [STATUS_PORCELAIN]: { stdout: " M file.ts\n" } });
    const status = await new SelfService().status();
    expect(status.dirty).toBe(true);
  });

  it("still returns a local view (no fetchedAt) when git fetch origin fails (offline)", async () => {
    mockGit({ ...CLEAN_UP_TO_DATE, [FETCH]: { error: new Error("could not resolve host") } });
    const status = await new SelfService().status();
    expect(status.fetchedAt).toBeUndefined();
    expect(status.currentBranch).toBe("main");
    expect(status.upToDate).toBe(true);
  });

  it("reports ghAvailable:false and empty prs when the gh CLI is missing", async () => {
    mockGit({ ...CLEAN_UP_TO_DATE, [GH_VERSION]: { error: new Error("ENOENT") } });
    const status = await new SelfService().status();
    expect(status.ghAvailable).toBe(false);
    expect(status.prs).toEqual([]);
    expect(status.openPrCount).toBe(0);
  });

  it("reports ghAvailable:false and empty prs when gh pr list fails (soft, never throws)", async () => {
    mockGit({ ...CLEAN_UP_TO_DATE, [GH_PR_LIST]: { error: new Error("not authenticated") } });
    const status = await new SelfService().status();
    expect(status.ghAvailable).toBe(false);
    expect(status.prs).toEqual([]);
  });

  it("parses open PRs from gh pr list and counts them", async () => {
    mockGit({
      ...CLEAN_UP_TO_DATE,
      [GH_PR_LIST]: {
        stdout: JSON.stringify([
          { number: 12, title: "Fix the thing", url: "https://github.com/o/r/pull/12" },
          { number: 13, title: "Add feature", url: "https://github.com/o/r/pull/13" },
        ]),
      },
    });
    const status = await new SelfService().status();
    expect(status.ghAvailable).toBe(true);
    expect(status.openPrCount).toBe(2);
    expect(status.prs).toEqual([
      { number: 12, title: "Fix the thing", url: "https://github.com/o/r/pull/12" },
      { number: 13, title: "Add feature", url: "https://github.com/o/r/pull/13" },
    ]);
  });

  it("falls back to 'main' when no origin/HEAD symbolic ref is cached", async () => {
    mockGit({ ...CLEAN_UP_TO_DATE, [SYMBOLIC]: { error: new Error("no such ref") } });
    const status = await new SelfService().status();
    expect(status.defaultBranch).toBe("main");
  });
});

describe("SelfService.update", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("refuses (throws SelfDirtyError) when the tree has uncommitted changes", async () => {
    mockGit({
      [REPO_OK]: { stdout: ".git" },
      [STATUS_PORCELAIN]: { stdout: " M file.ts\n" },
    });
    await expect(new SelfService().update()).rejects.toBeInstanceOf(SelfDirtyError);
  });

  it("returns updated:false, behind:0 when already up to date (no pull attempted)", async () => {
    mockGit({ ...CLEAN_UP_TO_DATE, [BEHIND]: { stdout: "0\n" } });
    const result = await new SelfService().update();
    expect(result).toEqual({ updated: false, behind: 0, message: "already up to date" });
    expect(execFileMock).not.toHaveBeenCalledWith("git", ["pull", "--ff-only", "origin", "main"], expect.anything());
  });

  it("pulls fast-forward-only and reports updated:true on success", async () => {
    mockGit({
      ...CLEAN_UP_TO_DATE,
      [BEHIND]: { stdout: "2\n" },
      [PULL]: { stdout: "Updating abc123..def456\nFast-forward\n" },
    });
    const result = await new SelfService().update();
    expect(result).toEqual({ updated: true, behind: 0 });
  });

  it("throws SelfUpdateConflictError (409-mapped) when the pull can't fast-forward", async () => {
    mockGit({
      ...CLEAN_UP_TO_DATE,
      [BEHIND]: { stdout: "2\n" },
      [PULL]: { error: new Error("fatal: Not possible to fast-forward, aborting.") },
    });
    await expect(new SelfService().update()).rejects.toBeInstanceOf(SelfUpdateConflictError);
  });

  it("never invokes --force or reset even on a pull failure", async () => {
    mockGit({
      ...CLEAN_UP_TO_DATE,
      [BEHIND]: { stdout: "2\n" },
      [PULL]: { error: new Error("diverged") },
    });
    await new SelfService().update().catch(() => undefined);
    for (const call of execFileMock.mock.calls) {
      const args = (call[1] as string[]) ?? [];
      expect(args).not.toContain("--force");
      expect(args).not.toContain("reset");
    }
  });

  it("returns a benign no-op when the install root isn't a git checkout", async () => {
    mockGit({ [REPO_OK]: { error: new Error("not a git repository") } });
    const result = await new SelfService().update();
    expect(result).toEqual({ updated: false, behind: 0, message: "not a git repository" });
  });
});
