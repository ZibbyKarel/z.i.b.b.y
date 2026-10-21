import { describe, expect, it } from "vitest";
import { diffFiles } from "./diffFiles";

const DIFF = [
  "diff --git a/a.ts b/a.ts",
  "index 1..2 100644",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1,2 +1,3 @@",
  " keep",
  "-old",
  "+new",
  "+more",
  "diff --git a/b/c.ts b/b/c.ts",
  "--- a/b/c.ts",
  "+++ b/b/c.ts",
  "@@ -1 +1 @@",
  "-x",
  "+y",
].join("\n");

describe("diffFiles", () => {
  it("counts additions and removals per file, ignoring the ---/+++ headers", () => {
    expect(diffFiles(DIFF)).toEqual([
      { path: "a.ts", added: 2, removed: 1 },
      { path: "b/c.ts", added: 1, removed: 1 },
    ]);
  });
  it("is empty for an empty diff", () => expect(diffFiles("")).toEqual([]));
});
