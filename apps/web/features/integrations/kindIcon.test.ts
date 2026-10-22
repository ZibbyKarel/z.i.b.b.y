import { describe, expect, it } from "vitest";
import { sourceIcon } from "./kindIcon";

describe("sourceIcon", () => {
  it("jira gets its logo, github and manual only a glyph", () => {
    expect(sourceIcon("jira")).toEqual({ glyph: "checkpoint", src: "/logos/jira.svg" });
    expect(sourceIcon("github")).toEqual({ glyph: "branch" });
    expect(sourceIcon("manual")).toEqual({ glyph: "edit" });
  });
});
