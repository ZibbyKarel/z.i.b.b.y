import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BRIDGE_DENSITY, DENSITIES, DENSITY_SCALE, spacingToVar, spacingValues } from "../tokens";
import { DENSITY_STORAGE_KEY, DesignSystemProvider } from "./DesignSystemProvider";
import { buildThemeScriptSource } from "./ThemeScript";

const css = readFileSync(join(__dirname, "../theme/globals.css"), "utf8");

/** The declarations of one `[data-density="<d>"] { … }` block. */
function densityBlock(d: string): string {
  const m = css.match(new RegExp(`\\[data-density="${d}"\\]\\s*\\{([^}]*)\\}`));
  if (!m?.[1]) throw new Error(`no [data-density="${d}"] block`);
  return m[1];
}

function cssVar(block: string, name: string): string | undefined {
  return block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
}

describe("density tokens", () => {
  it.each(DENSITIES)("globals.css %s block matches DENSITY_SCALE + BRIDGE_DENSITY", (d) => {
    const block = densityBlock(d);
    expect(Number(cssVar(block, "--density"))).toBe(DENSITY_SCALE[d]);
    expect(cssVar(block, "--bridge-gap")).toBe(`${BRIDGE_DENSITY[d].gap}px`);
    expect(cssVar(block, "--bridge-rh")).toBe(`${BRIDGE_DENSITY[d].rowHeight}px`);
    expect(cssVar(block, "--bridge-bp")).toBe(`${BRIDGE_DENSITY[d].boardPad}px`);
  });

  it("defines a --sp-* var for every spacing token, scaled by --density", () => {
    for (const [token, px] of Object.entries(spacingValues)) {
      const decl = css.match(new RegExp(`--sp-${token}:\\s*([^;]+);`))?.[1];
      expect(decl, token).toBe(token === "0" ? "0px" : `calc(${px} * var(--density))`);
    }
    expect(spacingToVar("200")).toBe("var(--sp-200)");
  });
});

describe("DesignSystemProvider density", () => {
  it("sets data-density on its root and <html>", () => {
    const { container } = render(<DesignSystemProvider density="airy">x</DesignSystemProvider>);
    expect(container.firstElementChild).toHaveAttribute("data-density", "airy");
    expect(document.documentElement).toHaveAttribute("data-density", "airy");
  });

  it("without a density leaves <html> alone (pre-hydration value survives)", () => {
    document.documentElement.setAttribute("data-density", "open");
    const { container } = render(<DesignSystemProvider>x</DesignSystemProvider>);
    expect(container.firstElementChild).not.toHaveAttribute("data-density");
    expect(document.documentElement).toHaveAttribute("data-density", "open");
  });

  it("applies and caches an explicit density", () => {
    render(<DesignSystemProvider density="compact">x</DesignSystemProvider>);
    expect(document.documentElement).toHaveAttribute("data-density", "compact");
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe("compact");
  });
});

describe("ThemeScript density pass", () => {
  it("reads the cached density, validates it, and falls back", () => {
    const src = buildThemeScriptSource("light", "airy");
    expect(src).toContain(JSON.stringify(DENSITY_STORAGE_KEY));
    expect(src).toContain(JSON.stringify(DENSITIES));
    expect(src).toContain('?d:"airy"');
  });

  it("runs: cached value wins, garbage falls back", () => {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, "open");
    new Function(buildThemeScriptSource("light", "airy"))();
    expect(document.documentElement).toHaveAttribute("data-density", "open");
    window.localStorage.setItem(DENSITY_STORAGE_KEY, "huge");
    new Function(buildThemeScriptSource("light", "airy"))();
    expect(document.documentElement).toHaveAttribute("data-density", "airy");
  });
});
