import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ChatTopBar, ChatTopBarTestId } from "./ChatTopBar";

describe("ChatTopBar", () => {
  it("renders the glass top bar with search, lang and clock, and no close button", () => {
    const { getByTestId, queryByTestId } = renderWithProviders(
      <ChatTopBar mode="idle" onOpenPalette={vi.fn()} />,
    );
    expect(getByTestId(ChatTopBarTestId.Root)).toBeInTheDocument();
    expect(getByTestId(ChatTopBarTestId.Search)).toBeInTheDocument();
    expect(getByTestId(ChatTopBarTestId.Lang)).toBeInTheDocument();
    expect(getByTestId(ChatTopBarTestId.Clock)).toBeInTheDocument();
    // Close button was removed from the top bar this phase.
    expect(queryByTestId("chat-screen-close")).toBeNull();
  });
});
