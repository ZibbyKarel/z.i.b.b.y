import { describe, expect, it } from "vitest";
import { stateToneHex } from "../stateTone";
import { darkTheme } from "./darkTheme";
import { lightTheme } from "./lightTheme";

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

  it("running is purple, done is green", () => {
    expect(darkTheme.colorStateWork).toBe("oklch(0.78 0.14 300)");
    expect(darkTheme.colorStateDone).toBe("oklch(0.82 0.17 160)");
    expect(lightTheme.colorStateWork).toBe("oklch(0.56 0.15 300)");
    expect(lightTheme.colorStateDone).toBe("oklch(0.6 0.14 160)");
    expect(stateToneHex).toMatchObject({ working: "#c58ef0", done: "#4ce0a0" });
  });
});
