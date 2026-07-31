import { describe, expect, it } from "vitest";
import { TOKEN_PROPS, mapValue, parseThemeTokens, proposeTokenName } from "./tokens.mjs";

const CSS = `
@theme {
  --zt-bg-base: #0b0e13;
  --zt-accent: #5b8def;
  --zt-space-3: 12px;
}
.not-a-theme { --zt-ignored: #fff; }
`;

describe("parseThemeTokens", () => {
  it("reads only declarations inside @theme", () => {
    const tokens = parseThemeTokens(CSS);
    expect(tokens.map((t) => t.name)).toEqual(["--zt-bg-base", "--zt-accent", "--zt-space-3"]);
  });
});

describe("mapValue", () => {
  const tokens = parseThemeTokens(CSS);

  it("returns an exact match for a colour already in the theme", () => {
    expect(mapValue("rgb(11, 14, 19)", tokens)).toEqual({ kind: "exact", token: "--zt-bg-base" });
  });

  it("returns an exact match for a length already in the theme", () => {
    expect(mapValue("12px", tokens)).toEqual({ kind: "exact", token: "--zt-space-3" });
  });

  it("proposes a new token and names the nearest existing one with its distance", () => {
    const mapping = mapValue("rgb(201, 212, 232)", tokens);
    expect(mapping.kind).toBe("new");
    expect(mapping.nearest).toBe("--zt-accent");
    expect(mapping.distance).toBeGreaterThan(2);
  });

  it("measures length distance in px", () => {
    const mapping = mapValue("18px", tokens);
    expect(mapping).toMatchObject({ kind: "new", nearest: "--zt-space-3", distance: 6 });
  });
});

describe("TOKEN_PROPS", () => {
  it("lists exactly the properties PROP_PREFIX maps, not the wider VALUE_PROPS set", () => {
    // Asserts the full array, not arrayContaining — arrayContaining passes
    // for any superset, which would let an accidental VALUE_PROPS entry
    // (e.g. "display") sneak back in unnoticed.
    expect(TOKEN_PROPS).toEqual([
      "color",
      "backgroundColor",
      "borderColor",
      "gap",
      "rowGap",
      "columnGap",
      "paddingTop",
      "paddingLeft",
      "borderRadius",
      "boxShadow",
      "fontSize",
      "lineHeight",
      "letterSpacing",
    ]);
  });
});

describe("proposeTokenName", () => {
  it("names by role and property, never by hex", () => {
    expect(proposeTokenName("text-secondary", "color")).toBe("--zt-fg-text-secondary");
    expect(proposeTokenName("card", "backgroundColor")).toBe("--zt-bg-card");
    expect(proposeTokenName("row", "gap")).toBe("--zt-space-row");
  });
});

// --- Review fix round 1 -----------------------------------------------------
// Findings demonstrated against the real libs/design-system/src/theme/globals.css
// (see .superpowers/sdd/2026-07-31-design-match/task-6-report.md, "Fix" section).
// These fixtures are inline, not the real theme file, per the standing rule that
// this module's tests never read from disk.

describe("mapValue — alpha (Critical finding 1)", () => {
  // Same RGB, different alpha — real tokens --color-surface-glass (0.5) and
  // --color-surface-panel (0.72) collapse to ΔE 0 without alpha in the mix.
  const ALPHA_CSS = `
@theme {
  --zt-surface-glass: rgba(16, 21, 28, 0.5);
  --zt-surface-panel: rgba(16, 21, 28, 0.72);
}
`;
  const tokens = parseThemeTokens(ALPHA_CSS);

  it("does not report a colour as exact for a same-RGB token with a different alpha, and picks the alpha-matching one", () => {
    const mapping = mapValue("rgba(16, 21, 28, 0.72)", tokens);
    expect(mapping).toEqual({ kind: "exact", token: "--zt-surface-panel" });
  });

  it("picks the other alpha-matching token when the query alpha flips", () => {
    const mapping = mapValue("rgba(16, 21, 28, 0.5)", tokens);
    expect(mapping).toEqual({ kind: "exact", token: "--zt-surface-glass" });
  });

  it("maps rgba(0, 0, 0, 0) to a transparent token, not the nearest near-black one", () => {
    const CSS = `
@theme {
  --zt-transparent: transparent;
  --zt-bg-deep: #090c11;
}
`;
    const transparentTokens = parseThemeTokens(CSS);
    const mapping = mapValue("rgba(0, 0, 0, 0)", transparentTokens);
    expect(mapping).toEqual({ kind: "exact", token: "--zt-transparent" });
  });
});

describe("mapValue — exactness on raw distance (Critical finding 2)", () => {
  const CSS = `
@theme {
  --zt-space-3: 12px;
}
`;
  const tokens = parseThemeTokens(CSS);

  it("does not classify a sub-rounding-step difference as exact", () => {
    // Raw distance is 0.03px — non-zero — but round(0.03) rounds to 0. Exactness
    // must be decided before rounding.
    const mapping = mapValue("12.03px", tokens);
    expect(mapping.kind).toBe("new");
    expect(mapping.nearest).toBe("--zt-space-3");
    expect(mapping.distance).toBe(0);
  });
});

describe("mapValue — rem/em length units (Important finding 3)", () => {
  it("finds a rem-defined token as a candidate for a px measurement, with a correct px distance", () => {
    const CSS = `
@theme {
  --zt-text-xs: 0.6875rem;
}
`;
    const tokens = parseThemeTokens(CSS);
    // 0.6875rem * 16 = 11px; measured 12px → distance 1.
    const mapping = mapValue("12px", tokens);
    expect(mapping).toMatchObject({ kind: "new", nearest: "--zt-text-xs", distance: 1 });
  });

  it("still yields no length candidate for an em-defined token", () => {
    const CSS = `
@theme {
  --zt-tracking-body: 0.02em;
}
`;
    const tokens = parseThemeTokens(CSS);
    const mapping = mapValue("12px", tokens);
    expect(mapping).toEqual({ kind: "new", nearest: null, distance: null, proposedName: null });
  });
});

describe("parseThemeTokens — comments (Important finding 4)", () => {
  it("does not pick up a commented-out token declaration", () => {
    const CSS = `
@theme {
  --zt-accent: #5b8def;
  /*
  deprecated, keep for reference:
  --zt-old-accent: #ff0000;
  */
}
`;
    const tokens = parseThemeTokens(CSS);
    expect(tokens.map((t) => t.name)).toEqual(["--zt-accent"]);
  });
});
