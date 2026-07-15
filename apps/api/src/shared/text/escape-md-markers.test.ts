import { describe, expect, it } from "vitest";
import { escapeAutoBoundaryMarkers } from "./escape-md-markers";

describe("escapeAutoBoundaryMarkers", () => {
  it("defangs a bare opening comment delimiter", () => {
    const out = escapeAutoBoundaryMarkers("hello <!-- world");
    expect(out).not.toContain("<!--");
    expect(out).toContain("‹!--");
  });

  it("defangs a bare closing comment delimiter", () => {
    const out = escapeAutoBoundaryMarkers("hello --> world");
    expect(out).not.toContain("-->");
    expect(out).toContain("--›");
  });

  it("defangs a full forged AUTO block marker", () => {
    const out = escapeAutoBoundaryMarkers("evil <!-- AUTO:GATES:END --> name");
    expect(out).not.toContain("<!-- AUTO:GATES:END -->");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("-->");
    expect(out).toContain("‹!-- AUTO:GATES:END --›");
  });

  it("defangs every occurrence when multiple markers are present", () => {
    const out = escapeAutoBoundaryMarkers("<!-- AUTO:A:END --><!-- AUTO:B:START -->");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("-->");
  });

  it("leaves a benign string with no comment delimiters unchanged", () => {
    const benign = "Kodér — writes the code, reviews diffs, and ships PRs.";
    expect(escapeAutoBoundaryMarkers(benign)).toBe(benign);
  });

  it("leaves ordinary markdown structure (headings, lists, wikilinks, backticks) untouched", () => {
    const md = "# Heading\n- a list item\n[[wikilink]]\n`code`\n---\nfrontmatter-ish line";
    expect(escapeAutoBoundaryMarkers(md)).toBe(md);
  });

  it("is idempotent: escaping an already-escaped string is a no-op", () => {
    const once = escapeAutoBoundaryMarkers("<!-- AUTO:GATES:END -->");
    const twice = escapeAutoBoundaryMarkers(once);
    expect(twice).toBe(once);
  });

  it("has no false positives on prose that merely mentions arrows or exclamation marks", () => {
    const prose = "Wow! -> this works great, no comments here.";
    expect(escapeAutoBoundaryMarkers(prose)).toBe(prose);
  });
});
