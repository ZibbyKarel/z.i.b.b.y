import { renderWithProviders as render, screen } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PinButton } from "./PinButton";

const { hooks } = vi.hoisted(() => ({
  hooks: { isPinned: vi.fn(), toggle: vi.fn(), isPending: false },
}));
vi.mock("../usePinToggle", () => ({
  usePinToggle: () => ({
    isPinned: hooks.isPinned,
    toggle: hooks.toggle,
    isPending: hooks.isPending,
    pins: [],
  }),
}));

describe("PinButton", () => {
  beforeEach(() => {
    hooks.isPinned.mockReset();
    hooks.toggle.mockReset();
  });

  it("labels an unpinned target 'Připnout' and toggles it on click", async () => {
    hooks.isPinned.mockReturnValue(false);
    render(<PinButton id="researcher" kind="agent" />);
    expect(screen.getByText("Připnout")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(hooks.toggle).toHaveBeenCalledWith("agent", "researcher");
  });

  it("labels a pinned target 'Odepnout' and toggles it on click", async () => {
    hooks.isPinned.mockReturnValue(true);
    render(<PinButton id="delivery" kind="pipeline" />);
    expect(screen.getByText("Odepnout")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(hooks.toggle).toHaveBeenCalledWith("pipeline", "delivery");
  });
});
