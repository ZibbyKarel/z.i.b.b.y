import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ChatAbout } from "@zibby/contracts";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatProvider, useChat } from "../ChatContext";
import { ChatAboutButton, ChatAboutButtonTestId } from "./ChatAboutButton";

const about: ChatAbout = { kind: "pr", id: "u", label: "PR #1" };

function Probe() {
  const { dockOpen, about: current } = useChat();
  return <span data-testid="probe">{`${dockOpen}:${current?.id ?? "none"}`}</span>;
}

describe("ChatAboutButton", () => {
  it("opens the dock about the item", async () => {
    renderWithProviders(
      <ChatProvider>
        <ChatAboutButton about={about} />
        <Probe />
      </ChatProvider>,
    );
    const button = screen.getByTestId(ChatAboutButtonTestId.Root);
    expect(button).toHaveAccessibleName("Probrat v chatu");
    expect(button).toHaveAttribute("title", "Otevřít chat s touto věcí jako kontextem");
    await userEvent.setup().click(button);
    expect(screen.getByTestId("probe")).toHaveTextContent("true:u");
  });

  it("label overrides the visible text", () => {
    renderWithProviders(
      <ChatProvider>
        <ChatAboutButton about={about} label="Zeptat se" />
      </ChatProvider>,
    );
    expect(screen.getByTestId(ChatAboutButtonTestId.Root)).toHaveTextContent("Zeptat se");
  });

  it("renders nothing without a ChatProvider", () => {
    renderWithProviders(<ChatAboutButton about={about} />);
    expect(screen.queryByTestId(ChatAboutButtonTestId.Root)).toBeNull();
  });
});
