import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ChatToolDock, ChatToolDockTestId } from "./ChatToolDock";

describe("ChatToolDock", () => {
  it("links each tool to its HUD route, companies to /companies", () => {
    const { getByTestId } = renderWithProviders(<ChatToolDock />);
    expect(getByTestId(ChatToolDockTestId.Root)).toBeInTheDocument();
    expect(getByTestId("chat-tool-dock-companies")).toHaveAttribute("href", "/companies");
    expect(getByTestId("chat-tool-dock-agents")).toHaveAttribute("href", "/agents");
    expect(getByTestId(ChatToolDockTestId.Settings)).toHaveAttribute("href", "/settings");
  });

  it("wraps the links in a labelled navigation landmark", () => {
    const { getByTestId } = renderWithProviders(<ChatToolDock />);
    // Select by testid (repo rule); role/ARIA as assertions only. The aria-label reads
    // chat.toolDock.label (renders as the key path until Task 7 lands the copy —
    // assert presence, not copy).
    const nav = getByTestId(ChatToolDockTestId.Nav);
    expect(nav).toHaveRole("navigation");
    expect(nav).toHaveAttribute("aria-label");
  });
});
