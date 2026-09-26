import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppearanceProvider, useAppearance } from "./appearance";

function Probe() {
  const { theme, setTheme, motion, setMotion } = useAppearance();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="motion">{motion}</span>
      <button onClick={() => setTheme("dark")} type="button">
        set-dark
      </button>
      <button onClick={() => setMotion("reduced")} type="button">
        set-reduced
      </button>
    </div>
  );
}

describe("AppearanceProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-motion");
  });
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-motion");
  });

  it("defaults to system theme and system motion with no stored preference", () => {
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("motion")).toHaveTextContent("system");
    expect(document.documentElement).not.toHaveAttribute("data-motion");
  });

  it("reads a previously persisted theme choice", async () => {
    // Deliberately seeded post-mount, not read into the first render: the
    // initial render always starts at "system" (the SSR-safe default) so the
    // client's hydration render matches the server's; the real stored choice
    // is adopted right after, in a mount effect — hence `waitFor` here.
    window.localStorage.setItem("zibby-theme", "dark");
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("dark"));
  });

  it("setMotion('reduced') persists and sets data-motion on <html>", () => {
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    act(() => screen.getByText("set-reduced").click());
    expect(screen.getByTestId("motion")).toHaveTextContent("reduced");
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
    expect(window.localStorage.getItem("zibby-motion")).toBe("reduced");
  });

  it("setTheme('dark') updates the resolved theme", () => {
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    act(() => screen.getByText("set-dark").click());
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });
});
