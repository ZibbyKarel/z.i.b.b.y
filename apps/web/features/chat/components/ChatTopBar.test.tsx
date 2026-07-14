import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "../../../test/render";
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

  it("renders the HUD switch and the language selector", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    expect(screen.getByTestId(ChatTopBarTestId.Hud)).toBeInTheDocument();
    expect(screen.getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
  });

  it("points the HUD switch at the overview route", () => {
    renderWithProviders(<ChatTopBar onOpenPalette={vi.fn()} />);
    const link = within(screen.getByTestId(ChatTopBarTestId.Hud)).getByRole("link");
    expect(link).toHaveAttribute("href", "/overview");
  });
});
