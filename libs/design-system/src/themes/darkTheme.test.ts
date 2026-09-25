import { describe, expect, it } from "vitest";
import { darkTheme } from "./darkTheme";

describe("darkTheme ZibbyCorp alignment", () => {
  it("uses the ZibbyCorp tertiary ink for foreground-faint", () => {
    expect(darkTheme.colorForegroundFaint).toBe("#666c67");
    expect(darkTheme.colorInk3).toBe("#666c67");
  });

  it("flattens the VD glass recipe to a solid panel — no blur, no shadow", () => {
    expect(darkTheme.gradientGlass).toBe("var(--color-panel)");
    expect(darkTheme.colorGlassBorder).toBe("var(--color-line-2)");
    expect(darkTheme.shadowGlass).toBe("none");
    expect(darkTheme.blurGlass).toBe("none");
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
