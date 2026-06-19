import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataRoot } from "./data-dir";
import { prepareWorktreeDir, resolveWorktreeRoot } from "./worktree-root";

/**
 * Phase 12.7 — run worktrees must resolve OUTSIDE the repo/data tree, so a watcher,
 * a verifier's own `pnpm test`, or a `fs.rm(runsDir)` can never traverse/race them.
 */
describe("resolveWorktreeRoot", () => {
  const original = process.env.ZIBBY_WORKTREE_ROOT;
  const created: string[] = [];

  afterEach(() => {
    if (original === undefined) delete process.env.ZIBBY_WORKTREE_ROOT;
    else process.env.ZIBBY_WORKTREE_ROOT = original;
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("honours ZIBBY_WORKTREE_ROOT (absolute)", () => {
    process.env.ZIBBY_WORKTREE_ROOT = "/tmp/zibby-wt";
    expect(resolveWorktreeRoot()).toBe("/tmp/zibby-wt");
  });

  it("defaults to an OS-temp root, never under the data root", () => {
    delete process.env.ZIBBY_WORKTREE_ROOT;
    const root = resolveWorktreeRoot();
    expect(root.startsWith(tmpdir())).toBe(true);
    // The whole point: the worktree root must not live under the data tree.
    expect(root.startsWith(resolveDataRoot())).toBe(false);
  });

  it("prepareWorktreeDir creates the parent and returns a runId leaf under the root", async () => {
    const root = path.join(tmpdir(), `zibby-wt-test-${process.pid}`);
    process.env.ZIBBY_WORKTREE_ROOT = root;
    created.push(root);
    const dir = await prepareWorktreeDir("g_123");
    expect(path.dirname(dir)).toBe(root);
    expect(path.basename(dir)).toBe("g_123");
    expect(existsSync(root)).toBe(true); // parent exists for `git worktree add`
    expect(existsSync(dir)).toBe(false); // leaf left for git to create
  });
});
