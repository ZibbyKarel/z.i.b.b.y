import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_VERIFY_CHECKS } from "@zibby/contracts";
import { buildVerifyCommand, resolveVerifyChecks } from "./verify-command";

describe("buildVerifyCommand", () => {
  it("prefers explicit commands over project checks and defaults", () => {
    const cmd = buildVerifyCommand({
      commands: ["echo a", "echo b"],
      projectChecks: ["should-not-run"],
    });
    expect(cmd.command).toBe("/bin/sh");
    expect(cmd.args).toEqual(["-c", "echo a && echo b"]);
  });

  it("falls back to project checks when no explicit commands", () => {
    const cmd = buildVerifyCommand({ projectChecks: ["pnpm verify"] });
    expect(cmd.args).toEqual(["-c", "pnpm verify"]);
  });

  it("falls back to the default checks when neither is set", () => {
    const cmd = buildVerifyCommand({});
    expect(cmd.args).toEqual(["-c", DEFAULT_VERIFY_CHECKS.join(" && ")]);
  });

  it("threads spawnCwd when given and omits it otherwise", () => {
    expect(buildVerifyCommand({ spawnCwd: "/tmp/wt" }).spawnCwd).toBe("/tmp/wt");
    expect(buildVerifyCommand({}).spawnCwd).toBeUndefined();
  });
});

describe("resolveVerifyChecks", () => {
  it("resolves commands, then project checks, then defaults", () => {
    expect(resolveVerifyChecks({ commands: ["a"], projectChecks: ["b"] })).toEqual(["a"]);
    expect(resolveVerifyChecks({ projectChecks: ["b"] })).toEqual(["b"]);
    expect(resolveVerifyChecks({})).toEqual([...DEFAULT_VERIFY_CHECKS]);
  });
});

describe("buildVerifyCommand cleanCheckout", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function makeRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "zibby-verify-test-"));
    dirs.push(repo);
    const git = (...a: string[]) => execFileSync("git", a, { cwd: repo, stdio: "pipe" });
    git("init", "-q");
    writeFileSync(join(repo, "committed.txt"), "x");
    git("add", ".");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
    writeFileSync(join(repo, "dirty.txt"), "y");
    return repo;
  }
  const run = (repo: string, checks: string[]) => {
    const cmd = buildVerifyCommand({ commands: checks, cleanCheckout: true });
    return spawnSync(cmd.command, cmd.args, { cwd: repo, encoding: "utf8" });
  };
  const worktreeCount = (repo: string) =>
    execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repo, encoding: "utf8" })
      .split("\n")
      .filter((l) => l.startsWith("worktree ")).length;

  it("runs checks against committed HEAD only, exit 0", () => {
    const repo = makeRepo();
    expect(run(repo, ["test -f committed.txt", "test ! -f dirty.txt"]).status).toBe(0);
    expect(worktreeCount(repo)).toBe(1);
  });

  it("propagates the checks' exit code, not the cleanup's", () => {
    const repo = makeRepo();
    expect(run(repo, ["exit 3"]).status).toBe(3);
    expect(worktreeCount(repo)).toBe(1);
  });

  it("leaves the non-clean script untouched", () => {
    expect(buildVerifyCommand({ commands: ["a", "b"] }).args).toEqual(["-c", "a && b"]);
  });
});
