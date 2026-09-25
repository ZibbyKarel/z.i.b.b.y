import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "./DesignSystemProvider";
import { ThemeScript, ThemeScriptTestId, buildThemeScriptSource } from "./ThemeScript";

describe("buildThemeScriptSource", () => {
  it("reads the same localStorage key DesignSystemProvider writes", () => {
    const src = buildThemeScriptSource("dark");
    expect(src).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it("bakes in the given fallback for both the stored-value miss and the catch branch", () => {
    const src = buildThemeScriptSource("light");
    expect(src).toContain(':"light");');
    expect(src).toContain(',"light");}');
  });

  it("sets data-theme on the document element, defensively (try/catch)", () => {
    const src = buildThemeScriptSource("dark");
    expect(src).toContain('document.documentElement.setAttribute("data-theme"');
    expect(src).toContain("try{");
    expect(src).toContain("}catch(e){");
  });

  it("falls back to prefers-color-scheme before the static fallback", () => {
    const src = buildThemeScriptSource("dark");
    expect(src).toContain("prefers-color-scheme: dark");
  });
});

describe("ThemeScript", () => {
  it("renders a script tag carrying the built source, defaulting to dark", () => {
    render(<ThemeScript />);
    const script = screen.getByTestId(ThemeScriptTestId.Root);
    expect(script.tagName).toBe("SCRIPT");
    expect(script.innerHTML).toBe(buildThemeScriptSource("dark"));
  });

  it("honours an explicit fallback", () => {
    render(<ThemeScript fallback="light" />);
    const script = screen.getByTestId(ThemeScriptTestId.Root);
    expect(script.innerHTML).toBe(buildThemeScriptSource("light"));
  });
});
