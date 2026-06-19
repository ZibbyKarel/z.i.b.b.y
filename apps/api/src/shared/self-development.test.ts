import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataRoot } from "./data-dir";
import { prepareWorktreeDir, resolveWorktreeRoot } from "./worktree-root";

/**
 * Phase 12.8 — the load-bearing self-development invariant: when ZIBBY (the builder)
 * points its loop at a repo (the subject), the subject's worktree must NEVER resolve
 * inside the builder's own tree, even when the builder's `ZIBBY_DATA_DIR` lives inside
 * a repo. The worktree root is deliberately decoupled from the data root (12.7), so a
 * goal targeting a sibling checkout can never edit files under the builder's feet.
 */
describe("self-development isolation (12.8)", () => {
  const savedData = process.env.ZIBBY_DATA_DIR;
  const savedWt = process.env.ZIBBY_WORKTREE_ROOT;

  afterEach(() => {
    if (savedData === undefined) delete process.env.ZIBBY_DATA_DIR;
    else process.env.ZIBBY_DATA_DIR = savedData;
    if (savedWt === undefined) delete process.env.ZIBBY_WORKTREE_ROOT;
    else process.env.ZIBBY_WORKTREE_ROOT = savedWt;
  });

  it("worktree root is NOT under the builder's data root (decoupled from ZIBBY_DATA_DIR)", () => {
    // Simulate the builder running with its data dir INSIDE a repo checkout.
    const builderRepo = "/var/zibby/builder-checkout";
    process.env.ZIBBY_DATA_DIR = path.join(builderRepo, "apps/api/data");
    delete process.env.ZIBBY_WORKTREE_ROOT; // default behaviour

    const wtRoot = resolveWorktreeRoot();
    expect(wtRoot.startsWith(tmpdir())).toBe(true);
    expect(wtRoot.startsWith(builderRepo)).toBe(false);
    expect(wtRoot.startsWith(resolveDataRoot())).toBe(false);
  });

  it("a subject run's worktree resolves outside the builder tree", async () => {
    const builderRepo = "/var/zibby/builder-checkout";
    process.env.ZIBBY_DATA_DIR = path.join(builderRepo, "apps/api/data");
    process.env.ZIBBY_WORKTREE_ROOT = path.join(tmpdir(), `selfdev-${process.pid}`);

    const dir = await prepareWorktreeDir("subjectgoal_1");
    expect(dir.startsWith(builderRepo)).toBe(false);
    expect(dir.startsWith(resolveDataRoot())).toBe(false);
    expect(dir.startsWith(tmpdir())).toBe(true);
  });

  it("an explicit ZIBBY_WORKTREE_ROOT is honoured (operator can pin it outside both trees)", () => {
    process.env.ZIBBY_WORKTREE_ROOT = "/var/zibby/worktrees";
    expect(resolveWorktreeRoot()).toBe("/var/zibby/worktrees");
  });
});
