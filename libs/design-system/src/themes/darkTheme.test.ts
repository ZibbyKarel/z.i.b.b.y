import { describe, expect, it } from "vitest";
import { darkTheme } from "./darkTheme";

describe("darkTheme ZibbyCorp alignment", () => {
  it("uses the ZibbyCorp tertiary ink for foreground-faint", () => {
    expect(darkTheme.colorForegroundFaint).toBe("#666c67");
    expect(darkTheme.colorInk3).toBe("#666c67");
  });

  it("carries no glass recipe (ZibbyCorp has no glass/blur, DS.md §1.2/§6)", () => {
    expect(Object.keys(darkTheme).some((k) => /glass/i.test(k))).toBe(false);
  });

  it("collapses border radius to 0 everywhere except the sanctioned round exceptions", () => {
    expect(darkTheme.radiusDefault).toBe("0px");
    expect(darkTheme.radiusSm).toBe("0px");
    expect(darkTheme.radiusMd).toBe("0px");
    expect(darkTheme.radiusLg).toBe("0px");
    expect(darkTheme.radiusFull).toBe("9999px");
  });

  it("glows only in dark (`--gw` non-zero)", () => {
    expect(darkTheme.glowWidth).toBe("8px");
  });

  it("maps the legacy tone vocabulary onto the new state colors (LEGACY_TONE_MAP)", () => {
    expect(darkTheme.colorAccent).toBe(darkTheme.colorStateThink);
    expect(darkTheme.colorOk).toBe(darkTheme.colorStateDone);
    expect(darkTheme.colorWarn).toBe(darkTheme.colorStateBlock);
    expect(darkTheme.colorDanger).toBe(darkTheme.colorStateErr);
    expect(darkTheme.colorRun).toBe(darkTheme.colorStateWork);
  });
});
