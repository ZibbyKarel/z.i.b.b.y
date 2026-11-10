import { describe, expect, it } from "vitest";
import { capUnifiedDiff } from "./cap-unified-diff";

describe("capUnifiedDiff", () => {
  it("returns a diff under the cap unchanged", () => {
    expect(capUnifiedDiff("diff --git a b\n+x\n", 100)).toEqual({
      diff: "diff --git a b\n+x\n",
      truncated: false,
    });
  });

  it("cuts an oversized diff at the last file boundary", () => {
    const text = `diff --git a/a b/a\n+${"x".repeat(30)}\ndiff --git a/b b/b\n+${"y".repeat(30)}\n`;
    const out = capUnifiedDiff(text, 60);
    expect(out.truncated).toBe(true);
    expect(out.diff.length).toBeLessThanOrEqual(60);
    expect(out.diff.endsWith("\n")).toBe(true);
    expect(out.diff).not.toContain("a/b");
  });

  it("hard-cuts when there is no file boundary", () => {
    const out = capUnifiedDiff("z".repeat(100), 40);
    expect(out).toEqual({ diff: "z".repeat(40), truncated: true });
  });
});
