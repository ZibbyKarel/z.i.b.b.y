import { describe, expect, it } from "vitest";
import { findingHunk, parseReviewDoc, prFileLineUrl, serializeReviewDoc } from "./prReviewDoc";

describe("parseReviewDoc", () => {
  it("splits the summary from severity-tagged findings", () => {
    const doc = [
      "Reviewed `abc`.",
      "",
      "### a/b.tsx:12 (Important)",
      "Fix this.",
      "",
      "### c.ts:3-5 (Minor)",
      "```",
      "### not a heading:1",
      "```",
      "Add a test.",
    ].join("\n");
    const { summary, findings } = parseReviewDoc(doc);
    expect(summary).toBe("Reviewed `abc`.");
    expect(findings).toEqual([
      { path: "a/b.tsx", line: 12, severity: "Important", body: "Fix this." },
      {
        path: "c.ts",
        line: 5,
        startLine: 3,
        severity: "Minor",
        body: "```\n### not a heading:1\n```\nAdd a test.",
      },
    ]);
  });

  it("returns no findings for a plain document", () => {
    expect(parseReviewDoc("just text").findings).toEqual([]);
  });
});

describe("findingHunk", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,3 +10,4 @@",
    " ctx",
    "-old",
    "+new1",
    "+new2",
    " tail",
    "diff --git a/b.ts b/b.ts",
    "@@ -1 +1 @@",
    "+only",
  ].join("\n");

  it("cuts the hunk at the commented new-side line", () => {
    expect(findingHunk(diff, "a.ts", 12)).toBe("@@ -1,3 +10,4 @@\n ctx\n-old\n+new1\n+new2");
    expect(findingHunk(diff, "b.ts", 1)).toBe("@@ -1 +1 @@\n+only");
  });

  it("is null for a line outside the diff", () => {
    expect(findingHunk(diff, "a.ts", 99)).toBeNull();
    expect(findingHunk(diff, "zzz.ts", 1)).toBeNull();
  });
});

describe("serializeReviewDoc", () => {
  it("round-trips through parseReviewDoc", () => {
    const doc = "Summary.\n\n### a.ts:3-5 (Minor)\nBody one.\n\n### b.ts:9\nBody two.";
    const { summary, findings } = parseReviewDoc(doc);
    expect(serializeReviewDoc(summary, findings)).toBe(doc);
  });
});

describe("prFileLineUrl", () => {
  it("anchors on the sha256 of the path and the new-side line", async () => {
    // sha256("a") = ca978112…
    expect(await prFileLineUrl("https://github.com/o/r/pull/1", "a", 7)).toBe(
      "https://github.com/o/r/pull/1/files#diff-ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bbR7",
    );
  });
});
