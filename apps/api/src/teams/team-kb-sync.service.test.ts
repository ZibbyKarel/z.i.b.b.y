import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TeamKbSyncError, TeamKbSyncService } from "./team-kb-sync.service";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  });

describe("TeamKbSyncService", () => {
  let root: string;
  let clone: string;
  let other: string;
  const svc = new TeamKbSyncService();

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "kb-sync-"));
    const origin = path.join(root, "origin.git");
    clone = path.join(root, "clone");
    other = path.join(root, "other");
    git(root, "init", "--bare", "-b", "main", origin);
    git(root, "clone", origin, other);
    writeFileSync(path.join(other, "a.md"), "a\n");
    git(other, "add", ".");
    git(other, "commit", "-m", "init");
    git(other, "push", "origin", "HEAD:main");
    git(root, "clone", origin, clone);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("is a no-op when already current", async () => {
    const r = await svc.sync(clone);
    expect(r.updated).toBe(false);
    expect(r.before).toBe(r.after);
  });

  it("fast-forwards when origin has new commits", async () => {
    writeFileSync(path.join(other, "b.md"), "b\n");
    git(other, "add", ".");
    git(other, "commit", "-m", "more");
    git(other, "push", "origin", "HEAD:main");
    const r = await svc.sync(clone);
    expect(r.updated).toBe(true);
    expect(r.before).not.toBe(r.after);
    expect(r.after).toBe(git(other, "rev-parse", "--short", "HEAD").trim());
  });

  it("throws TeamKbSyncError for a non-repo directory", async () => {
    const plain = mkdtempSync(path.join(os.tmpdir(), "kb-plain-"));
    await expect(svc.sync(plain)).rejects.toBeInstanceOf(TeamKbSyncError);
    rmSync(plain, { recursive: true, force: true });
  });

  it("refuses a KB folder nested inside another repo (never pulls the parent)", async () => {
    const nested = path.join(clone, "sub");
    mkdirSync(nested, { recursive: true });
    const head = git(clone, "rev-parse", "HEAD").trim();
    await expect(svc.sync(nested)).rejects.toThrow(/root of its own git repository/);
    expect(git(clone, "rev-parse", "HEAD").trim()).toBe(head);
  });

  it("throws TeamKbSyncError when history diverged", async () => {
    writeFileSync(path.join(clone, "local.md"), "l\n");
    git(clone, "add", ".");
    git(clone, "commit", "-m", "local");
    writeFileSync(path.join(other, "c.md"), "c\n");
    git(other, "add", ".");
    git(other, "commit", "-m", "remote");
    git(other, "push", "origin", "HEAD:main");
    await expect(svc.sync(clone)).rejects.toBeInstanceOf(TeamKbSyncError);
  });
});
