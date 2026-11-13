import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { ChatDock, ChatDockTestId } from "./ChatDock";

const composer = <input aria-label="Message" />;

describe("ChatDock", () => {
  it("hides the root without unmounting when hidden", () => {
    const { rerender } = render(<ChatDock hidden composer={composer} />);
    expect(screen.getByTestId(ChatDockTestId.Root)).not.toBeVisible();
    rerender(<ChatDock composer={composer} />);
    expect(screen.getByTestId(ChatDockTestId.Root)).toBeVisible();
  });

  it("renders closed by default as only the round chat bubble", () => {
    render(
      <ChatDock
        composer={composer}
        launcherLabel="Otevřít chat"
        targetChip={<span>Dept: dev</span>}
      />,
    );
    expect(screen.getByTestId(ChatDockTestId.Launcher)).toHaveAccessibleName("Otevřít chat");
    expect(screen.getByTestId(ChatDockTestId.Launcher)).toHaveClass("rounded-full");
    expect(screen.queryByTestId(ChatDockTestId.Composer)).toBeNull();
    expect(screen.queryByTestId(ChatDockTestId.TargetChip)).toBeNull();
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
  });

  it("the bubble opens the full-size dock (uncontrolled)", async () => {
    const user = userEvent.setup();
    render(<ChatDock composer={composer} transcript={<div>Hi there</div>} />);
    await user.click(screen.getByTestId(ChatDockTestId.Launcher));
    expect(screen.getByTestId(ChatDockTestId.Transcript)).toHaveTextContent("Hi there");
    expect(screen.getByTestId(ChatDockTestId.Root)).toHaveClass("w-[max(420px,33%)]");
    expect(screen.queryByTestId(ChatDockTestId.Launcher)).toBeNull();
  });

  it("focuses the composer when the bubble opens the dock", async () => {
    const user = userEvent.setup();
    render(<ChatDock composer={composer} />);
    await user.click(screen.getByTestId(ChatDockTestId.Launcher));
    expect(screen.getByLabelText("Message")).toHaveFocus();
  });

  it("hidden dock shows neither the panel nor the bubble", () => {
    render(<ChatDock hidden composer={composer} />);
    expect(screen.getByTestId(ChatDockTestId.Launcher)).not.toBeVisible();
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
    await user.click(screen.getByTestId(ChatDockTestId.Launcher));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
    expect(screen.getByTestId(ChatDockTestId.Launcher)).toBeInTheDocument();
  });

  it("closing returns to the bubble", async () => {
    const user = userEvent.setup();
    render(<ChatDock defaultOpen composer={composer} />);
    await user.click(screen.getByTestId(ChatDockTestId.CloseButton));
    expect(screen.getByTestId(ChatDockTestId.Launcher)).toBeInTheDocument();
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

  it("renders headerStart in the header", () => {
    const { rerender } = render(
      <ChatDock defaultOpen composer={composer} headerStart={<span>pick</span>} />,
    );
    expect(
      within(screen.getByTestId(ChatDockTestId.Header)).getByTestId(ChatDockTestId.HeaderStart),
    ).toHaveTextContent("pick");
    rerender(<ChatDock defaultOpen composer={composer} />);
    expect(screen.queryByTestId(ChatDockTestId.HeaderStart)).toBeNull();
  });

  it("renders the target chip slot when provided", () => {
    render(<ChatDock defaultOpen composer={composer} targetChip={<span>Dept: dev</span>} />);
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

  describe("compact", () => {
    it("is only a round launcher while closed", () => {
      render(<ChatDock compact composer={composer} launcherLabel="Otevřít chat" />);
      expect(screen.getByTestId(ChatDockTestId.Launcher)).toHaveAccessibleName("Otevřít chat");
      expect(screen.queryByTestId(ChatDockTestId.Composer)).toBeNull();
      expect(screen.queryByTestId(ChatDockTestId.Transcript)).toBeNull();
    });

    it("launcher opens a full-screen panel; close and Esc close it", async () => {
      const user = userEvent.setup();
      render(
        <ChatDock
          compact
          composer={composer}
          sidebar={<div>History</div>}
          transcript={<div>Hi there</div>}
        />,
      );
      await user.click(screen.getByTestId(ChatDockTestId.Launcher));
      expect(screen.getByTestId(ChatDockTestId.Root)).toHaveClass("fixed", "inset-0");
      expect(screen.getByTestId(ChatDockTestId.Transcript)).toHaveTextContent("Hi there");
      expect(screen.getByLabelText("Message")).toBeInTheDocument();
      expect(screen.queryByTestId(ChatDockTestId.SidebarButton)).toBeNull();
      await user.click(screen.getByTestId(ChatDockTestId.CloseButton));
      expect(screen.getByTestId(ChatDockTestId.Launcher)).toBeInTheDocument();
      await user.click(screen.getByTestId(ChatDockTestId.Launcher));
      await user.keyboard("{Escape}");
      expect(screen.getByTestId(ChatDockTestId.Launcher)).toBeInTheDocument();
    });

    it("respects controlled open/onOpenChange", async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(<ChatDock compact composer={composer} onOpenChange={onOpenChange} open={false} />);
      await user.click(screen.getByTestId(ChatDockTestId.Launcher));
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(screen.getByTestId(ChatDockTestId.Launcher)).toBeInTheDocument();
    });
  });
});
