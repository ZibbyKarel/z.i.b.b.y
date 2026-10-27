import { ChatAboutSchema, type InboxPr } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { prChatAbout } from "./prChatAbout";

const pr: InboxPr = {
  source: "github",
  number: 42,
  title: "Fix login",
  url: "https://github.com/o/r/pull/42",
  repo: "o/r",
  author: "me",
  createdAt: "2026-01-01T00:00:00.000Z",
  draft: false,
  ci: "passing",
  review: "none",
  mergeable: null,
  bucket: "mine",
  blocker: "awaiting-review",
  section: "waiting",
  projectId: "api",
  headRef: "fix",
  baseRef: "main",
};
const smallDiff = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n x\n+y\n";

describe("prChatAbout", () => {
  it("describes the PR", () => {
    const a = prChatAbout(pr);
    expect(a.kind).toBe("pr");
    expect(a.id).toBe(pr.url);
    expect(a.href).toBe(pr.url);
    expect(a.label).toBe("PR #42 · Fix login");
    expect(a.details).toContain("Repository: o/r");
    expect(a.details).toContain("Branch: fix → main");
    expect(a.details).toContain("CI: passing");
    expect(a.details).toContain("Mergeable: unknown");
    expect(a.details).not.toContain("Diff:");
  });

  it("includes file stats and the diff", () => {
    const a = prChatAbout(pr, { diff: { diff: smallDiff, truncated: false } });
    expect(a.details).toContain("Files changed (1):");
    expect(a.details).toContain("a.ts +1 −0");
    expect(a.details).toContain("Diff:");
    expect(a.details).toContain(smallDiff);
    expect(a.details).not.toContain("[diff truncated]");
  });

  it("truncates a huge diff within the schema limit", () => {
    const a = prChatAbout(pr, { diff: { diff: "x".repeat(50_000), truncated: false } });
    expect(ChatAboutSchema.safeParse(a).success).toBe(true);
    expect(a.details).toContain("[diff truncated]");
  });

  it("marks a diff truncated upstream", () => {
    const a = prChatAbout(pr, { diff: { diff: smallDiff, truncated: true } });
    expect(a.details).toContain("[diff truncated]");
  });

  it("caps a long title", () => {
    const a = prChatAbout({ ...pr, title: "t".repeat(300) });
    expect(a.label.length).toBeLessThanOrEqual(200);
    expect(ChatAboutSchema.safeParse(a).success).toBe(true);
  });

  it("stays within the schema cap with many long paths and a huge diff", () => {
    const paths = Array.from({ length: 120 }, (_, i) => `${"d".repeat(300)}${i}.ts`);
    const diff = paths
      .map((f) => `diff --git a/${f} b/${f}\n@@ -1 +1 @@\n-a\n+b\n`)
      .join("")
      .concat("y".repeat(40_000));
    const a = prChatAbout(pr, { diff: { diff, truncated: false } });
    expect(a.details?.length).toBeLessThanOrEqual(24_000);
    expect(ChatAboutSchema.safeParse(a).success).toBe(true);
    expect(a.details).toContain("[diff truncated]");
  });

  it("does not split a surrogate pair when cutting", () => {
    const a = prChatAbout(pr, { diff: { diff: "😀".repeat(20_000), truncated: false } });
    expect(a.details).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    const l = prChatAbout({ ...pr, title: "😀".repeat(300) });
    expect(l.label).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it("clamps a huge header on every path", () => {
    const title = "t".repeat(30_000);
    expect(prChatAbout({ ...pr, title }).details?.length).toBeLessThanOrEqual(24_000);
    const a = prChatAbout({ ...pr, title }, { diff: { diff: smallDiff, truncated: false } });
    expect(a.details?.length).toBeLessThanOrEqual(24_000);
  });
});
