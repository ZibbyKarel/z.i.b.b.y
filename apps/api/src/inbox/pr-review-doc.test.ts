import { describe, expect, it } from "vitest";
import { foldComments, parsePrReviewDoc } from "./pr-review-doc";

const DOC = [
  "Reviewed abc1234. Tests didn't run, no DB locally.",
  "",
  "One general thing: the PR has no migration rollback.",
  "",
  "### src/a.ts:42 (Important)",
  "This writes every column, so a status change gets overwritten. Can we write only the profile columns?",
  "",
  "### `src/b.ts:10-14` (Minor)",
  "Nit: this loop could be a `find`.",
  "",
  "### Notes without a line",
  "Kept in the summary.",
].join("\n");

describe("parsePrReviewDoc", () => {
  it("splits the summary from per-line comments and drops the severity", () => {
    const { summary, comments } = parsePrReviewDoc(DOC);
    expect(comments).toEqual([
      {
        path: "src/a.ts",
        line: 42,
        body: "This writes every column, so a status change gets overwritten. Can we write only the profile columns?",
      },
      { path: "src/b.ts", line: 14, startLine: 10, body: "Nit: this loop could be a `find`." },
    ]);
    expect(summary).toContain("Reviewed abc1234.");
    expect(summary).toContain("no migration rollback");
    expect(summary).toContain("### Notes without a line\nKept in the summary.");
    expect(summary).not.toContain("src/a.ts:42");
  });

  it("a doc without blocks is all summary", () => {
    expect(parsePrReviewDoc("Looks good, thanks!")).toEqual({
      summary: "Looks good, thanks!",
      comments: [],
    });
  });

  it("an empty block body is dropped; a reversed range is a single line", () => {
    const { comments } = parsePrReviewDoc("Hi\n\n### a.ts:3\n\n### a.ts:9-5 (Minor)\nx");
    expect(comments).toEqual([{ path: "a.ts", line: 9, body: "x" }]);
  });
});

describe("foldComments", () => {
  it("puts the comments back into one body", () => {
    expect(foldComments("Sum.", [{ path: "a.ts", line: 4, startLine: 2, body: "Fix." }])).toBe(
      "Sum.\n\n`a.ts:2-4` Fix.",
    );
  });
});
