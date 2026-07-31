import { describe, expect, it } from "vitest";
import { mapValue, parseThemeTokens, proposeTokenName } from "./tokens.mjs";

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

describe("proposeTokenName", () => {
  it("names by role and property, never by hex", () => {
    expect(proposeTokenName("text-secondary", "color")).toBe("--zt-fg-text-secondary");
    expect(proposeTokenName("card", "backgroundColor")).toBe("--zt-bg-card");
    expect(proposeTokenName("row", "gap")).toBe("--zt-space-row");
  });
});
