import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatTopBar, ChatTopBarTestId } from "./ChatTopBar";

describe("ChatTopBar", () => {
  it("renders the glass bar with the status, search, limits and lang elements", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    expect(screen.getByTestId(ChatTopBarTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Search)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
  });

  it("has no mode sign, mode dot or clock (removed for 1:1)", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    expect(screen.queryByTestId("chat-top-bar-mode")).toBeNull();
    expect(screen.queryByTestId("chat-screen-mode-dot")).toBeNull();
    expect(screen.queryByTestId("chat-top-bar-clock")).toBeNull();
  });

  // F9/O7: the topbar used to carry a fifth element, a "switch to HUD" icon,
  // pointing at `/chat` (its own page) once `/overview` was deleted in F8d —
  // a control that navigates to the page you're already on. The operator's
  // call: remove it outright rather than leave a broken affordance.
  it("has no HUD-switch element — four elements, not five (O7)", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    expect(screen.queryByTestId("chat-top-bar-hud")).toBeNull();
    expect(screen.getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
  });
});
