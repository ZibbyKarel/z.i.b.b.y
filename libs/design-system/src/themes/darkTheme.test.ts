import { describe, expect, it } from "vitest";
import { darkTheme } from "./darkTheme";

describe("darkTheme ZT alignment", () => {
  it("uses the ZT tertiary ink for foreground-faint", () => {
    expect(darkTheme.colorForegroundFaint).toBe("#66737f");
  });

  it("exposes the VD glass recipe tokens", () => {
    expect(darkTheme.gradientGlass).toBe(
      "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 40%, rgba(16,21,28,0.5))",
    );
    expect(darkTheme.colorGlassBorder).toBe("rgba(255,255,255,0.12)");
    expect(darkTheme.shadowGlass).toBe(
      "inset 0 1px 0 rgba(255,255,255,0.13), 0 16px 40px rgba(0,0,0,0.42)",
    );
    expect(darkTheme.blurGlass).toBe("blur(22px) saturate(180%)");
  });
});
