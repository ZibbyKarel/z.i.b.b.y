import { describe, expect, it } from "vitest";
import { parseStageVerdict } from "./stage-verdict";

describe("parseStageVerdict", () => {
  it("parses each verdict value", () => {
    expect(parseStageVerdict("<verdict>pass</verdict>")).toBe("pass");
    expect(parseStageVerdict("<VERDICT> GAP </VERDICT>")).toBe("gap");
    expect(parseStageVerdict("<verdict>drift</verdict>")).toBe("drift");
  });

  it("uses the LAST tag when several are present (an agent may quote the instruction)", () => {
    const text = "Use one of <verdict>pass</verdict> … my call: <verdict>gap</verdict>";
    expect(parseStageVerdict(text)).toBe("gap");
  });

  it("returns null for a missing, empty, or unknown tag (caller fails closed)", () => {
    expect(parseStageVerdict("")).toBeNull();
    expect(parseStageVerdict("no tag at all")).toBeNull();
    expect(parseStageVerdict("<verdict>maybe</verdict>")).toBeNull();
  });
});
