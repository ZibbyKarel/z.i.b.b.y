import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ThemeToggle, ThemeToggleTestId } from "./ThemeToggle";

const setTheme = vi.fn();
let resolved: "light" | "dark" = "light";

vi.mock("../../../state/appearance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../state/appearance")>()),
  useAppearance: () => ({ theme: "system", setTheme, motion: "system", setMotion: vi.fn() }),
}));
vi.mock("@zibby/design-system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@zibby/design-system")>()),
  useResolvedTheme: () => resolved,
}));

describe("ThemeToggle", () => {
  beforeEach(() => setTheme.mockReset());

  it("in light mode offers dark (moon) and switches to dark", async () => {
    resolved = "light";
    renderWithProviders(<ThemeToggle />);
    const button = screen.getByTestId(ThemeToggleTestId.Trigger);
    expect(button).toHaveAccessibleName("Přepnout na tmavý režim");
    await userEvent.click(button);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("in dark mode (incl. system resolved dark) offers light (sun) and switches to light", async () => {
    resolved = "dark";
    renderWithProviders(<ThemeToggle />);
    const button = screen.getByTestId(ThemeToggleTestId.Trigger);
    expect(button).toHaveAccessibleName("Přepnout na světlý režim");
    await userEvent.click(button);
    expect(setTheme).toHaveBeenCalledWith("light");
  });
});
