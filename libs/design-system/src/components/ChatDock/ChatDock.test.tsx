import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { ChatDock, ChatDockTestId } from "./ChatDock";

const composer = <input aria-label="Message" />;

describe("ChatDock", () => {
  it("renders collapsed by default: only the bar, no transcript", () => {
    render(<ChatDock composer={composer} />);
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
    expect(screen.getByTestId(ChatDockTestId.Composer)).toContainElement(
      screen.getByLabelText("Message"),
    );
  });

  it("opens when anything in the footer takes focus (uncontrolled)", async () => {
    const user = userEvent.setup();
    render(<ChatDock composer={composer} transcript={<div>Hi there</div>} />);
    await user.click(screen.getByLabelText("Message"));
    expect(screen.getByTestId(ChatDockTestId.Transcript)).toHaveTextContent("Hi there");
  });

  it("header has new chat + close; close closes", async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();
    render(
      <ChatDock defaultOpen composer={composer} onNewChat={onNewChat} transcript={<div>Hi</div>} />,
    );
    await user.click(screen.getByTestId(ChatDockTestId.NewChatButton));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId(ChatDockTestId.CloseButton));
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
  });

  it("close is an icon button with an accessible name; Esc closes an open dock", async () => {
    const user = userEvent.setup();
    render(<ChatDock defaultOpen closeLabel="Zavřít" composer={composer} />);
    expect(screen.getByTestId(ChatDockTestId.CloseButton)).toHaveAccessibleName("Zavřít");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
  });

  it("omits the new chat button without onNewChat", () => {
    render(<ChatDock defaultOpen composer={composer} />);
    expect(screen.queryByTestId(ChatDockTestId.NewChatButton)).toBeNull();
  });

  it("is controlled via open + onOpenChange", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ChatDock composer={composer} onOpenChange={onOpenChange} open={false} />);
    await user.click(screen.getByLabelText("Message"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
  });

  it("opens straight to the full-size dock — no mini state, no expand toggle", () => {
    render(<ChatDock defaultOpen composer={composer} />);
    expect(screen.getByTestId(ChatDockTestId.Root)).toHaveClass(
      "max-h-full",
      "min-h-3/4",
      "w-[max(420px,33%)]",
    );
    expect(screen.getByTestId(ChatDockTestId.Transcript)).toHaveClass("grow", "basis-[440px]");
    expect(screen.queryByTestId("chat-dock-expand-button")).toBeNull();
  });

  it("is only the 420px bar while closed", () => {
    render(<ChatDock composer={composer} />);
    expect(screen.getByTestId(ChatDockTestId.Root)).toHaveClass("w-[420px]");
  });

  it("renders the target chip slot when provided", () => {
    render(<ChatDock composer={composer} targetChip={<span>Dept: dev</span>} />);
    expect(screen.getByTestId(ChatDockTestId.TargetChip)).toHaveTextContent("Dept: dev");
  });

  it("sidebar toggle opens and closes the sidebar, widening the dock", async () => {
    const user = userEvent.setup();
    render(
      <ChatDock
        defaultOpen
        composer={composer}
        sidebar={<div>History</div>}
        sidebarLabel="Historie"
      />,
    );
    const toggle = screen.getByTestId(ChatDockTestId.SidebarButton);
    expect(toggle).toHaveAccessibleName("Historie");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId(ChatDockTestId.Sidebar)).toBeNull();

    await user.click(toggle);
    expect(screen.getByTestId(ChatDockTestId.Sidebar)).toHaveTextContent("History");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(ChatDockTestId.Root)).toHaveClass("w-[max(660px,45%)]", "flex-row");

    await user.click(toggle);
    expect(screen.queryByTestId(ChatDockTestId.Sidebar)).toBeNull();
    expect(screen.getByTestId(ChatDockTestId.Root)).toHaveClass("w-[max(420px,33%)]");
  });

  it("omits the sidebar toggle without a sidebar", () => {
    render(<ChatDock defaultOpen composer={composer} />);
    expect(screen.queryByTestId(ChatDockTestId.SidebarButton)).toBeNull();
  });
});
