import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { HeaderPinButton, HeaderPinButtonTestId } from "./HeaderPinButton";

const { hooks } = vi.hoisted(() => ({
  hooks: {
    pinned: false,
    isPending: false,
    pinPage: vi.fn(),
    unpinPage: vi.fn(),
  },
}));

vi.mock("../usePagePins", () => ({
  usePagePins: () => ({
    pagePins: [],
    isPagePinned: () => hooks.pinned,
    pinPage: hooks.pinPage,
    unpinPage: hooks.unpinPage,
    isPending: hooks.isPending,
  }),
}));

describe("HeaderPinButton", () => {
  beforeEach(() => {
    hooks.pinned = false;
    hooks.isPending = false;
    hooks.pinPage.mockReset();
    hooks.unpinPage.mockReset();
  });

  it("pins the current href with a humanized default name in one click", async () => {
    render(<HeaderPinButton href="/work/tasks?status=failed" />);
    const button = screen.getByTestId(HeaderPinButtonTestId.Button);
    expect(button).toHaveAccessibleName("Připnout stránku do rychlého přístupu");
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(hooks.pinPage).toHaveBeenCalledWith("/work/tasks?status=failed", "Tasks");
    expect(hooks.unpinPage).not.toHaveBeenCalled();
  });

  it("shows the pinned state and unpins on click", async () => {
    hooks.pinned = true;
    render(<HeaderPinButton href="/work/tasks" />);
    const button = screen.getByTestId(HeaderPinButtonTestId.Button);
    expect(button).toHaveAccessibleName("Odepnout stránku z rychlého přístupu");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(hooks.unpinPage).toHaveBeenCalledWith("/work/tasks");
    expect(hooks.pinPage).not.toHaveBeenCalled();
  });

  it("ignores clicks while a pin change is in flight", async () => {
    hooks.isPending = true;
    render(<HeaderPinButton href="/work/tasks" />);
    await userEvent.click(screen.getByTestId(HeaderPinButtonTestId.Button));
    expect(hooks.pinPage).not.toHaveBeenCalled();
  });
});
