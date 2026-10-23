import { describe, expect, it } from "vitest";
import { stateToneHex } from "../stateTone";
import { darkTheme } from "./darkTheme";
import { lightTheme } from "./lightTheme";

describe("Zibby 2.0 theme alignment", () => {
  it("maps the design's text-2 onto foreground-faint", () => {
    expect(darkTheme.colorForegroundFaint).toBe("#7a8090");
    expect(darkTheme.colorInk3).toBe("#7a8090");
  });

  it("carries no glass recipe", () => {
    expect(Object.keys(darkTheme).some((k) => /glass/i.test(k))).toBe(false);
  });

  it("uses the design's soft radii in both themes", () => {
    for (const theme of [darkTheme, lightTheme]) {
      expect(theme.radiusDefault).toBe("10px");
      expect(theme.radiusSm).toBe("6px");
      expect(theme.radiusFull).toBe("9999px");
    }
  });

  it("glows only in dark (`--gw` non-zero)", () => {
    expect(darkTheme.glowWidth).toBe("8px");
    expect(lightTheme.glowWidth).toBe("0px");
  });

  it("maps the legacy tone vocabulary onto the state colors (LEGACY_TONE_MAP)", () => {
    for (const theme of [darkTheme, lightTheme]) {
      expect(theme.colorOk).toBe(theme.colorStateDone);
      expect(theme.colorWarn).toBe(theme.colorStateBlock);
      expect(theme.colorDanger).toBe(theme.colorStateErr);
      expect(theme.colorRun).toBe(theme.colorStateWork);
    }
  });

  it("running is violet, done is emerald, and the hex fallbacks mirror dark", () => {
    expect(darkTheme.colorStateWork).toBe("#a78bfa");
    expect(darkTheme.colorStateDone).toBe("#10b981");
    expect(lightTheme.colorStateWork).toBe("#7c3aed");
    expect(lightTheme.colorStateDone).toBe("#059669");
    expect(stateToneHex).toMatchObject({
      working: darkTheme.colorStateWork,
      thinking: darkTheme.colorStateThink,
      blocked: darkTheme.colorStateBlock,
      error: darkTheme.colorStateErr,
      done: darkTheme.colorStateDone,
      idle: darkTheme.colorStateIdle,
    });
  });
});
